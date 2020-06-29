import * as path from 'path'
import { Circuit } from 'snarkjs'
const compiler = require('circom')

import {
    stringifyBigInts,
    verifySignature,
    bigInt,
    hash11,
    bigInt2Buffer,
} from 'maci-crypto'

import {
    Keypair,
    Command,
} from 'maci-domainobjs'

import {
    compileAndLoadCircuit,
} from '../'
import * as circomlib from 'circomlib'

describe('Signature verification circuit', () => {
    let circuit
    beforeAll(async () => {
        circuit = await compileAndLoadCircuit('test/verifySignature_test.circom')
    })

    it('verifies a valid signature created with circomlib', async () => {

        const keypair = new Keypair()
        const command = new Command(
            bigInt(0),
            keypair.pubKey,
            bigInt(123),
            bigInt(123),
            bigInt(1),
        )

        const signer = new Keypair()
        const privKey = bigInt2Buffer(signer.privKey.rawPrivKey)
        const pubKey = circomlib.eddsa.prv2pub(privKey)
        const plaintext = hash11(command.asArray())
        const sig = circomlib.eddsa.signMiMCSponge(privKey, plaintext)

        expect(verifySignature(plaintext, sig, pubKey)).toBeTruthy()

        const circuitInputs = stringifyBigInts({
            'from_x': stringifyBigInts(pubKey[0]),
            'from_y': stringifyBigInts(pubKey[1]),
            'R8x': stringifyBigInts(sig.R8[0]),
            'R8y': stringifyBigInts(sig.R8[1]),
            'S': stringifyBigInts(sig.S),
            'preimage': stringifyBigInts(command.asArray())
        })

        const witness = circuit.calculateWitness(circuitInputs)
        expect(circuit.checkWitness(witness)).toBeTruthy()

        const idx = circuit.getSignalIdx('main.valid')
        const isValid = witness[idx].toString()
        expect(isValid).toEqual('1')
    })

    it('verifies a valid signature', async () => {

        const keypair = new Keypair()
        const command = new Command(
            bigInt(0),
            keypair.pubKey,
            bigInt(123),
            bigInt(123),
            bigInt(1),
        )

        const signer = new Keypair()
        const sig = command.sign(signer.privKey)
        const plaintext = hash11(command.asArray())

        expect(verifySignature(plaintext, sig, signer.pubKey.rawPubKey)).toBeTruthy()

        const circuitInputs = stringifyBigInts({
            'from_x': stringifyBigInts(signer.pubKey.rawPubKey[0]),
            'from_y': stringifyBigInts(signer.pubKey.rawPubKey[1]),
            'R8x': stringifyBigInts(sig.R8[0]),
            'R8y': stringifyBigInts(sig.R8[1]),
            'S': stringifyBigInts(sig.S),
            'preimage': stringifyBigInts(command.asArray())
        })

        const witness = circuit.calculateWitness(circuitInputs)
        expect(circuit.checkWitness(witness)).toBeTruthy()

        const idx = circuit.getSignalIdx('main.valid')
        const isValid = witness[idx].toString()
        expect(isValid).toEqual('1')
    })

    it('rejects an invalid signature', async () => {
        const circuitDef = await compiler(path.join(__dirname, 'circuits', '../../../circom/test/verifySignature_test.circom'))
        const circuit = new Circuit(circuitDef)

        const keypair = new Keypair()
        const command = new Command(
            bigInt(0),
            keypair.pubKey,
            bigInt(123),
            bigInt(123),
            bigInt(1),
        )

        const signer = new Keypair()
        const wrongSigner = new Keypair()

        expect(signer.privKey.rawPrivKey).not.toEqual(wrongSigner.privKey.rawPrivKey)
        const sig = command.sign(signer.privKey)

        const plaintext = hash11(command.asArray())

        expect(verifySignature(plaintext, sig, wrongSigner.pubKey.rawPubKey)).toBeFalsy()

        const circuitInputs = stringifyBigInts({
            'from_x': wrongSigner.pubKey.rawPubKey[0],
            'from_y': wrongSigner.pubKey.rawPubKey[1],
            'R8x': sig.R8[0],
            'R8y': sig.R8[1],
            'S': sig.S,
            'preimage': command.asArray()
        })

        const witness = circuit.calculateWitness(circuitInputs)
        expect(circuit.checkWitness(witness)).toBeTruthy()

        const idx = circuit.getSignalIdx('main.valid')
        const isValid = witness[idx].toString()
        expect(isValid).toEqual('0')
    })
})
