import {
    compileAndLoadCircuit,
} from '../'

import {
    genRandomSalt,
    IncrementalQuinTree,
    SnarkBigInt,
    bigInt,
} from 'maci-crypto'

const LEVELS = 3
const ZERO_VALUE = 0

describe('Quin Merkle Tree circuits', () => {
    describe('QuinTreeInsertionProof', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('test/quinTreeInclusionProof_test.circom')
        })

        it('Valid QuinTreeInsertionProof inputs should work', async () => {
            const tree = new IncrementalQuinTree(LEVELS, ZERO_VALUE)

            for (let i = 0; i < 30; i++) {
                const randomVal = genRandomSalt()
                tree.insert(randomVal)
            }
            const index = 7
            const path = tree.genMerklePath(index)
            const isValid = IncrementalQuinTree.verifyMerklePath(
                path,
                tree.hashFunc,
            )
            expect(isValid).toBeTruthy()

            const circuitInputs = {
                path_elements: path.pathElements,
                path_index: path.indices,
                leaf: tree.leaves[index],
            }
            const witness = circuit.calculateWitness(circuitInputs)
            expect(circuit.checkWitness(witness)).toBeTruthy()
            const circuitRoot = witness[circuit.getSignalIdx('main.root')].toString()
            expect(circuitRoot.toString()).toEqual(tree.root.toString())
        })

        it('An modified Merkle proof should produce a different root', async () => {
            const tree = new IncrementalQuinTree(LEVELS, ZERO_VALUE)

            for (let i = 0; i < 30; i++) {
                const randomVal = genRandomSalt()
                tree.insert(randomVal)
            }
            const index = 7
            const path = tree.genMerklePath(index)
            const isValid = IncrementalQuinTree.verifyMerklePath(
                path,
                tree.hashFunc,
            )
            expect(isValid).toBeTruthy()

            path.pathElements[0][0] += bigInt(1)

            const circuitInputs = {
                path_elements: path.pathElements,
                path_index: path.indices,
                leaf: tree.leaves[index],
            }

            const witness = circuit.calculateWitness(circuitInputs)
            expect(circuit.checkWitness(witness)).toBeTruthy()
            const circuitRoot = witness[circuit.getSignalIdx('main.root')].toString()
            expect(circuitRoot.toString()).not.toEqual(tree.root.toString())
        })
    })

    describe('QuinCheckRoot', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('test/quinTreeCheckRoot_test.circom')
        })

        it('Valid CheckRoot inputs should work', async () => {
            const tree = new IncrementalQuinTree(LEVELS, ZERO_VALUE)
            const leaves: SnarkBigInt[] = []

            for (let i = 0; i < 5 ** LEVELS; i++) {
                const randomVal = genRandomSalt()
                tree.insert(randomVal)
                leaves.push(randomVal)
            }

            const root = tree.root

            const circuitInputs = { leaves }

            const witness = circuit.calculateWitness(circuitInputs)
            expect(circuit.checkWitness(witness)).toBeTruthy()
            const circuitRoot = witness[circuit.getSignalIdx('main.root')].toString()

            expect(circuitRoot).toEqual(root.toString())
        })

        it('Different leaves should generate a different root', async () => {
            const tree = new IncrementalQuinTree(LEVELS, ZERO_VALUE)
            const leaves: SnarkBigInt[] = []

            for (let i = 0; i < 5 ** LEVELS; i++) {
                const randomVal = genRandomSalt()
                tree.insert(randomVal)
                leaves.push(randomVal)
            }

            leaves[0] = bigInt(0)

            const root = tree.root

            const circuitInputs = { leaves }

            const witness = circuit.calculateWitness(circuitInputs)
            expect(circuit.checkWitness(witness)).toBeTruthy()
            const circuitRoot = witness[circuit.getSignalIdx('main.root')].toString()

            expect(circuitRoot).not.toEqual(root.toString())
        })
    })

    describe('QuinLeafExists', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('test/quinTreeLeafExists_test.circom')
        })

        it('Valid QuinLeafExists inputs should work', async () => {
            const tree = new IncrementalQuinTree(LEVELS, ZERO_VALUE)

            const index = 7
            for (let i = 0; i < 30; i++) {
                const randomVal = genRandomSalt()
                tree.insert(randomVal)
            }
            const path = tree.genMerklePath(index)
            const isValid = IncrementalQuinTree.verifyMerklePath(
                path,
                tree.hashFunc,
            )
            expect(isValid).toBeTruthy()

            const circuitInputs = {
                path_elements: path.pathElements,
                path_index: path.indices,
                leaf: tree.leaves[index],
                root: tree.root,
            }
            const witness = circuit.calculateWitness(circuitInputs)
            expect(circuit.checkWitness(witness)).toBeTruthy()
        })

        it('Invalid QuinLeafExists inputs should not work', async () => {
            const tree = new IncrementalQuinTree(LEVELS, ZERO_VALUE)

            const index = 7
            for (let i = 0; i < 30; i++) {
                const randomVal = genRandomSalt()
                tree.insert(randomVal)
            }
            const path = tree.genMerklePath(index)
            const isValid = IncrementalQuinTree.verifyMerklePath(
                path,
                tree.hashFunc,
            )
            expect(isValid).toBeTruthy()

            path.pathElements[0][0] += bigInt(1)

            const circuitInputs = {
                path_elements: path.pathElements,
                path_index: path.indices,
                leaf: tree.leaves[index],
                root: tree.root,
            }
            expect(() => {
                circuit.calculateWitness(circuitInputs)
            }).toThrow()
        })
    })
})
