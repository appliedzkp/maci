import {
    maciContractAbi,
} from 'maci-contracts'

import {
    PubKey,
    PrivKey,
    Keypair,
    Command,
    VoteLeaf,
} from 'maci-domainobjs'

import {
    bigInt,
    genRandomSalt,
} from 'maci-crypto'

import {
    promptPwd,
    validateEthSk,
    validateEthAddress,
    validateSaltSize,
    validateSaltFormat,
    contractExists,
    checkDeployerProviderConnection,
} from './utils'

import * as ethers from 'ethers'

import {
    DEFAULT_ETH_PROVIDER,
} from './defaults'

const DEFAULT_SALT = genRandomSalt()

const configureSubparser = (subparsers: any) => {
    const parser = subparsers.addParser(
        'publish',
        { addHelp: true },
    )

    parser.addArgument(
        ['-e', '--eth-provider'],
        {
            action: 'store',
            type: 'string',
            help: `A connection string to an Ethereum provider. Default: ${DEFAULT_ETH_PROVIDER}`,
        }
    )

    parser.addArgument(
        ['-p', '--pubkey'],
        {
            required: true,
            type: 'string',
            help: 'The MACI public key which should replace the user\'s public key in the state tree',
        }
    )

    parser.addArgument(
        ['-x', '--contract'],
        {
            required: true,
            type: 'string',
            help: 'The MACI contract address',
        }
    )

    const maciPrivkeyGroup = parser.addMutuallyExclusiveGroup({ required: true })

    maciPrivkeyGroup.addArgument(
        ['-dsk', '--prompt-for-maci-privkey'],
        {
            action: 'storeTrue',
            help: 'Whether to prompt for your serialized MACI private key',
        }
    )

    maciPrivkeyGroup.addArgument(
        ['-sk', '--privkey'],
        {
            action: 'store',
            type: 'string',
            help: 'Your serialized MACI private key',
        }
    )

    const ethPrivkeyGroup = parser.addMutuallyExclusiveGroup({ required: true })

    ethPrivkeyGroup.addArgument(
        ['-dp', '--prompt-for-eth-privkey'],
        {
            action: 'storeTrue',
            help: 'Whether to prompt for the user\'s Ethereum private key and ignore -d / --eth-privkey',
        }
    )

    ethPrivkeyGroup.addArgument(
        ['-d', '--eth-privkey'],
        {
            action: 'store',
            type: 'string',
            help: 'The deployer\'s Ethereum private key',
        }
    )

    parser.addArgument(
        ['-i', '--state-index'],
        {
            required: true,
            action: 'store',
            type: 'int',
            help: 'The user\'s state index',
        }
    )

    parser.addArgument(
        ['-vi', '--vote-option-index'],
        {
            required: true,
            action: 'store',
            type: 'int',
            help: 'The vote option index',
        }
    )

    parser.addArgument(
        ['-w', '--pos-vote-weight'],
        {
            required: true,
            action: 'store',
            type: 'int',
            help: 'The positive vote weight',
        }
    )

    parser.addArgument(
        ['-v', '--neg-vote-weight'],
        {
            required: true,
            action: 'store',
            type: 'int',
            help: 'The negative vote weight',
        }
    )

    parser.addArgument(
        ['-n', '--nonce'],
        {
            required: true,
            action: 'store',
            type: 'int',
            help: 'The message nonce',
        }
    )

    parser.addArgument(
        ['-s', '--salt'],
        {
            action: 'store',
            type: 'string',
            help: 'The message salt',
        }
    )
}

