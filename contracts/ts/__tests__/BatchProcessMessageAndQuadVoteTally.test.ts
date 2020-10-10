require('module-alias/register')

jest.setTimeout(1200000)

import * as ethers from 'ethers'

import { genTestAccounts } from '../accounts'
import { timeTravel } from './utils'
import { deployTestContracts } from '../utils'

import { config } from 'maci-config'

import { formatProofForVerifierContract } from '../utils'

import {
    genDeployer,
} from '../deploy'

import {
    genRandomSalt,
    IncrementalQuinTree,
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
    genBatchUstProofAndPublicSignals,
    genQvtProofAndPublicSignals,
    verifyBatchUstProof,
    verifyQvtProof,
    getSignalByName,
} from 'maci-circuits'

const batchSize = config.maci.messageBatchSize
const stateTreeDepth = config.maci.merkleTrees.stateTreeDepth
const messageTreeDepth = config.maci.merkleTrees.messageTreeDepth
const voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth
const voteOptionsMaxIndex = config.maci.voteOptionsMaxLeafIndex
const quadVoteTallyBatchSize = config.maci.quadVoteTallyBatchSize

const accounts = genTestAccounts(batchSize - 1)
const deployer = genDeployer(accounts[0].privateKey)

const coordinator = new Keypair(new PrivKey(BigInt(config.maci.coordinatorPrivKey)))
const maciState = new MaciState(
    coordinator,
    stateTreeDepth,
    messageTreeDepth,
    voteOptionTreeDepth,
    voteOptionsMaxIndex,
)

const users: any[] = []

