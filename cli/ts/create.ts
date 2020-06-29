
import {
    genJsonRpcDeployer,
    deployMaci,
    deployConstantInitialVoiceCreditProxy,
    deployFreeForAllSignUpGatekeeper,
} from 'maci-contracts'

import {
    PrivKey,
    Keypair,
} from 'maci-domainobjs'


import {
    promptPwd,
    validateEthSk,
    calcBinaryTreeDepthFromMaxLeaves,
    calcQuinTreeDepthFromMaxLeaves,
    checkDeployerProviderConnection,
} from './utils'

import {
    DEFAULT_ETH_PROVIDER,
    DEFAULT_MAX_USERS,
    DEFAULT_MAX_MESSAGES,
    DEFAULT_MAX_VOTE_OPTIONS,
    DEFAULT_SIGNUP_DURATION,
    DEFAULT_VOTING_DURATION,
    DEFAULT_INITIAL_VOICE_CREDITS,
    DEFAULT_MESSAGE_BATCH_SIZE,
    DEFAULT_TALLY_BATCH_SIZE,
} from './defaults'

const configureSubparser = (subparsers: any) => {
    const createParser = subparsers.addParser(
        'create',
        { addHelp: true },
    )

    const deployerPrivkeyGroup = createParser.addMutuallyExclusiveGroup({ required: true })

    deployerPrivkeyGroup.addArgument(
        ['-dp', '--prompt-for-deployer-privkey'],
        {
            action: 'storeTrue',
            help: 'Whether to prompt for the deployer\'s Ethereum private key and ignore -d / --deployer-privkey',
        }
    )

    deployerPrivkeyGroup.addArgument(
        ['-d', '--deployer-privkey'],
        {
            action: 'store',
            type: 'string',
            help: 'The deployer\'s Ethereum private key',
        }
    )


    const coordinatorPrivkeyGroup = createParser.addMutuallyExclusiveGroup({ required: true })

    coordinatorPrivkeyGroup.addArgument(
        ['-dsk', '--prompt-for-maci-privkey'],
        {
            action: 'storeTrue',
            help: 'Whether to prompt for the coordinator\'s serialized MACI private key',
        }
    )

    coordinatorPrivkeyGroup.addArgument(
        ['-sk', '--privkey'],
        {
            action: 'store',
            type: 'string',
            help: 'The coordinator\'s serialized MACI private key',
        }
    )

    createParser.addArgument(
        ['-e', '--eth-provider'],
        {
            action: 'store',
            type: 'string',
            help: 'A connection string to an Ethereum provider. Default: http://localhost:8545',
        }
    )

    createParser.addArgument(
        ['-u', '--max-users'],
        {
            action: 'store',
            type: 'int',
            help: 'The maximum supported number of users. It must be one less than a power of 5. Default: 24',
        }
    )

    createParser.addArgument(
        ['-m', '--max-messages'],
        {
            action: 'store',
            type: 'int',
            help: 'The maximum supported number of messages. It must be one less than a power of 5. Default: 24',
        }
    )

    createParser.addArgument(
        ['-v', '--max-vote-options'],
        {
            action: 'store',
            type: 'int',
            help: 'The maximum supported number of vote options. It must be one less than a power of 5. Default: 15',
        }
    )

    createParser.addArgument(
        ['-s', '--signup-duration'],
        {
            action: 'store',
            type: 'int',
            help: 'The sign-up duration in seconds. Default: 3600',
        }
    )

    createParser.addArgument(
        ['-o', '--voting-duration'],
        {
            action: 'store',
            type: 'int',
            help: 'The voting duration in seconds. Default: 3600',
        }
    )

    createParser.addArgument(
        ['-bm', '--message-batch-size'],
        {
            action: 'store',
            type: 'int',
            help: 'The batch size for processing messages',
        }
    )

    createParser.addArgument(
        ['-bv', '--tally-batch-size'],
        {
            action: 'store',
            type: 'int',
            help: 'The batch size for tallying votes',
        }
    )

    const vcGroup = createParser.addMutuallyExclusiveGroup()

    vcGroup.addArgument(
        ['-c', '--initial-voice-credits'],
        {
            action: 'store',
            type: 'int',
            help: 'Each user\'s initial voice credits. Default: 100',
        }
    )

    vcGroup.addArgument(
        ['-i', '--initial-vc-proxy'],
        {
            action: 'store',
            type: 'string',
            help: 'If specified, deploys the MACI contract with this address as the initial voice credit proxy constructor argument. Otherwise, deploys a ConstantInitialVoiceCreditProxy contract with the above-specified value.',
        }
    )

    createParser.addArgument(
        ['-g', '--signup-gatekeeper'],
        {
            action: 'store',
            type: 'string',
            help: 'If specified, deploys the MACI contract with this address as the signup gatekeeper constructor argument. Otherwise, deploys a gatekeeper contract which allows any address to sign up.',
        }
    )

}

