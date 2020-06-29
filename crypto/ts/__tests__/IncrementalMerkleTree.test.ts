import {
    IncrementalQuinTree,
    bigInt,
    SnarkBigInt,
    hashOne,
    hashLeftRight,
    stringifyBigInts,
} from '../'

const ZERO_VALUE = 0
const DEPTH = 2

/*
 * Calculate a Merkle root given a list of leaves
 */
const calculateRoot = (
    leaves: SnarkBigInt[],
): SnarkBigInt => {
    const totalLeaves = 2 ** DEPTH
    const numLeafHashers = totalLeaves / 2
    const numIntermediateHashers = numLeafHashers - 1

    const hashes: SnarkBigInt[] = []

    for (let i=0; i < numLeafHashers; i++) {
        hashes.push(
            hashLeftRight(leaves[i * 2], leaves[i * 2 + 1])
        )
    }

    let k = 0
    for (let i = numLeafHashers; i < numLeafHashers + numIntermediateHashers; i++) {
        hashes.push(
            hashLeftRight(hashes[k * 2], hashes[k * 2 + 1])
        )
        k ++
    }

    return hashes[hashes.length - 1]
}

describe('Merkle Tree', () => {

    const tree = new IncrementalQuinTree(DEPTH, ZERO_VALUE, 2)

    it('Should calculate the correct root', () => {
        const leaves: SnarkBigInt[] = []
        for (let i = 0; i < 2 ** DEPTH; i ++) {
            const leaf = bigInt(i)
            leaves.push(leaf)
            tree.insert(leaf)
        }

        expect(calculateRoot(leaves).toString()).toEqual(tree.root.toString())
    })

    it('an updated tree should have the same root as another tree with the same leaves', () => {
        const tree1 = new IncrementalQuinTree(2, ZERO_VALUE, 2)
        const tree2 = new IncrementalQuinTree(2, ZERO_VALUE, 2)

        for (let i = 0; i < 4; i++) {
            tree1.insert(hashOne(i + 1))
            tree2.insert(hashOne(i + 1))
        }

        expect(tree1.root).toEqual(tree2.root)

        // Update the first tree at index 1
        const indexToUpdate = 1
        const newVal = hashOne(bigInt(9))
        tree1.update(indexToUpdate, newVal)
    
        // The roots must not match
        expect(tree1.root).not.toEqual(tree2.root)

        const tree3 = new IncrementalQuinTree(2, ZERO_VALUE, 2)
        for (const leaf of tree1.leaves) {
            tree3.insert(leaf)
        }
        expect(tree1.root).toEqual(tree3.root)
        expect(tree3.getLeaf(indexToUpdate).toString()).toEqual(newVal.toString())
    })

    it('copy() should produce a different object with the same attributes', () => {
        const copiedTree = tree.copy()

        expect(tree === tree).toBeTruthy()
        expect(tree === copiedTree).toBeFalsy()
        expect(tree.depth).toEqual(copiedTree.depth)
        expect(tree.zeroValue).toEqual(copiedTree.zeroValue)
        expect(JSON.stringify(stringifyBigInts(tree.leaves)))
            .toEqual(JSON.stringify(stringifyBigInts(copiedTree.leaves)))
        expect(JSON.stringify(stringifyBigInts(tree.zeros))).toEqual(JSON.stringify(stringifyBigInts(copiedTree.zeros)))
        expect(tree.filledSubtrees).toEqual(copiedTree.filledSubtrees)
        expect(tree.filledPaths).toEqual(copiedTree.filledPaths)
        expect(tree.root).toEqual(copiedTree.root)
        expect(tree.nextIndex).toEqual(copiedTree.nextIndex)

        const path1 = tree.genMerklePath(2)
        const path2 = copiedTree.genMerklePath(2)
        expect(JSON.stringify(stringifyBigInts(path1))).toEqual(JSON.stringify(stringifyBigInts(path2)))
    })

    it('intermediate tree generation', () => {
        const leaves = [
            bigInt(1),
            bigInt(8), 
            bigInt(7), 
            bigInt(7),
        ]
        const largeTree = new IncrementalQuinTree(4, 0, 2)
        const subTree = new IncrementalQuinTree(2, 0, 2)

        const b = subTree.root

        for (const leaf of leaves) {
            largeTree.insert(leaf)
            subTree.insert(leaf)
        }

        const agg = new IncrementalQuinTree(2, 0, 2)
        agg.insert(subTree.root)
        agg.insert(b)
        agg.insert(b)
        agg.insert(b)

        expect(agg.root.toString()).toEqual(largeTree.root.toString())
    
    })

    describe('Path generation and verification', () => {
        const DEPTH = 5
        let tree
        const numToInsert = 2 ** DEPTH

        beforeAll(() => {
            tree = new IncrementalQuinTree(DEPTH, ZERO_VALUE, 2)
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
            path.pathElements[0] = bigInt(123)
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

            const path = tree.genMerklePath(10)

            const isValid = IncrementalQuinTree.verifyMerklePath(
                path,
                tree.hashFunc,
            )

            expect(isValid).toBeTruthy()
        })

        it('genMerklePath() should calculate a correct Merkle path for each most recently inserted leaf', () => {
            const tree = new IncrementalQuinTree(DEPTH, ZERO_VALUE, 2)
            const numToInsert = 2 * 2

            expect.assertions(numToInsert)
            for (let i = 0; i < numToInsert; i ++) {
                const leaf = bigInt(i + 1)
                tree.insert(leaf)

                const path = tree.genMerklePath(i)
                const isValid = IncrementalQuinTree.verifyMerklePath(
                    path,
                    tree.hashFunc,
                )
                if (!isValid) { debugger }
        
                expect(isValid).toBeTruthy()
            }
        })
    })
})
