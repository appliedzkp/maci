require('module-alias/register')

jest.setTimeout(1200000)

import * as ethers from 'ethers'

import { genTestAccounts } from '../accounts'
import { timeTravel } from '../'
import { deployTestContracts } from '../utils'

import { config } from 'maci-config'

import { formatProofForVerifierContract } from '../utils'

import {
    genDeployer,
} from '../deploy'

import {
    bigInt,
    SnarkBigInt,
    genRandomSalt,
    IncrementalQuinTree,
    stringifyBigInts,
    hashLeftRight,
    hash5,
} from 'maci-crypto'

import {
    StateLeaf,
    Command,
    Keypair,
    PubKey,
    PrivKey,
} from 'maci-domainobjs'

import {
    MaciState,
    genPerVOSpentVoiceCreditsCommitment,
    genTallyResultCommitment,
    genSpentVoiceCreditsCommitment,
} from 'maci-core'

import {
    compileAndLoadCircuit,
    loadVk,
    genBatchUstProofAndPublicSignals,
    genQvtProofAndPublicSignals,
} from 'maci-circuits'

import {
    SnarkVerifyingKey,
    verifyProof,
} from 'libsemaphore'

const batchUstVk: SnarkVerifyingKey = loadVk('batchUstVk')
const qvtVk: SnarkVerifyingKey = loadVk('qvtVk')

const batchSize = config.maci.messageBatchSize
const stateTreeDepth = config.maci.merkleTrees.stateTreeDepth
const messageTreeDepth = config.maci.merkleTrees.messageTreeDepth
const voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth
const voteOptionsMaxIndex = config.maci.voteOptionsMaxLeafIndex
const quadVoteTallyBatchSize = config.maci.quadVoteTallyBatchSize

const accounts = genTestAccounts(batchSize - 1)
const deployer = genDeployer(accounts[0].privateKey)

const coordinator = new Keypair(new PrivKey(bigInt(config.maci.coordinatorPrivKey)))
const maciState = new MaciState(
    coordinator,
    stateTreeDepth,
    messageTreeDepth,
    voteOptionTreeDepth,
    voteOptionsMaxIndex,
)

const users: any[] = []

let totalVoteWeight = bigInt(0)
let newSpentVoiceCreditsSalt: SnarkBigInt
let newPerVOSpentVoiceCreditsSalt: SnarkBigInt
const emptyTally: SnarkBigInt[] = []
for (let i = 0; i < 5 ** voteOptionTreeDepth; i ++) {
    emptyTally[i] = bigInt(0)
}

let maciContract
let stateRootBefore

