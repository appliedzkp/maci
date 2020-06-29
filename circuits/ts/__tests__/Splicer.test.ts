import {
    compileAndLoadCircuit,
} from '../'

import { 
    stringifyBigInts,
    bigInt,
    SnarkBigInt,
} from 'maci-crypto'

describe('Splice circuit', () => {
    let circuit 
    beforeAll(async () => {
        circuit = await compileAndLoadCircuit('test/splicer_test.circom')
    })

    it('Should output the correct reconstructed level', async () => {
        expect.assertions(10)
        for (let index = 0; index < 5; index ++ ) {
            const items = [0, 20, 30, 40]
            const leaf  =  10
            const circuitInputs = stringifyBigInts({ in: items, leaf, index })

            const witness = circuit.calculateWitness(circuitInputs)
            expect(circuit.checkWitness(witness)).toBeTruthy()

            const output: SnarkBigInt[] = []
            for (let i = 0; i < items.length + 1; i ++) {
                const idx = circuit.getSignalIdx('main.out[' + i + ']')
                const selected = witness[idx].toString()
                output.push(bigInt(selected))
            }
            items.splice(index, 0, leaf)

            expect(JSON.stringify(stringifyBigInts(items.map(bigInt)))).toEqual(
                JSON.stringify(stringifyBigInts(output.map(bigInt)))
            )
        }
    })
})
