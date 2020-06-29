import * as assert from 'assert'
import {
    stringifyBigInts,
    genRandomSalt,
    IncrementalQuinTree,
    bigInt,
    SnarkBigInt,
    hash5,
} from '../'

const ZERO_VALUE = bigInt(0)
const DEPTH = 4
const LEAVES_PER_NODE = 5

const computeEmptyRoot = (
    depth: number,
    zeroValue: SnarkBigInt,
): SnarkBigInt => {
    assert(depth > 0)
    const zeros: SnarkBigInt[] = []
    zeros.push(zeroValue)

    for (let i = 1; i < depth; i ++) {
        const node: SnarkBigInt[] = []
        for (let j = 0; j < LEAVES_PER_NODE; j ++) {
            node.push(zeros[i-1])
        }
        zeros.push(hash5(node))
    }

    const n: SnarkBigInt[] = []
    for (let i = 0; i < LEAVES_PER_NODE; i ++) {
        n.push(zeros[depth - 1])
    }

    return hash5(n)
}

const computeRootFromLeaves = (
    leaves: SnarkBigInt[],
): SnarkBigInt => {
    if (leaves.length === 1) {
        return leaves[0]
    }

    assert(leaves.length % LEAVES_PER_NODE === 0)

    const hashes: SnarkBigInt[] = []
    for (let i = 0; i < leaves.length / LEAVES_PER_NODE; i ++) {
        const r: SnarkBigInt[] = []
        for (let j = 0; j < LEAVES_PER_NODE; j ++) {
            r.push(leaves[i * LEAVES_PER_NODE + j])
        }
        hashes.push(hash5(r))
    }
    return computeRootFromLeaves(hashes)
}

