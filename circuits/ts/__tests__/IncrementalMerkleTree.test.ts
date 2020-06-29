import {
    compileAndLoadCircuit,
} from '../'

import {
    genRandomSalt,
    IncrementalQuinTree,
    hashOne,
    SnarkBigInt,
    bigInt,
} from 'maci-crypto'

const LEVELS = 4
const ZERO_VALUE = 0

describe('Merkle Tree circuits', () => {
    describe('LeafExists', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('test/merkleTreeLeafExists_test.circom')
        })

        it('Valid LeafExists inputs should work', async () => {
            const tree = new IncrementalQuinTree(LEVELS, ZERO_VALUE, 2)
            const leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randomVal = Math.floor(Math.random() * 1000)
                tree.insert(hashOne(randomVal))
                leaves.push(hashOne(randomVal))
            }

            const root = tree.root

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const proof = tree.genMerklePath(i)
                const circuitInputs = {
                    leaf: leaves[i],
                    path_elements: proof.pathElements,
                    path_index: proof.indices,
                    root,
                }
                const witness = circuit.calculateWitness(circuitInputs)
                expect(circuit.checkWitness(witness)).toBeTruthy()
            }
        })

        it('Invalid LeafExists inputs should not work', async () => {
            const tree = new IncrementalQuinTree(LEVELS, ZERO_VALUE, 2)
            const leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randomVal = Math.floor(Math.random() * 1000)
                tree.insert(randomVal)
                leaves.push(hashOne(randomVal))
            }

            const root = tree.root

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const proof = tree.genMerklePath(i)
                const circuitInputs = {
                    leaf: leaves[i],
                    // The following are swapped to delibrately create an error
                    path_elements: proof.pathElements,
                    path_index: proof.indices,
                    root,
                }
                expect(() => {
                    circuit.calculateWitness(circuitInputs)
                }).toThrow()
            }
        })
    })

    describe('CheckRoot', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('test/merkleTreeCheckRoot_test.circom')
        })

        it('Valid CheckRoot inputs should work', async () => {
            const tree = new IncrementalQuinTree(LEVELS, ZERO_VALUE, 2)
            const leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randomVal = Math.floor(Math.random() * 1000)
                tree.insert(hashOne(randomVal))
                leaves.push(hashOne(randomVal))
            }

            const root = tree.root

            const circuitInputs = { leaves }

            const witness = circuit.calculateWitness(circuitInputs)
            expect(witness[circuit.getSignalIdx('main.root')].toString())
                .toEqual(root.toString())
            expect(circuit.checkWitness(witness)).toBeTruthy()
        })

        it('Different leaves should generate a different root', async () => {
            const tree = new IncrementalQuinTree(LEVELS, ZERO_VALUE, 2)
            const leaves: SnarkBigInt[] = []
            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randomVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randomVal)
                tree.insert(leaf)

                // Give the circuit a different leaf
                leaves.push(bigInt(randomVal + 1))
            }

            const root = tree.root
            const circuitInputs = { leaves }
            const witness = circuit.calculateWitness(circuitInputs)
            expect(witness[circuit.getSignalIdx('main.root')].toString())
                .not.toEqual(root.toString())
            expect(circuit.checkWitness(witness)).toBeTruthy()
        })
    })

    describe('MerkleTreeInclusionProof', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('test/merkleTreeInclusionProof_test.circom')
        })

        it('Valid update proofs should work', async () => {
            const tree = new IncrementalQuinTree(LEVELS, ZERO_VALUE, 2)

            // Populate the tree
            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randomVal = genRandomSalt()
                const leaf = hashOne(randomVal)
                tree.insert(leaf)
            }

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randomVal = genRandomSalt()
                const leaf = hashOne(randomVal)

                tree.update(i, leaf)

                const proof = tree.genMerklePath(i)

                const root = tree.root

                const circuitInputs = {
                    leaf: leaf.toString(),
                    path_elements: proof.pathElements,
                    path_index: proof.indices
                }

                const witness = circuit.calculateWitness(circuitInputs)
                expect(circuit.checkWitness(witness)).toBeTruthy()

                expect(witness[circuit.getSignalIdx('main.root')].toString())
                    .toEqual(root.toString())
            }
        })

        it('Invalid update proofs should not work', async () => {
            const tree = new IncrementalQuinTree(LEVELS, ZERO_VALUE, 2)

            // Populate the tree
            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randomVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randomVal)
                tree.insert(leaf)
            }

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randomVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randomVal).toString()

                tree.insert(leaf)

                const proof = tree.genMerklePath(i)

                const circuitInputs = {
                    leaf: leaf.toString(),
                    // The following are swapped to delibrately create an error
                    path_elements: proof.indices,
                    path_index: proof.pathElements,
                }

                expect(() => {
                    circuit.calculateWitness(circuitInputs)
                }).toThrow()
            }
        })
    })
})
