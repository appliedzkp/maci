import {
    compileAndLoadCircuit,
} from '../'

import { 
    bigInt,
    SnarkBigInt,
} from 'maci-crypto'

const toBase5 = (x: number) => {
    const result: number[] = []
    while(true) {
        if (x == 0) {
            break
        }
        result.push(x % 5)
        x = Math.floor(x / 5)
    }
    return result
}

describe('QuinGeneratePathIndices circuit', () => {
    let circuit 
    beforeAll(async () => {
        circuit = await compileAndLoadCircuit('test/quinGeneratePathIndices_test.circom')
    })

    it('Should return the correct result', async () => {
        const index = 600

        const depth = 4
        const circuitInputs = {
            in: index
        }

        const witness = circuit.calculateWitness(circuitInputs)
        expect(circuit.checkWitness(witness)).toBeTruthy()
        const result: SnarkBigInt[] = []
        for (let i = 0; i < depth; i ++) {
            const idx = circuit.getSignalIdx('main.out[' + i + ']')
            result.push(bigInt(witness[idx].toString()))
        }
        expect(JSON.stringify(result.map((x) => x.toJSNumber()))).toEqual(
            JSON.stringify(toBase5(index))
        )
    })
})