describe('Quin Merkle Tree', () => {

    it('the constructor should calculate the correct empty root', () => {
        const tree = new IncrementalQuinTree(DEPTH, ZERO_VALUE, LEAVES_PER_NODE)
        expect(computeEmptyRoot(DEPTH, ZERO_VALUE).toString())
            .toEqual(tree.root.toString())

        const leaves: SnarkBigInt[] = []
        for (let i = 0; i < LEAVES_PER_NODE ** DEPTH; i ++) {
            leaves.push(ZERO_VALUE)
        }
        expect(computeRootFromLeaves(leaves).toString())
            .toEqual(tree.root.toString())
    })

    it('insert() should calculate a correct root', () => {
        const tree = new IncrementalQuinTree(DEPTH, ZERO_VALUE, LEAVES_PER_NODE)
        const numToInsert = LEAVES_PER_NODE + 2
        const leaves: SnarkBigInt[] = []
        for (let i = 0; i < numToInsert; i ++) {
            const leaf = bigInt(i + 1)
            leaves.push(leaf)
            tree.insert(leaf)
        }

        for (let i = leaves.length; i < LEAVES_PER_NODE ** DEPTH; i ++) {
            leaves.push(ZERO_VALUE)
        }

        expect(computeRootFromLeaves(leaves).toString())
            .toEqual(tree.root.toString())
    })

    it('update() should calculate a correct root', () => {
        const tree = new IncrementalQuinTree(DEPTH, ZERO_VALUE, LEAVES_PER_NODE)
        const numToInsert = LEAVES_PER_NODE * 2
        const leaves: SnarkBigInt[] = []
        for (let i = 0; i < numToInsert; i ++) {
            const leaf = bigInt(i + 1)
            leaves.push(leaf)
            tree.insert(leaf)
        }

        for (let i = leaves.length; i < LEAVES_PER_NODE ** DEPTH; i ++) {
            leaves.push(ZERO_VALUE)
        }

        const newLeaf = bigInt(6)
        leaves[0] = newLeaf
        tree.update(0, newLeaf)
        expect(computeRootFromLeaves(leaves).toString())
            .toEqual(tree.root.toString())
    })

    it('copy() should produce a deep copy', () => {
        const tree = new IncrementalQuinTree(DEPTH, ZERO_VALUE, LEAVES_PER_NODE)
        const numToInsert = LEAVES_PER_NODE * 2
        for (let i = 0; i < numToInsert; i ++) {
            const leaf = bigInt(i + 1)
            tree.insert(leaf)
        }

        const newTree = tree.copy()
        const leaf = genRandomSalt()
        tree.insert(leaf)
        newTree.insert(leaf)
        expect(tree.root.toString()).toEqual(newTree.root.toString())

        tree.update(0, leaf)
        newTree.update(0, leaf)
        expect(tree.root.toString()).toEqual(newTree.root.toString())

        const path1 = tree.genMerklePath(2)
        const path2 = newTree.genMerklePath(2)
        expect(JSON.stringify(stringifyBigInts(path1))).toEqual(JSON.stringify(stringifyBigInts(path2)))
    })

    describe('Tree with 4 leaves per node', () => {
        it ('should throw', () => {
            expect(() => {
                new IncrementalQuinTree(DEPTH, ZERO_VALUE, 4)
            }).toThrow()
        })
        //// TODO: not supported yet
        //it ('should compute the correct root', () => {
            //const tree = new IncrementalQuinTree(DEPTH, ZERO_VALUE, 4)
            //for (let i = 0; i < 6; i ++) {
                //tree.insert(i)
            //}
            //const leaves = [0, 1, 2, 3, 0, 4, 5]
            //for (let i = leaves.length; i < 5 ** DEPTH; i ++) {
                //leaves.push(ZERO_VALUE)
            //}
            //expect(tree.root.toString()).toEqual(computeRootFromLeaves(leaves).toString())
        //})
    })

    describe('Path generation and verification', () => {
        let tree
        const numToInsert = 5 ** DEPTH

        beforeAll(() => {
            tree = new IncrementalQuinTree(DEPTH, ZERO_VALUE, LEAVES_PER_NODE)
            for (let i = 0; i < numToInsert; i ++) {
                const leaf = bigInt(i + 1)
                tree.insert(leaf)
            }
        })

        it('genMerklePath() should fail if the index is invalid', () => {
            expect(() => {
                tree.genMerklePath(numToInsert)
            }).toThrow()
        })

        it('verifyMerklePath() should reject an invalid proof (with the right format)', () => {
            const path = tree.genMerklePath(numToInsert - 1)
            path.pathElements[0][0] = bigInt(123)
            const isValid = IncrementalQuinTree.verifyMerklePath(
                path,
                tree.hashFunc,
            )

            expect(isValid).toBeFalsy()
        })

        it('verifyMerklePath() should reject an invalid proof (with the wrong format)', () => {
            const path = tree.genMerklePath(numToInsert - 1)
            path.pathElements[0] = null
            expect(() => {
                IncrementalQuinTree.verifyMerklePath(
                    path,
                    tree.hashFunc,
                )
            }).toThrow()
        })

        it('genMerklePath() should calculate a correct Merkle path', () => {

            const path = tree.genMerklePath(30)

            const isValid = IncrementalQuinTree.verifyMerklePath(
                path,
                tree.hashFunc,
            )

            expect(isValid).toBeTruthy()
        })

        it('genMerklePath() should calculate a correct Merkle path for each most recently inserted leaf', () => {
            const tree = new IncrementalQuinTree(DEPTH, ZERO_VALUE, LEAVES_PER_NODE)
            const numToInsert = LEAVES_PER_NODE * 2

            expect.assertions(numToInsert)
            for (let i = 0; i < numToInsert; i ++) {
                const leaf = bigInt(i + 1)
                tree.insert(leaf)

                const path = tree.genMerklePath(i)
                const isValid = IncrementalQuinTree.verifyMerklePath(
                    path,
                    tree.hashFunc,
                )
        
                expect(isValid).toBeTruthy()
            }
        })
    })
})
