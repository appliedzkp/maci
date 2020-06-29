import * as fs from 'fs'
import * as ethers from 'ethers'

import {
    bigInt,
    SnarkBigInt,
    genRandomSalt,
} from 'maci-crypto'

import { 
    genPerVOSpentVoiceCreditsCommitment,
    genTallyResultCommitment,
    genSpentVoiceCreditsCommitment,
} from 'maci-core'

import {
    maciContractAbi,
    formatProofForVerifierContract,
} from 'maci-contracts'

import {
    loadVk,
    compileAndLoadCircuit,
    genQvtProofAndPublicSignals,
} from 'maci-circuits'

import {
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
    validateSaltSize,
    validateSaltFormat,
    contractExists,
    genMaciStateFromContract,
    checkDeployerProviderConnection,
} from './utils'

import {
    DEFAULT_ETH_PROVIDER,
} from './defaults'

const configureSubparser = (subparsers: any) => {
    const parser = subparsers.addParser(
        'tally',
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
        ['-z', '--leaf-zero'],
        {
            required: true,
            type: 'string',
            help: 'The serialised state leaf preimage at index 0',
        }
    )

    parser.addArgument(
        ['-r', '--repeat'],
        {
            action: 'storeTrue',
            help: 'Process all message batches instead of just the next one',
        }
    )

    parser.addArgument(
        ['-c', '--current-results-salt'],
        {
            required: true,
            type: 'string',
            help: 'The secret salt which is hashed along with the current results to produce the current result commitment input to the snark.',
        }
    )

    parser.addArgument(
        ['-tvc', '--current-total-vc-salt'],
        {
            required: true,
            type: 'string',
            help: 'The secret salt which is hashed along with the current total number of spent voice credits to produce the current total voice credits commitment input to the snark.',
        }
    )

    parser.addArgument(
        ['-pvc', '--current-per-vo-vc-salt'],
        {
            required: true,
            type: 'string',
            help: 'The secret salt which is hashed along with the current total number of spent voice credits per vote option to produce the current total voice credits commitment input to the snark.',
        }
    )

    parser.addArgument(
        ['-t', '--tally-file'],
        {
            required: true,
            type: 'string',
            help: 'A filepath in which to save the final vote tally and salt.',
        }
    )
}