const create = async (args: any) => {

    // The deployer's Ethereum private key
    // They may either enter it as a command-line option or via the
    // standard input
    let deployerPrivkey
    if (args.prompt_for_deployer_privkey) {
        deployerPrivkey = await promptPwd('Deployer\'s Ethereum private key')
    } else {
        deployerPrivkey = args.deployer_privkey
    }

    if (deployerPrivkey.startsWith('0x')) {
        deployerPrivkey = deployerPrivkey.slice(2)
    }

    if (!validateEthSk(deployerPrivkey)) {
        console.error('Error: invalid Ethereum private key')
        return
    }

    // The coordinator's MACI private key
    // They may either enter it as a command-line option or via the
    // standard input
    let coordinatorPrivkey
    if (args.prompt_for_maci_privkey) {
        coordinatorPrivkey = await promptPwd('Coordinator\'s MACI private key')
    } else {
        coordinatorPrivkey = args.privkey
    }

    if (!PrivKey.isValidSerializedPrivKey(coordinatorPrivkey)) {
        console.error('Error: invalid MACI private key')
        return
    }

    const unserialisedPrivkey = PrivKey.unserialize(coordinatorPrivkey)
    const coordinatorKeypair = new Keypair(unserialisedPrivkey)

    // Max users
    const maxUsers = args.max_users ? args.max_users : DEFAULT_MAX_USERS

    // Max messages
    const maxMessages = args.max_messages ? args.max_messages : DEFAULT_MAX_MESSAGES

    // Max vote options
    const maxVoteOptions = args.max_vote_options ? args.max_vote_options : DEFAULT_MAX_VOTE_OPTIONS

    // Calculate the tree depths. e.g. if maxUsers is 1000, the tree depth
    // should be 10, as the closest next power of 2 is 1024 = 2 ** 1024
    const stateTreeDepth = calcBinaryTreeDepthFromMaxLeaves(maxUsers)
    const messageTreeDepth = calcBinaryTreeDepthFromMaxLeaves(maxMessages)
    const voteOptionTreeDepth = calcQuinTreeDepthFromMaxLeaves(maxVoteOptions)

    debugger
    // Signup duration
    const signupDuration = args.signup_duration ? args.signup_duration : DEFAULT_SIGNUP_DURATION

    // Voting duration
    const votingDuration = args.voting_duration ? args.voting_duration : DEFAULT_VOTING_DURATION

    // Message batch size
    const messageBatchSize = args.message_batch_size ? args.message_batch_size : DEFAULT_MESSAGE_BATCH_SIZE

    // Tally batch size
    const tallyBatchSize = args.tally_batch_size ? args.tally_batch_size : DEFAULT_TALLY_BATCH_SIZE

    if (maxUsers !== 15 || maxMessages !== 15 || maxVoteOptions >= 25 || messageBatchSize !== 4 || tallyBatchSize !== 4) {
        console.error('Error: this codebase currently does not support custom values for max-users, max-messages, message-batch-size, and tally-batch-size. Additionally, the number of vote options must be less than 25')
        return
    }

    // Initial voice credits
    const initialVoiceCredits = args.initial_voice_credits ? args.initial_voice_credits : DEFAULT_INITIAL_VOICE_CREDITS

    // Initial voice credit proxy contract 
    const initialVoiceCreditProxy = args.initial_vc_proxy

    // Whether we should deploy a ConstantInitialVoiceCreditProxy
    if (initialVoiceCreditProxy != undefined && initialVoiceCredits != undefined) {
        console.error('Error: only one of the following can be specified: the initial voice credit proxy or the amount of initial voice credits.')
    }

    // Ethereum provider
    const ethProvider = args.eth_provider ? args.eth_provider : DEFAULT_ETH_PROVIDER

    if (! (await checkDeployerProviderConnection(deployerPrivkey, ethProvider))) {
        console.error('Error: unable to connect to the Ethereum provider at', ethProvider)
        return
    }
    const deployer = genJsonRpcDeployer(deployerPrivkey, ethProvider)

    let initialVoiceCreditProxyContractAddress = ''
    if (initialVoiceCreditProxy == undefined) {
        // Deploy a ConstantInitialVoiceCreditProxy contract
        const c = await deployConstantInitialVoiceCreditProxy(
            deployer,
            initialVoiceCredits,
            true,
        )
        initialVoiceCreditProxyContractAddress = c.contractAddress
    } else {
        initialVoiceCreditProxyContractAddress = initialVoiceCreditProxy
    }

    // Signup gatekeeper contract
    const signupGatekeeper = args.signup_gatekeeper

    let signUpGatekeeperAddress = ''
    if (signupGatekeeper == undefined) {
        // Deploy a FreeForAllGatekeeper contract
        const c = await deployFreeForAllSignUpGatekeeper(deployer, true)
        signUpGatekeeperAddress = c.contractAddress
    } else {
        signUpGatekeeperAddress = signupGatekeeper
    }

    const contracts = await deployMaci(
        deployer,
        signUpGatekeeperAddress,
        initialVoiceCreditProxyContractAddress,
        stateTreeDepth,
        messageTreeDepth,
        voteOptionTreeDepth,
        tallyBatchSize,
        messageBatchSize,
        maxVoteOptions,
        signupDuration,
        votingDuration,
        coordinatorKeypair.pubKey,
        true,
    )

    console.log('MACI:', contracts.maciContract.contractAddress)
}

export {
    create,
    configureSubparser,
}