const publish = async (args: any) => {
    // User's MACI public key
    if (!PubKey.isValidSerializedPubKey(args.pubkey)) {
        console.error('Error: invalid MACI public key')
        return
    }

    const userMaciPubKey = PubKey.unserialize(args.pubkey)

    // MACI contract
    if (!validateEthAddress(args.contract)) {
        console.error('Error: invalid MACI contract address')
        return
    }

    const maciAddress = args.contract

    // Ethereum provider
    const ethProvider = args.eth_provider ? args.eth_provider : DEFAULT_ETH_PROVIDER

    let ethSk
    // The deployer's Ethereum private key
    // The user may either enter it as a command-line option or via the
    // standard input
    if (args.prompt_for_eth_privkey) {
        ethSk = await promptPwd('Your Ethereum private key')
    } else {
        ethSk = args.eth_privkey
    }

    if (ethSk.startsWith('0x')) {
        ethSk = ethSk.slice(2)
    }

    if (!validateEthSk(ethSk)) {
        console.error('Error: invalid Ethereum private key')
        return
    }

    // The user's MACI private key
    let serializedPrivkey
    if (args.prompt_for_maci_privkey) {
        serializedPrivkey = await promptPwd('Your MACI private key')
    } else {
        serializedPrivkey = args.privkey
    }

    if (!PrivKey.isValidSerializedPrivKey(serializedPrivkey)) {
        console.error('Error: invalid MACI private key')
        return
    }

    const userMaciPrivkey = PrivKey.unserialize(serializedPrivkey)
    
    // State index
    const stateIndex = bigInt(args.state_index)
    if (stateIndex < 0) {
        console.error('Error: the state index must be greater than 0')
        return
    }

    // Vote option index
    const voteOptionIndex = bigInt(args.vote_option_index)

    if (voteOptionIndex < 0) {
        console.error('Error: the vote option index should be 0 or greater')
        return
    }

    // The nonce
    const nonce = bigInt(args.nonce)

    if (nonce < 0) {
        console.error('Error: the nonce should be 0 or greater')
        return
    }

    // The salt
    let salt
    if (args.salt) {
        if (!validateSaltFormat(args.salt)) {
            console.error('Error: the salt should be a 32-byte hexadecimal string')
            return
        }

        salt = bigInt(args.salt)

        if (!validateSaltSize(args.salt)) {
            console.error('Error: the salt should less than the BabyJub field size')
            return
        }
    } else {
        salt = DEFAULT_SALT
    }

    if (! (await checkDeployerProviderConnection(ethSk, ethProvider))) {
        console.error('Error: unable to connect to the Ethereum provider at', ethProvider)
        return
    }

    const provider = new ethers.providers.JsonRpcProvider(ethProvider)

    if (! (await contractExists(provider, maciAddress))) {
        console.error('Error: there is no contract deployed at the specified address')
        return
    }

    const wallet = new ethers.Wallet(ethSk, provider)
    const maciContract = new ethers.Contract(
        maciAddress,
        maciContractAbi,
        wallet,
    )

    // Validate the state index against the number of signups on-chain
    const numSignUps = (await maciContract.numSignUps()).toNumber()
    if (numSignUps < stateIndex) {
        console.error('Error: the state index is invalid')
        return
    }

    // Validate the vote option index against the max leaf index on-chain
    const maxVoteOptions = (await maciContract.voteOptionsMaxLeafIndex()).toNumber()
    if (maxVoteOptions < voteOptionIndex) {
        console.error('Error: the vote option index is invalid')
        return
    }

    // The new vote weight
    const posVoteWeight = bigInt(args.pos_vote_weight)

    if (! VoteLeaf.isWithinRange(posVoteWeight)) {
        console.error('Error: the positive vote weight is too large')
        return
    }

    const negVoteWeight = bigInt(args.neg_vote_weight)

    if (! VoteLeaf.isWithinRange(negVoteWeight)) {
        console.error('Error: the negative vote weight is too large')
        return
    }

    const coordinatorPubKeyOnChain = await maciContract.coordinatorPubKey()
    const coordinatorPubKey = new PubKey([
        bigInt(coordinatorPubKeyOnChain.x.toString()),
        bigInt(coordinatorPubKeyOnChain.y.toString()),
    ])

    const encKeypair = new Keypair()

    const command = new Command(
        stateIndex,
        userMaciPubKey,
        voteOptionIndex,
        new VoteLeaf(posVoteWeight, negVoteWeight),
        nonce,
        salt,
    )
    const signature = command.sign(userMaciPrivkey)
    const message = command.encrypt(
        signature,
        Keypair.genEcdhSharedKey(
            encKeypair.privKey,
            coordinatorPubKey,
        )
    )

    let tx
    try {
        tx = await maciContract.publishMessage(
            message.asContractParam(),
            encKeypair.pubKey.asContractParam(),
            { gasLimit: 1000000 }
        )

        console.log('Transaction hash:', tx.hash)
        console.log('Ephemeral private key:', encKeypair.privKey.serialize())
    } catch(e) {
        console.error('Error: the transaction failed')
        if (e.message) {
            console.error(e.message)
        }
        return
    }
    await tx.wait()
}

export {
    publish,
    configureSubparser,
}
