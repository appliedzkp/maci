import * as path from 'path'
import { Circuit } from 'snarkjs'
const compiler = require('circom')

import {
    compileAndLoadCircuit,
} from '../'

import {
    stringifyBigInts,
    genRandomSalt,
    hashLeftRight,
    hash5,
    hash11,
} from 'maci-crypto'

describe('Poseidon hash circuits', () => {
    let circuit

    describe('Hasher5', () => {
        it('correctly hashes 5 random value', async () => {
            circuit = await compileAndLoadCircuit('test/hasher5_test.circom')
            const preImages: any = []
            for (let i = 0; i < 5; i++) {
                preImages.push(genRandomSalt())
            }

            const circuitInputs = stringifyBigInts({
                in: preImages,
            })

            const witness = circuit.calculateWitness(circuitInputs)
            expect(circuit.checkWitness(witness)).toBeTruthy()

            const outputIdx = circuit.getSignalIdx('main.hash')
            const output = witness[outputIdx]

            const outputJS = hash5(preImages)

            expect(output.toString()).toEqual(outputJS.toString())
        })
    })
    describe('Hasher11', () => {
        it('correctly hashes 11 random value', async () => {
            circuit = await compileAndLoadCircuit('test/hasher11_test.circom')
            const preImages: any = []
            for (let i = 0; i < 11; i++) {
                preImages.push(genRandomSalt())
            }
            const circuitInputs = stringifyBigInts({
                in: preImages,
            })

            const witness = circuit.calculateWitness(circuitInputs)
            expect(circuit.checkWitness(witness)).toBeTruthy()

            const outputIdx = circuit.getSignalIdx('main.hash')
            const output = witness[outputIdx]

            const outputJS = hash11(preImages)

            expect(output.toString()).toEqual(outputJS.toString())
        })
    })

    describe('HashLeftRight', () => {

        it('correctly hashes two random values', async () => {
            const circuitDef = await compiler(path.join(__dirname, 'circuits', '../../../circom/test/hashleftright_test.circom'))
            const circuit = new Circuit(circuitDef)

            const left = genRandomSalt()
            const right = genRandomSalt()

            const circuitInputs = stringifyBigInts({ left, right })

            const witness = circuit.calculateWitness(circuitInputs)
            expect(circuit.checkWitness(witness)).toBeTruthy()

            const outputIdx = circuit.getSignalIdx('main.hash')
            const output = witness[outputIdx]

            const outputJS = hashLeftRight(left, right)

            expect(output.toString()).toEqual(outputJS.toString())
        })
    })
})