let totalVotes = BigInt(0)
let totalVoteWeight = BigInt(0)
let newSpentVoiceCreditsSalt: BigInt
let newPerVOSpentVoiceCreditsSalt: BigInt
let perVOSpentVoiceCredits: BigInt[] = []
const emptyTally: BigInt[] = []
for (let i = 0; i < 5 ** voteOptionTreeDepth; i ++) {
    emptyTally[i] = BigInt(0)
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
            const voiceCredits = BigInt(i)
            const command = new Command(
                BigInt(i + 1),
                keypair.pubKey,
                BigInt(voteOptionIndex),
                voiceCredits,
                BigInt(1),
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
            totalVoteWeight += BigInt(voteWeight) * BigInt(voteWeight)
            totalVotes += voteWeight
        }
    })

    describe('Sign-ups', () => {
        it('The state root should be correct after signing up some users', async () => {
            // Sign the users up
            for (const user of users) {
                maciState.signUp(
                    user.keypair.pubKey, 
                    BigInt(config.maci.initialVoiceCreditBalance),
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
            const temp = new IncrementalQuinTree(voteOptionTreeDepth, BigInt(0))

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
            console.log('Number of messages:', maciState.messages.length)

            // Process the batch of messages
            maciState.batchProcessMessage(
                0,
                batchSize,
                randomStateLeaf,
            )

            const stateRootAfter = maciState.genStateRoot()

            console.log('Generating proof...')

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

            const { circuit, witness, proof, publicSignals }
                = await genBatchUstProofAndPublicSignals(circuitInputs, config.env)

            // Get the circuit-generated root
            const circuitNewStateRoot = getSignalByName(circuit, witness, 'main.root')

            // After we run process the message via maciState.processMessage(),
            // the root generated by the circuit should change and now match
            // the one generated by the circuit
            expect(stateRootBefore.toString()).not.toEqual(stateRootAfter)
            expect(circuitNewStateRoot.toString()).toEqual(stateRootAfter.toString())

            const isValid = await verifyBatchUstProof(proof, publicSignals, config.env)
            expect(isValid).toBeTruthy()

            expect(publicSignals).toHaveLength(20)

            for (let i = 0; i < publicSignals.length; i ++) {
                expect(publicSignals[i].toString()).toEqual(contractPublicSignals[i].toString())
            }

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
            const startIndex = BigInt(0)

            tally = maciState.computeBatchVoteTally(startIndex, quadVoteTallyBatchSize)
            newResultsSalt = genRandomSalt()
            const currentResultsSalt = BigInt(0)

            const currentSpentVoiceCreditsSalt = BigInt(0)
            newSpentVoiceCreditsSalt = genRandomSalt()

            const currentPerVOSpentVoiceCreditsSalt = BigInt(0)
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

            console.log('Generating proof...')
            const { circuit, witness, proof, publicSignals }
                = await genQvtProofAndPublicSignals(circuitInputs, config.env)

            // Check the commitment to the result tally
            const newResultsCommitmentOutput = getSignalByName(circuit, witness, 'main.newResultsCommitment')

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

            const newSpentVoiceCreditsCommitmentOutput = getSignalByName(circuit, witness, 'main.newSpentVoiceCreditsCommitment')

            expect(newSpentVoiceCreditsCommitmentOutput.toString())
                .toEqual(newSpentVoiceCreditsCommitment.toString())

            perVOSpentVoiceCredits = maciState.computeBatchPerVOSpentVoiceCredits(
                startIndex,
                quadVoteTallyBatchSize,
            )
            // Check the commitment to the per vote option spent voice credits
            const newPerVOSpentVoiceCreditsCommitment = genPerVOSpentVoiceCreditsCommitment(
                perVOSpentVoiceCredits,
                newPerVOSpentVoiceCreditsSalt,
                voteOptionTreeDepth,
            )

            const newPerVOSpentVoiceCreditsCommitmentOutput = getSignalByName(circuit, witness, 'main.newPerVOSpentVoiceCreditsCommitment')

            expect(newPerVOSpentVoiceCreditsCommitmentOutput.toString())
                .toEqual(newPerVOSpentVoiceCreditsCommitment.toString())

            const contractPublicSignals = await maciContract.genQvtPublicSignals(
                circuitInputs.intermediateStateRoot.toString(),
                newResultsCommitment.toString(),
                newSpentVoiceCreditsCommitment.toString(),
                newPerVOSpentVoiceCreditsCommitment.toString(),
                totalVotes.toString(),
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
            expect(publicSignals[3].toString()).toEqual(totalVotes.toString())
            expect(publicSignals[4].toString()).toEqual(maciState.genStateRoot().toString())
            expect(publicSignals[5].toString()).toEqual('0')
            expect(publicSignals[6].toString()).toEqual(circuitInputs.intermediateStateRoot.toString())
            expect(publicSignals[7].toString()).toEqual(circuitInputs.currentResultsCommitment.toString())
            expect(publicSignals[8].toString()).toEqual(currentSpentVoiceCreditsCommitment.toString())
            expect(publicSignals[9].toString()).toEqual(currentPerVOSpentVoiceCreditsCommitment.toString())

            for (let i = 0; i < publicSignals.length; i ++) {
                expect(publicSignals[i].toString()).toEqual(contractPublicSignals[i].toString())
            }

            const isValid = await verifyQvtProof(proof, publicSignals, config.env)
            expect(isValid).toBeTruthy()

            const formattedProof = formatProofForVerifierContract(proof)

            const tx = await maciContract.proveVoteTallyBatch(
                circuitInputs.intermediateStateRoot.toString(),
                newResultsCommitment.toString(),
                newSpentVoiceCreditsCommitment.toString(),
                newPerVOSpentVoiceCreditsCommitment.toString(),
                totalVotes.toString(),
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
            const tree = new IncrementalQuinTree(voteOptionTreeDepth, BigInt(0))
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
            const tree = new IncrementalQuinTree(depth, BigInt(0))
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

        it('on-chain per VO spent voice credit verification of one leaf', async () => {
            const tree = new IncrementalQuinTree(voteOptionTreeDepth, BigInt(0))
            for (const t of perVOSpentVoiceCredits) {
                tree.insert(t)
            }
            const expectedCommitment = hashLeftRight(tree.root, newPerVOSpentVoiceCreditsSalt)
            const currentPerVOSpentVoiceCreditsCommitment = await maciContract.currentPerVOSpentVoiceCreditsCommitment()
            expect(expectedCommitment.toString()).toEqual(currentPerVOSpentVoiceCreditsCommitment.toString())

            const index = 0
            const leaf = perVOSpentVoiceCredits[index]
            const proof = tree.genMerklePath(index)

            // Any contract can call the MACI contract's verifyTallyResult()
            // function to prove that they know the value of the leaf.
            const verified = await maciContract.verifyPerVOSpentVoiceCredits(
                voteOptionTreeDepth,
                index,
                leaf.toString(),
                proof.pathElements.map((x) => x.map((y) => y.toString())),
                newPerVOSpentVoiceCreditsSalt.toString(),
            )
            expect(verified).toBeTruthy()
        })
    })
})