const tally = async (args: any) => {

    // Current results salt
    if (!validateSaltFormat(args.current_results_salt)) {
        console.error('Error: the current results salt should be a 32-byte hexadecimal string')
        return
    }

    if (!validateSaltSize(args.current_results_salt)) {
        console.error('Error: the current results salt should be less than the BabyJub field size')
        return
    }

    // Current total voice credits salt
    if (!validateSaltFormat(args.current_total_vc_salt)) {
        console.error('Error: the current total spent voice credits salt should be a 32-byte hexadecimal string')
        return
    }

    if (!validateSaltSize(args.current_total_vc_salt)) {
        console.error('Error: the current total spent voice credits salt should be less than the BabyJub field size')
        return
    }

    // Current per vote option spent voice credits salt
    if (!validateSaltFormat(args.current_per_vo_vc_salt)) {
        console.error('Error: the current spent voice credits per vote option salt should be a 32-byte hexadecimal string')
        return
    }

    if (!validateSaltSize(args.current_per_vo_vc_salt)) {
        console.error('Error: the current spent voice credits per vote option salt should be less than the BabyJub field size')
        return
    }

    let currentResultsSalt = bigInt(args.current_results_salt)
    let currentTvcSalt = bigInt(args.current_total_vc_salt)
    let currentPvcSalt = bigInt(args.current_per_vo_vc_salt)

    // Zeroth leaf
    const serialized = args.leaf_zero
    let zerothLeaf: StateLeaf
    let isValidZerothStateLeaf = false
    try {
        zerothLeaf = StateLeaf.unserialize(serialized)
        isValidZerothStateLeaf = true
    } catch {}

    if (!isValidZerothStateLeaf) {
        console.error('Error: invalid zeroth state leaf')
        return
    }

    // MACI contract address
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

    // Check whether it's the right time to tally messages
    if (await maciContract.hasUnprocessedMessages()) {
        console.error('Error: not all messages have been processed')
        return
    }

    // Ensure that there are untallied state leaves
    if (! (await maciContract.hasUntalliedStateLeaves())) {
        console.error('Error: all state leaves have been tallied')
        return
    }

    // Build an off-chain representation of the MACI contract using data in the
    // contract storage
    let maciState
    try {
        maciState = await genMaciStateFromContract(
            provider,
            maciAddress,
            coordinatorKeypair,
            zerothLeaf,
        )
    } catch (e) {
        console.error(e)
        return
    }

    const circuit = await compileAndLoadCircuit('test/quadVoteTally_test.circom')
    const qvtVk = loadVk('qvtVk')

    const batchSize = bigInt((await maciContract.tallyBatchSize()).toString())

    let cumulativeTally

    while (true) {
        const hasUntalliedStateLeaves = await maciContract.hasUntalliedStateLeaves()
        if (! hasUntalliedStateLeaves) {
            break
        }

        const currentQvtBatchNum = bigInt((await maciContract.currentQvtBatchNum()).toString())
        const startIndex: SnarkBigInt = currentQvtBatchNum * batchSize

        cumulativeTally = maciState.computeCumulativeVoteTally(startIndex)

        const tally = maciState.computeBatchVoteTally(startIndex, batchSize)

        for (let i = 0; i < tally.length; i++) {
            cumulativeTally[i] = bigInt(cumulativeTally[i]) + bigInt(tally[i])
        }

        if (startIndex.equals(bigInt(0)) && !currentResultsSalt.equals(bigInt(0))) {
            console.error('Error: the first current result salt should be zero')
            return
        }

        if (startIndex.equals(bigInt(0)) && !currentTvcSalt.equals(bigInt(0))) {
            console.error('Error: the first current total spent voice credits salt should be zero')
            return
        }

        if (startIndex.equals(bigInt(0)) && !currentPvcSalt.equals(bigInt(0))) {
            console.error('Error: the first current spent voice credits per vote option salt should be zero')
            return
        }

        const newResultsSalt = genRandomSalt()
        const newSpentVoiceCreditsSalt = genRandomSalt()
        const newPerVOSpentVoiceCreditsSalt = genRandomSalt()

        // Generate circuit inputs
        const circuitInputs 
            = maciState.genQuadVoteTallyCircuitInputs(
                startIndex,
                batchSize,
                currentResultsSalt,
                newResultsSalt,
                currentTvcSalt,
                newSpentVoiceCreditsSalt,
                currentPvcSalt,
                newPerVOSpentVoiceCreditsSalt,
            )

        // Update the salts for the next iteration
        currentResultsSalt = newResultsSalt
        currentTvcSalt = newSpentVoiceCreditsSalt
        currentPvcSalt = newPerVOSpentVoiceCreditsSalt

        const witness = circuit.calculateWitness(circuitInputs)

        if (!circuit.checkWitness(witness)) {
            console.error('Error: unable to compute quadratic vote tally witness data')
            return
        }

        const { proof, publicSignals } = genQvtProofAndPublicSignals(witness)

        // The vote tally commmitment
        const expectedNewResultsCommitmentOutput = witness[circuit.getSignalIdx('main.newResultsCommitment')]

        const newResultsCommitment = genTallyResultCommitment(
            cumulativeTally,
            newResultsSalt,
            maciState.voteOptionTreeDepth,
        )

        if (expectedNewResultsCommitmentOutput.toString() !== newResultsCommitment.toString()) {
            console.error('Error: result commitment mismatch')
            return
        }

        // The commitment to the total spent voice credits
        const expectedSpentVoiceCreditsCommitmentOutput =
            witness[circuit.getSignalIdx('main.newSpentVoiceCreditsCommitment')]

        const currentSpentVoiceCredits = maciState.computeCumulativeSpentVoiceCredits(startIndex)

        const newSpentVoiceCredits = 
            currentSpentVoiceCredits + 
            maciState.computeBatchSpentVoiceCredits(startIndex, batchSize)

        const newSpentVoiceCreditsCommitment = genSpentVoiceCreditsCommitment(
            newSpentVoiceCredits,
            currentTvcSalt,
        )

        if (expectedSpentVoiceCreditsCommitmentOutput.toString() !== newSpentVoiceCreditsCommitment.toString()) {
            console.error('Error: total spent voice credits commitment mismatch')
            return
        }

        // The commitment to the spent voice credits per vote option
        const expectedPerVOSpentVoiceCreditsCommitmentOutput =
            witness[circuit.getSignalIdx('main.newPerVOSpentVoiceCreditsCommitment')]

        const currentPerVOSpentVoiceCredits 
            = maciState.computeCumulativePerVOSpentVoiceCredits(startIndex)

        const perVOSpentVoiceCredits = maciState.computeBatchPerVOSpentVoiceCredits(
            startIndex,
            batchSize,
        )

        const totalPerVOSpentVoiceCredits: SnarkBigInt[] = []
        for (let i = 0; i < currentPerVOSpentVoiceCredits.length; i ++) {
            totalPerVOSpentVoiceCredits[i] = currentPerVOSpentVoiceCredits[i] + perVOSpentVoiceCredits[i]
        }

        const newPerVOSpentVoiceCreditsCommitment = genPerVOSpentVoiceCreditsCommitment(
            totalPerVOSpentVoiceCredits,
            newPerVOSpentVoiceCreditsSalt,
            maciState.voteOptionTreeDepth,
        )

        if (expectedPerVOSpentVoiceCreditsCommitmentOutput.toString() !== newPerVOSpentVoiceCreditsCommitment.toString()) {
            console.error('Error: total spent voice credits per vote option commitment mismatch')
            return
        }

        const contractPublicSignals = await maciContract.genQvtPublicSignals(
            circuitInputs.intermediateStateRoot.toString(),
            newResultsCommitment.toString(),
            newSpentVoiceCreditsCommitment.toString(),
            newPerVOSpentVoiceCreditsCommitment.toString(),
        )

        const publicSignalMatch = JSON.stringify(publicSignals.map((x) => x.toString())) ===
            JSON.stringify(contractPublicSignals.map((x) => x.toString()))

        if (!publicSignalMatch) {
            console.error('Error: public signal mismatch')
            return
        }

        const isValid = verifyProof(qvtVk, proof, publicSignals)
        if (!isValid) {
            console.error('Error: could not generate a valid proof or the verifying key is incorrect')
            return
        }

        const formattedProof = formatProofForVerifierContract(proof)
        //const formattedProof = [0, 0, 0, 0, 0, 0, 0, 0]

        let tx
        const txErr = 'Error: proveVoteTallyBatch() failed'

        try {
            tx = await maciContract.proveVoteTallyBatch(
                circuitInputs.intermediateStateRoot.toString(),
                newResultsCommitment.toString(),
                newSpentVoiceCreditsCommitment.toString(),
                newPerVOSpentVoiceCreditsCommitment.toString(),
                formattedProof,
                { gasLimit: 2000000 },
            )
        } catch (e) {
            console.error('Error: proveVoteTallyBatch() failed')
            console.error(txErr)
            console.error(e)
            break
        }

        const receipt = await tx.wait()

        if (receipt.status !== 1) {
            console.error(txErr)
            break
        }

        console.log(`Transaction hash: ${tx.hash}`)

        if (!args.repeat || ! (await maciContract.hasUntalliedStateLeaves())) {
            console.log(`Current results salt: 0x${currentResultsSalt.toString(16)}`)
			const currentResultsCommitment = await maciContract.currentResultsCommitment()
            const c = bigInt(currentResultsCommitment.toString())
            console.log(`Result commitment: 0x${c.toString(16)}`)

            console.log(`Total spent voice credits salt: 0x${currentTvcSalt.toString(16)}`)
			const currentSpentVoiceCreditsCommitment = await maciContract.currentSpentVoiceCreditsCommitment()
            const d = bigInt(currentSpentVoiceCreditsCommitment.toString())
            console.log(`Total spent voice credits commitment: 0x${d.toString(16)}`)

            console.log(`Total spent voice credits per vote option salt: 0x${currentPvcSalt.toString(16)}`)
			const currentPerVOSpentVoiceCreditsCommitment = await maciContract.currentPerVOSpentVoiceCreditsCommitment()
            const e = bigInt(currentPerVOSpentVoiceCreditsCommitment.toString())
            console.log(`Total spent voice credits per vote option commitment: 0x${e.toString(16)}`)

            if (args.tally_file) {
                // Write tally to a file
                const d = {
                    provider: ethProvider,
                    maci: maciContract.address,
                    results: {
                        commitment: '0x' + c.toString(16),
                        tally: cumulativeTally.map((x) => x.toString()),
                        salt: '0x' + currentResultsSalt.toString(16),
                    },
                    totalVoiceCredits: {
                        spent: newSpentVoiceCredits.toString(),
                        commitment: '0x' + newSpentVoiceCreditsCommitment.toString(16),
                        salt: '0x' + newSpentVoiceCreditsSalt.toString(16),
                    },
                    totalVoiceCreditsPerVoteOption: {
                        commitment: '0x' + newPerVOSpentVoiceCreditsCommitment.toString(16),
                        tally: totalPerVOSpentVoiceCredits.map((x) => x.toString()),
                        salt: '0x' + newPerVOSpentVoiceCreditsSalt.toString(16),
                    },
                }

                // Format the JSON file with spaces
                fs.writeFileSync(args.tally_file, JSON.stringify(d, null, 4))
            }
            break
        }
    }

    // Force the process to exit as it might get stuck
    process.exit()
}

export {
    tally,
    configureSubparser,
}
