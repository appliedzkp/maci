import {
    VoteLeaf,
} from 'maci-domainobjs'

import {
    genRandomSalt,
    bigInt,
    SnarkBigInt,
} from 'maci-crypto'

import {
    compileAndLoadCircuit,
} from '../'

import {
    genTallyResultCommitment,
} from 'maci-core'

const DEPTH = 2
const NUM_OPTIONS = 5 ** DEPTH

const randVal = () => {
    return bigInt(Math.floor(Math.random() * 1000000000).toString())
}

/*
 * A helper function to generate circuit inputs to the ResultCommitmentVerifier
 * circuit
 */
const genResultCommitmentVerifierCircuitInputs = (
    currentResults: SnarkBigInt[],
    newResults: SnarkBigInt[],
    currentResultsSalt: SnarkBigInt,
    newResultsSalt: SnarkBigInt,
) => {

    const currentResultsCommitment = genTallyResultCommitment(
        currentResults,
        currentResultsSalt,
        DEPTH,
    )

    return {
        currentResultsSalt,
        currentResultsCommitment,
        currentResults: currentResults.map((x) => x.pack()),
        newResultsSalt,
        newResults: newResults.map((x) => x.pack()),
    }
}

describe('ResultCommitmentVerifier circuit', () => {
    let circuit 

    beforeAll(async () => {
        circuit = await compileAndLoadCircuit('test/resultCommitmentVerifier_test.circom')
    })

    it('should correctly verify the hashes of a set of inputs and results', async () => {

        const currentResultsSalt = genRandomSalt()
        const newResultsSalt = genRandomSalt()

        const currentResults: VoteLeaf[] = []
        const newResults: VoteLeaf[] = []

        for (let i = 0; i < NUM_OPTIONS; i ++) {
            const leaf = new VoteLeaf(randVal(), randVal())
            currentResults.push(leaf)
            newResults.push(leaf)
        }

        const newResultsCommitment = genTallyResultCommitment(newResults, newResultsSalt, DEPTH)

        const circuitInputs = genResultCommitmentVerifierCircuitInputs(
            currentResults,
            newResults,
            currentResultsSalt,
            newResultsSalt,
        )

        const witness = circuit.calculateWitness(circuitInputs)
        expect(circuit.checkWitness(witness)).toBeTruthy()
        const resultIdx = circuit.getSignalIdx('main.newResultsCommitment')
        const result = witness[resultIdx]
        expect(result.toString()).toEqual(newResultsCommitment.toString())
    })
})
