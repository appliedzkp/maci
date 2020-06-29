import {
    compileAndLoadCircuit,
} from '../'

import { 
    stringifyBigInts,
} from 'maci-crypto'

describe('QuinSelector circuit', () => {
    let circuit 
    beforeAll(async () => {
        circuit = await compileAndLoadCircuit('test/quinSelector_test.circom')
    })

    it('Should return the nth value given an index', async () => {
        const items = [0, 1, 2, 3, 4]

        for (let i = 0; i < items.length; i ++) {
            const circuitInputs = stringifyBigInts({ in: items, index: i })

            const witness = circuit.calculateWitness(circuitInputs)
            expect(circuit.checkWitness(witness)).toBeTruthy()
            const idx = circuit.getSignalIdx('main.out')
            const selected = witness[idx].toString()
            expect(selected).toEqual(items[i].toString())
        }
    })
})
