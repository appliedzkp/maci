import { config } from 'maci-config'
import { 
    genTallyResultCommitment,
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
    VoteLeaf,
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
        const vote = new VoteLeaf(bigInt(9), bigInt(0))
        const command = new Command(
            bigInt(1),
            user.pubKey,
            voteOptionIndex,
            vote,
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
            expect(currentResults[i].pack().toString()).toEqual(bigInt(0).toString())
        }

        // Calculate the vote tally for a batch of state leaves
        const tally = maciState.computeBatchVoteTally(startIndex, quadVoteTallyBatchSize)

        expect(tally.length.toString()).toEqual((5 ** voteOptionTreeDepth).toString())
        expect(tally[voteOptionIndex].pack().toString()).toEqual(vote.pack().toString())

        const currentResultsSalt = bigInt(0)
        const newResultsSalt = genRandomSalt()

        // Generate circuit inputs
        const circuitInputs 
            = maciState.genQuadVoteTallyCircuitInputs(
                startIndex,
                quadVoteTallyBatchSize,
                currentResultsSalt,
                newResultsSalt,
            )

        expect(circuitInputs.stateLeaves.length).toEqual(quadVoteTallyBatchSize)

        const witness = circuit.calculateWitness(stringifyBigInts(circuitInputs))
        expect(circuit.checkWitness(witness)).toBeTruthy()
        const result = witness[circuit.getSignalIdx('main.newResultsCommitment')]
        const expectedCommitment = genTallyResultCommitment(tally, newResultsSalt, voteOptionTreeDepth)

        expect(result.toString()).toEqual(expectedCommitment.toString())
    })
})
