import * as ethers from 'ethers'

import {
    maciContractAbi,
    formatProofForVerifierContract,
} from 'maci-contracts'

import {
    loadVk,
    compileAndLoadCircuit,
    genBatchUstProofAndPublicSignals,
} from 'maci-circuits'

import {
    PubKey,
    PrivKey,
    Keypair,
    StateLeaf,
} from 'maci-domainobjs'

import {
    verifyProof,
} from 'libsemaphore'

import {
    promptPwd,
    validateEthSk,
    validateEthAddress,
    contractExists,
    genMaciStateFromContract,
    checkDeployerProviderConnection,
} from './utils'

import {
    DEFAULT_ETH_PROVIDER,
} from './defaults'

const configureSubparser = (subparsers: any) => {
    const parser = subparsers.addParser(
        'process',
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
        ['-x', '--contract'],
        {
            required: true,
            type: 'string',
            help: 'The MACI contract address',
        }
    )

    parser.addArgument(
        ['-r', '--repeat'],
        {
            action: 'storeTrue',
            help: 'Process all message batches instead of just the next one',
        }
    )
}

// This function is named as such as there already is a global Node.js object
// called 'process'
const processMessages = async (args: any) => {
    // MACI contract
    if (!validateEthAddress(args.contract)) {
        console.error('Error: invalid MACI contract address')
        return
    }

    let ethSk
    // The coordinator's Ethereum private key
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

    // Ethereum provider
    const ethProvider = args.eth_provider ? args.eth_provider : DEFAULT_ETH_PROVIDER

    if (! (await checkDeployerProviderConnection(ethSk, ethProvider))) {
        console.error('Error: unable to connect to the Ethereum provider at', ethProvider)
        return
    }

    const provider = new ethers.providers.JsonRpcProvider(ethProvider)

    const wallet = new ethers.Wallet(ethSk, provider)

    const maciAddress = args.contract

    if (! (await contractExists(provider, maciAddress))) {
        console.error('Error: there is no contract deployed at the specified address')
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

    const maciContract = new ethers.Contract(
        maciAddress,
        maciContractAbi,
        wallet,
    )

    // Check whether there are any remaining batches to process
    const currentMessageBatchIndex = (await maciContract.currentMessageBatchIndex()).toNumber()
    const messageTreeMaxLeafIndex = (await maciContract.messageTreeMaxLeafIndex()).toNumber()

    if (! (await maciContract.hasUnprocessedMessages())) {
        console.error('Error: all messages have already been processed')
        return
    }

    if (currentMessageBatchIndex > messageTreeMaxLeafIndex) {
        console.error('Error: the message batch index is invalid. This should never happen.')
        return
    }

    // Build an off-chain representation of the MACI contract using data in the contract storage
    let maciState
    try {
        maciState = await genMaciStateFromContract(
            provider,
            maciAddress,
            coordinatorKeypair,
            StateLeaf.genBlankLeaf(),
        )
    } catch (e) {
        console.error(e)
        return
    }

    const circuit = await compileAndLoadCircuit('test/batchUpdateStateTree_test.circom')
    const batchUstVk = loadVk('batchUstVk')

    const messageBatchSize  = await maciContract.messageBatchSize()
    let randomStateLeaf 

    while (true) {
        randomStateLeaf = StateLeaf.genRandomLeaf()
        const messageBatchIndex = await maciContract.currentMessageBatchIndex()
        const circuitInputs = maciState.genBatchUpdateStateTreeCircuitInputs(
            messageBatchIndex.toNumber(),
            messageBatchSize,
            randomStateLeaf,
        )
        debugger

        // Process the batch of messages
        maciState.batchProcessMessage(
            messageBatchIndex.toNumber(),
            messageBatchSize,
            randomStateLeaf,
        )

        const stateRootAfter = maciState.genStateRoot()

        // Calculate the witness
        const witness = circuit.calculateWitness(circuitInputs)
        if (!circuit.checkWitness(witness)) {
            console.error('Error: unable to compute batch update state tree witness data')
            return
        }

        // Get the circuit-generated root
        const idx = circuit.getSignalIdx('main.root')
        const circuitNewStateRoot = witness[idx].toString()
        if (!circuitNewStateRoot.toString() === stateRootAfter.toString()) {
            console.error('Error: circuit-computed root mismatch')
            return
        }

        const ecdhPubKeys: PubKey[] = []
        for (const p of circuitInputs['ecdh_public_key']) {
            const pubKey = new PubKey(p)
            ecdhPubKeys.push(pubKey)
        }

        const { proof, publicSignals } = genBatchUstProofAndPublicSignals(witness)

        const isValid = verifyProof(batchUstVk, proof, publicSignals)
        if (!isValid) {
            console.error('Error: could not generate a valid proof or the verifying key is incorrect')
            return
        }

        const formattedProof = formatProofForVerifierContract(proof)
        //const formattedProof = [0, 0, 0, 0, 0, 0, 0, 0]
        const txErr = 'Error: batchProcessMessage() failed'
        let tx

        try {
            tx = await maciContract.batchProcessMessage(
                '0x' + stateRootAfter.toString(16),
                circuitInputs['state_tree_root'].map((x) => x.toString()),
                ecdhPubKeys.map((x) => x.asContractParam()),
                formattedProof,
                { gasLimit: 2000000 },
            )
        } catch (e) {
            console.error(txErr)
            console.error(e)
            break
        }

        const receipt = await tx.wait()

        if (receipt.status !== 1) {
            console.error(txErr)
            break
        }

        const postSignUpStateRoot = await maciContract.postSignUpStateRoot()
        if (postSignUpStateRoot.toString() !== stateRootAfter.toString()) {
            console.error('Error: state root mismatch after processing a batch of messges')
            return
        }

        console.log(`Processed batch starting at index ${messageBatchIndex}`)
        console.log(`Transaction hash: ${tx.hash}`)
        console.log(`Random state leaf: ${randomStateLeaf.serialize()}`)

        if (!args.repeat || ! (await maciContract.hasUnprocessedMessages())) {
            break
        }
    }

    // Force the process to exit as it might get stuck
    process.exit()
}

export {
    processMessages,
    configureSubparser,
}