describe('BatchProcessMessage', () => {
    beforeAll(async () => {
        // Deploy contracts

        const contracts = await deployTestContracts(
            deployer,
            config.maci.initialVoiceCreditBalance,
        )
        maciContract = contracts.maciContract

        // Create users, a command per user, and its associated key and message
        for (let i = 0; i < accounts.length; i++) {
            const keypair = new Keypair()
            const voteOptionIndex = 0
            const command = new Command(
                bigInt(i + 1),
                keypair.pubKey,
                bigInt(voteOptionIndex),
                bigInt(i),
                bigInt(1),
                genRandomSalt(),
            )

            const ephemeralKeypair = new Keypair()
            const signature = command.sign(keypair.privKey)
            const sharedKey = Keypair.genEcdhSharedKey(
                ephemeralKeypair.privKey,
                coordinator.pubKey,
            )
            const message = command.encrypt(signature, sharedKey)

            users.push({
                wallet: accounts[i],
                keypair,
                ephemeralKeypair,
                command,
                message,
            })
        }

        for (const user of users) {
            const voteWeight = user.command.newVoteWeight
            totalVoteWeight += voteWeight * voteWeight
        }
    })

    describe('Sign-ups', () => {
        it('The state root should be correct after signing up some users', async () => {
            // Sign the users up
            for (const user of users) {
                maciState.signUp(
                    user.keypair.pubKey, 
                    bigInt(
                        config.maci.initialVoiceCreditBalance,
                    ),
                )

                const tx = await maciContract.signUp(
                    user.keypair.pubKey.asContractParam(),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [1]),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [0]),
                    { gasLimit: 2000000 },
                )
                await tx.wait()
            }

            const onChainStateRoot = (await maciContract.getStateTreeRoot()).toString()
            const offChainStateRoot = maciState.genStateRoot().toString()
            expect(onChainStateRoot).toEqual(offChainStateRoot)
        })
    })

    describe('Publish messages', () => {
        it('The message root should be correct after publishing one message per user', async () => {
            // Move forward in time
            await timeTravel(deployer.provider, config.maci.signUpDurationInSeconds + 1)

            stateRootBefore = maciState.genStateRoot()

            for (const user of users) {

                maciState.publishMessage(user.message, user.ephemeralKeypair.pubKey)

                const tx = await maciContract.publishMessage(
                    user.message.asContractParam(),
                    user.ephemeralKeypair.pubKey.asContractParam(),
                )
                const receipt = await tx.wait()
                expect(receipt.status).toEqual(1)
            }

            const onChainMessageRoot = (await maciContract.getMessageTreeRoot()).toString()
            const offChainMessageRoot = maciState.genMessageRoot().toString()
            expect(onChainMessageRoot).toEqual(offChainMessageRoot)
        })
    })

    describe('Process messages', () => {
        it('the blank state leaf hash should match the one generated by the contract', async () => {
            const temp = new IncrementalQuinTree(voteOptionTreeDepth, bigInt(0))

            const emptyVoteOptionTreeRoot = temp.root

            const onChainHash = await maciContract.hashedBlankStateLeaf()
            const blankStateLeaf = StateLeaf.genBlankLeaf(
                emptyVoteOptionTreeRoot,
            )
            expect(onChainHash.toString()).toEqual(blankStateLeaf.hash().toString())
            expect((await maciContract.emptyVoteOptionTreeRoot()).toString()).toEqual(emptyVoteOptionTreeRoot.toString())
        })

        it('batchProcessMessage should verify a proof and update the postSignUpStateRoot', async () => {
            // Move forward in time
            await timeTravel(deployer.provider, config.maci.votingDurationInSeconds + 1)

            const randomStateLeaf = StateLeaf.genRandomLeaf()
            // Generate circuit inputs
            const circuitInputs = 
                maciState.genBatchUpdateStateTreeCircuitInputs(
                    0,
                    batchSize,
                    randomStateLeaf,
                )

            // Process the batch of messages
            maciState.batchProcessMessage(
                0,
                batchSize,
                randomStateLeaf,
            )

            const stateRootAfter = maciState.genStateRoot()

            const circuit = await compileAndLoadCircuit('test/batchUpdateStateTree_test.circom')

            // Calculate the witness
            const witness = circuit.calculateWitness(circuitInputs)
            expect(circuit.checkWitness(witness)).toBeTruthy()

            // Get the circuit-generated root
            const idx = circuit.getSignalIdx('main.root')
            const circuitNewStateRoot = witness[idx].toString()

            // After we run process the message via maciState.processMessage(),
            // the root generated by the circuit should change and now match
            // the one generated by the circuit
            expect(stateRootBefore.toString()).not.toEqual(stateRootAfter)
            expect(circuitNewStateRoot.toString()).toEqual(stateRootAfter.toString())

            console.log('Generating proof...')

            const { proof, publicSignals } = genBatchUstProofAndPublicSignals(witness)

            const isValid = verifyProof(batchUstVk, proof, publicSignals)
            expect(isValid).toBeTruthy()

            expect(publicSignals).toHaveLength(20)

            const ecdhPubKeys: PubKey[] = []
            for (const p of circuitInputs['ecdh_public_key']) {
                const pubKey = new PubKey(p)
                ecdhPubKeys.push(pubKey)
            }

            const contractPublicSignals = await maciContract.genBatchUstPublicSignals(
                '0x' + stateRootAfter.toString(16),
                circuitInputs['state_tree_root'].map((x) => x.toString()),
                ecdhPubKeys.map((x) => x.asContractParam()),
            )

            expect(JSON.stringify(publicSignals.map((x) => x.toString()))).toEqual(
                JSON.stringify(contractPublicSignals.map((x) => x.toString()))
            )

            const formattedProof = formatProofForVerifierContract(proof)
            //const formattedProof = [0, 0, 0, 0, 0, 0, 0, 0]

            const tx = await maciContract.batchProcessMessage(
                '0x' + stateRootAfter.toString(16),
                circuitInputs['state_tree_root'].map((x) => x.toString()),
                ecdhPubKeys.map((x) => x.asContractParam()),
                formattedProof,
                { gasLimit: 2000000 },
            )

            const receipt = await tx.wait()
            expect(receipt.status).toEqual(1)

            const postSignUpStateRoot = await maciContract.postSignUpStateRoot()
            expect(postSignUpStateRoot.toString()).toEqual(stateRootAfter.toString())
        })
    })

    describe('Tally votes', () => {
        let tally
        let newResultsSalt

        it('should tally a batch of votes', async () => {
            const startIndex = bigInt(0)

            tally = maciState.computeBatchVoteTally(startIndex, quadVoteTallyBatchSize)
            newResultsSalt = genRandomSalt()
            const currentResultsSalt = bigInt(0)

            const currentSpentVoiceCreditsSalt = bigInt(0)
            newSpentVoiceCreditsSalt = genRandomSalt()

            const currentPerVOSpentVoiceCreditsSalt = bigInt(0)
            newPerVOSpentVoiceCreditsSalt = genRandomSalt()

            // Generate circuit inputs
            const circuitInputs 
                = maciState.genQuadVoteTallyCircuitInputs(
                    startIndex,
                    quadVoteTallyBatchSize,
                    currentResultsSalt,
                    newResultsSalt,
                    currentSpentVoiceCreditsSalt,
                    newSpentVoiceCreditsSalt,
                    currentPerVOSpentVoiceCreditsSalt,
                    newPerVOSpentVoiceCreditsSalt,
                )

            const circuit = await compileAndLoadCircuit('test/quadVoteTally_test.circom')
            const witness = circuit.calculateWitness(stringifyBigInts(circuitInputs))
            expect(circuit.checkWitness(witness)).toBeTruthy()

            // Check the commitment to the result tally
            const newResultsCommitmentOutput = witness[circuit.getSignalIdx('main.newResultsCommitment')]

            const newResultsCommitment = genTallyResultCommitment(
                tally,
                newResultsSalt,
                voteOptionTreeDepth,
            )
            expect(newResultsCommitmentOutput.toString()).toEqual(newResultsCommitment.toString())

            // Check the commitment to the total number of spent voice credits
            const newSpentVoiceCreditsCommitment = genSpentVoiceCreditsCommitment(
                totalVoteWeight,
                newSpentVoiceCreditsSalt,
            )

            const newSpentVoiceCreditsCommitmentOutput = witness[circuit.getSignalIdx('main.newSpentVoiceCreditsCommitment')]

            expect(newSpentVoiceCreditsCommitmentOutput.toString())
                .toEqual(newSpentVoiceCreditsCommitment.toString())

            const perVOSpentVoiceCredits = maciState.computeBatchPerVOSpentVoiceCredits(
                startIndex,
                quadVoteTallyBatchSize,
            )
            // Check the commitment to the per vote option spent voice credits
            const newPerVOSpentVoiceCreditsCommitment = genPerVOSpentVoiceCreditsCommitment(
                perVOSpentVoiceCredits,
                newPerVOSpentVoiceCreditsSalt,
                voteOptionTreeDepth,
            )
            const newPerVOSpentVoiceCreditsCommitmentOutput = witness[circuit.getSignalIdx('main.newPerVOSpentVoiceCreditsCommitment')]

            expect(newPerVOSpentVoiceCreditsCommitmentOutput.toString())
                .toEqual(newPerVOSpentVoiceCreditsCommitment.toString())

            console.log('Generating proof...')
            const { proof, publicSignals } = genQvtProofAndPublicSignals(witness)

            const contractPublicSignals = await maciContract.genQvtPublicSignals(
                circuitInputs.intermediateStateRoot.toString(),
                newResultsCommitment.toString(),
                newSpentVoiceCreditsCommitment.toString(),
                newPerVOSpentVoiceCreditsCommitment.toString(),
            )

            const currentSpentVoiceCreditsCommitment = genSpentVoiceCreditsCommitment(0, currentSpentVoiceCreditsSalt)
            const currentPerVOSpentVoiceCreditsCommitment = genPerVOSpentVoiceCreditsCommitment(
                emptyTally,
                currentPerVOSpentVoiceCreditsSalt,
                voteOptionTreeDepth,
            )
            expect(publicSignals[0].toString()).toEqual(newResultsCommitment.toString())
            expect(publicSignals[1].toString()).toEqual(newSpentVoiceCreditsCommitment.toString())
            expect(publicSignals[2].toString()).toEqual(newPerVOSpentVoiceCreditsCommitment.toString())
            expect(publicSignals[3].toString()).toEqual(maciState.genStateRoot().toString())
            expect(publicSignals[4].toString()).toEqual('0')
            expect(publicSignals[5].toString()).toEqual(circuitInputs.intermediateStateRoot.toString())
            expect(publicSignals[6].toString()).toEqual(circuitInputs.currentResultsCommitment.toString())
            expect(publicSignals[7].toString()).toEqual(currentSpentVoiceCreditsCommitment.toString())
            expect(publicSignals[8].toString()).toEqual(currentPerVOSpentVoiceCreditsCommitment.toString())

            expect(JSON.stringify(publicSignals.map((x) => x.toString()))).toEqual(
                JSON.stringify(contractPublicSignals.map((x) => x.toString()))
            )

            const isValid = verifyProof(qvtVk, proof, publicSignals)
            expect(isValid).toBeTruthy()

            const formattedProof = formatProofForVerifierContract(proof)

            const tx = await maciContract.proveVoteTallyBatch(
                circuitInputs.intermediateStateRoot.toString(),
                newResultsCommitment.toString(),
                newSpentVoiceCreditsCommitment.toString(),
                newPerVOSpentVoiceCreditsCommitment.toString(),
                formattedProof,
                { gasLimit: 1000000 },
            )

            const receipt = await tx.wait()
            expect(receipt.status).toEqual(1)
        })

        it('on-chain verification of the total number of spent voice credits', async () => {
            const result = await maciContract.verifySpentVoiceCredits(
                totalVoteWeight.toString(),
                newSpentVoiceCreditsSalt.toString(),
            )
            expect(result).toBeTruthy()
        })

        it('on-chain tally result verification of one leaf', async () => {
            const tree = new IncrementalQuinTree(voteOptionTreeDepth, bigInt(0))
            for (const t of tally) {
                tree.insert(t)
            }
            const expectedCommitment = hashLeftRight(tree.root, newResultsSalt)
            const currentResultsCommitment = await maciContract.currentResultsCommitment()
            expect(expectedCommitment.toString()).toEqual(currentResultsCommitment.toString())

            const index = 0
            const leaf = tally[index]
            const proof = tree.genMerklePath(index)

            // Any contract can call the MACI contract's verifyTallyResult()
            // function to prove that they know the value of the leaf.
            const verified = await maciContract.verifyTallyResult(
                voteOptionTreeDepth,
                index,
                leaf.toString(),
                proof.pathElements.map((x) => x.map((y) => y.toString())),
                newResultsSalt.toString(),
            )
            expect(verified).toBeTruthy()
        })

        it('on-chain tally result verification of a batch of leaves', async () => {
            const depth = voteOptionTreeDepth - 1
            const tree = new IncrementalQuinTree(depth, bigInt(0))
            for (let i = 0; i < tally.length; i += 5) {
                const batch = hash5(tally.slice(i, i + 5))
                tree.insert(batch)
            }

            const index = 0
            const leaf = tree.leaves[index]
            const proof = tree.genMerklePath(index)

            // Any contract can call the MACI contract's verifyTallyResult()
            // function to prove that they know the value of a batch of leaves.
            const verified = await maciContract.verifyTallyResult(
                depth,
                index,
                leaf.toString(),
                proof.pathElements.map((x) => x.map((y) => y.toString())),
                newResultsSalt.toString(),
            )
            expect(verified).toBeTruthy()
        })
    })
})
