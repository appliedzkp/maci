import { config } from 'maci-config'
import { 
    genPerVOSpentVoiceCreditsCommitment,
    genTallyResultCommitment,
    genSpentVoiceCreditsCommitment,
    MaciState,
} from 'maci-core'
import {
    genRandomSalt,
    bigInt,
    stringifyBigInts,
} from 'maci-crypto'

import {
    Keypair,
    Command,
} from 'maci-domainobjs'

import {
    compileAndLoadCircuit,
} from '../'

const stateTreeDepth = config.maci.merkleTrees.stateTreeDepth
const messageTreeDepth = config.maci.merkleTrees.messageTreeDepth
const voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth
const initialVoiceCreditBalance = config.maci.initialVoiceCreditBalance
const voteOptionsMaxIndex = config.maci.voteOptionsMaxLeafIndex
const quadVoteTallyBatchSize = config.maci.quadVoteTallyBatchSize

const randomRange = (min: number, max: number) => {
  return bigInt(Math.floor(Math.random() * (max - min) + min))
}

const coordinator = new Keypair()
const voteWeight = bigInt(9)

describe('Quadratic vote tallying circuit', () => {
    let circuit
    const maciState = new MaciState(
        coordinator,
        stateTreeDepth,
        messageTreeDepth,
        voteOptionTreeDepth,
        voteOptionsMaxIndex,
    )

    beforeAll(async () => {
        circuit = await compileAndLoadCircuit('test/quadVoteTally_test.circom')
    })

    it('should correctly tally results for 1 user with 1 message in 1 batch', async () => {

        const startIndex = bigInt(0)

        const user = new Keypair()
        // Sign up the user
        maciState.signUp(user.pubKey, initialVoiceCreditBalance)

        // Publish and process a message
        const voteOptionIndex = randomRange(0, voteOptionsMaxIndex)
        const command = new Command(
            bigInt(1),
            user.pubKey,
            voteOptionIndex,
            voteWeight,
            bigInt(1),
            genRandomSalt(),
        )

        const signature = command.sign(user.privKey)
        const sharedKey = Keypair.genEcdhSharedKey(user.privKey, coordinator.pubKey)
        const message = command.encrypt(signature, sharedKey)

        // Publish a message
        maciState.publishMessage(message, user.pubKey)

        // Process the message
        maciState.processMessage(0)

        const currentResults = maciState.computeCumulativeVoteTally(startIndex, quadVoteTallyBatchSize)

        // Ensure that the current results are all 0 since this is the first
        // batch
        for (let i = 0; i < currentResults.length; i++) {
            expect(currentResults[i].toString()).toEqual(bigInt(0).toString())
        }

        // Calculate the vote tally for a batch of state leaves
        const tally = maciState.computeBatchVoteTally(startIndex, quadVoteTallyBatchSize)

        expect(tally.length.toString()).toEqual((5 ** voteOptionTreeDepth).toString())
        expect(tally[voteOptionIndex].toString()).toEqual(voteWeight.toString())

        const currentResultsSalt = bigInt(0)
        const newResultsSalt = genRandomSalt()

        const currentSpentVoiceCreditsSalt = bigInt(0)
        const newSpentVoiceCreditsSalt = genRandomSalt()

        const currentPerVOSpentVoiceCreditsCommitment = bigInt(0)
        const newPerVOSpentVoiceCreditsSalt = genRandomSalt()

        // Generate circuit inputs
        const circuitInputs 
            = maciState.genQuadVoteTallyCircuitInputs(
                startIndex,
                quadVoteTallyBatchSize,
                currentResultsSalt,
                newResultsSalt,
                currentSpentVoiceCreditsSalt,
                newSpentVoiceCreditsSalt,
                currentPerVOSpentVoiceCreditsCommitment,
                newPerVOSpentVoiceCreditsSalt,
            )

        expect(circuitInputs.stateLeaves.length).toEqual(quadVoteTallyBatchSize)

        const witness = circuit.calculateWitness(stringifyBigInts(circuitInputs))
        expect(circuit.checkWitness(witness)).toBeTruthy()

        // Check the result tally commitment
        const expectedResultsCommitmentOutput = witness[circuit.getSignalIdx('main.newResultsCommitment')]
        const expectedResultsCommitment = genTallyResultCommitment(tally, newResultsSalt, voteOptionTreeDepth)

        expect(expectedResultsCommitmentOutput.toString()).toEqual(expectedResultsCommitment.toString())

        // Check the total spent voice credit commitment
        const expectedSpentVoiceCreditsCommitmentOutput =
            witness[circuit.getSignalIdx('main.newSpentVoiceCreditsCommitment')]

        const expectedSpentVoiceCreditsCommitment = genSpentVoiceCreditsCommitment(
            voteWeight * voteWeight,
            newSpentVoiceCreditsSalt,
        )
        expect(expectedSpentVoiceCreditsCommitmentOutput.toString())
            .toEqual(expectedSpentVoiceCreditsCommitment.toString())

        // Check the total spent voice credit commitment per vote option
        const perVOSpentVoiceCredits = maciState.computeBatchPerVOSpentVoiceCredits(
            startIndex,
            quadVoteTallyBatchSize,
        )
        const expectedPerVOSpentVoiceCreditsCommitment = genPerVOSpentVoiceCreditsCommitment(
            perVOSpentVoiceCredits,
            newPerVOSpentVoiceCreditsSalt,
            voteOptionTreeDepth,
        )
        const expectedPerVOSpentVoiceCreditsCommitmentOutput =
            witness[circuit.getSignalIdx('main.newPerVOSpentVoiceCreditsCommitment')]

        expect(expectedPerVOSpentVoiceCreditsCommitmentOutput.toString())
            .toEqual(expectedPerVOSpentVoiceCreditsCommitment.toString())
    })
})
