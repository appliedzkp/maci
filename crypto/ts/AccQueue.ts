import * as assert from 'assert'
import {
    hashLeftRight,
    hash5,
    stringifyBigInts,
    unstringifyBigInts,
} from './'

type Leaf = BigInt
type Root = BigInt

const deepCopyBigIntArray = (arr: BigInt[]) => {
    return arr.map((x) => BigInt(x.toString()))
}

/* 
 * An Accumulator Queue which conforms to the implementation in AccQueue.sol.
 * Each enqueue() operation updates a subtree, and a merge() operation combines
 * all subtrees into a main tree. 
 * It supports 2 or 5 elements per leaf.
 */
class AccQueue {

    private MAX_DEPTH = 32

    // The depth per subtree
    public subDepth: number

    // The number of inputs per hash function
    public hashLength: number

    // The default value for empty leaves
    public zeroValue: BigInt

    // The current subtree index. e.g. the first subtree has index 0, the
    // second has 1, and so on
    public currentSubtreeIndex = 0

    // The hash function to use
    public hashFunc: (leaves: Leaf[]) => BigInt

    // The number of leaves across all subtrees
    public numLeaves: BigInt = BigInt(0)

    // The current subtree represented as leaves per level
    public levels: BigInt[][] = []

    // The next index at which to enqueue a leaf or subroot per level
    public nextIndexPerLevel: number[] = []

    // The root of each complete subtree
    public subRoots: BigInt[] = []

    // The zero value per level. i.e. zeros[0] is zeroValue,
    // zeros[1] is the hash of leavesPerNode zeros, and so on.
    public zeros: BigInt[] = []

    constructor (
        _subDepth: number,
        _hashLength: number,
        _zeroValue: BigInt,
    ) {
        // This class supports either 2 leaves per node, or 5 leaves per node.
        // 5 is largest number of inputs which circomlib's Poseidon EVM hash
        // function implementation provides for.

        this.hashLength = _hashLength
        assert(this.hashLength === 2 || this.hashLength === 5)
        this.subDepth = _subDepth
        this.zeroValue = _zeroValue

        // Set this.hashFunc depending on the number of leaves per node
        if (this.hashLength === 2) {
            // Uses PoseidonT3 under the hood, which accepts 2 inputs
            this.hashFunc = (inputs: BigInt[]) => {
                return hashLeftRight(inputs[0], inputs[1])
            }
        } else {
            // Uses PoseidonT6 under the hood, which accepts up to 5 inputs
            this.hashFunc = hash5
        }

        let hashed = this.zeroValue
        for (let i = 0; i < this.MAX_DEPTH; i ++) {
            this.zeros.push(hashed)
            let e: BigInt[] = []
            if (this.hashLength === 2) {
                e = [0].map(BigInt)
                hashed = this.hashFunc([hashed, hashed])
            } else {
                e = [0, 0, 0, 0].map(BigInt)
                hashed = this.hashFunc(
                    [hashed, hashed, hashed, hashed, hashed ],
                )
            }
            this.levels.push(e)
            this.nextIndexPerLevel.push(0)
        }
    }

    public getSubRoot(_index: number) {
        return this.subRoots[_index]
    }

    /* 
     * Enqueue a leaf into the current subtree
     * @param _leaf The leaf to insert.
     */
    public enqueue(
        _leaf: Leaf,
    ) {
        // Ensure that _value is a BigInt
        _leaf = BigInt(_leaf)
        this.queue(_leaf, 0)

        this.numLeaves = BigInt(this.numLeaves) + BigInt(1)

        const subTreeCapacity = BigInt(this.hashLength ** this.subDepth)
        if (BigInt(this.numLeaves) % subTreeCapacity === BigInt(0)) {
            this.subRoots[this.currentSubtreeIndex] = this.levels[this.subDepth][0]
            this.currentSubtreeIndex ++
            this.levels[this.subDepth][0] = BigInt(0)
            for (let i = 0; i < this.MAX_DEPTH; i ++) {
                this.nextIndexPerLevel[i] = 0
            }
        }
    }

    private queue(
        _leaf: Leaf,
        _level: number,
    ) {
        if (_level > this.subDepth) {
            return;
        }
        const n = this.nextIndexPerLevel[_level]

        if (n != this.hashLength - 1) {
            // Just store the leaf
            this.levels[_level][n] = _leaf
            this.nextIndexPerLevel[_level] ++
            return
        } else {
            let hashed: BigInt
            if (this.hashLength === 2) {
                hashed = this.hashFunc([this.levels[_level][0], _leaf])
                this.levels[_level][0] = BigInt(0)
            } else {
                hashed = this.hashFunc([...this.levels[_level], _leaf])
                for (let i = 0; i < 4; i ++) {
                    this.levels[_level][i] = BigInt(0)
                }
            }

            this.nextIndexPerLevel[_level] = 0

            // Recurse
            this.queue(hashed, _level + 1);
        }
    }

    /*
     * Fill any empty leaves of the last subtree with zeros and store the
     * resulting subroot.
     */
    public fillLastSubTree() {
        // The total capacity of the subtree
        const subTreeCapacity = this.hashLength ** this.subDepth

        if (BigInt(this.numLeaves) % BigInt(subTreeCapacity) === BigInt(0)) {
            // If the subtree is completely empty, then the subroot is a
            // precalculated zero value
            this.subRoots[this.currentSubtreeIndex] = this.zeros[this.subDepth]

        } else {

            // Recurse
            this._fillLastSubTree(0)

            // Store the subroot
            this.subRoots[this.currentSubtreeIndex] = this.levels[this.subDepth][0]

            // Blank out the subtree data
            for (let i = 0; i < this.subDepth + 1; i ++) {
                if (this.hashLength === 2) {
                    this.levels[i][0] = BigInt(0)
                } else {
                    this.levels[i] = [0, 0, 0, 0].map(BigInt)
                }
            }
        }

        // Update the subtree index
        this.currentSubtreeIndex ++

        // Update the number of leaves
        this.numLeaves = BigInt(this.currentSubtreeIndex) * BigInt(subTreeCapacity)

    }

    private _fillLastSubTree(_level: number) {
        if (_level > this.subDepth) {
            return
        }

        const n = this.nextIndexPerLevel[_level]

        if (n !== 0) {
            // Fill the subtree level and hash the level
            let hashed: BigInt
            if (this.hashLength === 2) {
                hashed = this.hashFunc([
                    this.levels[_level][0],
                    this.zeros[_level],
                ])
            } else {
                for (let i = n; i < this.hashLength; i ++) {
                    this.levels[_level][i] = this.zeros[_level]
                }
                hashed = this.hashFunc(this.levels[_level])
            }

            // Update the subtree from the next level onwards with the new leaf
            this.queue(hashed, _level + 1)

            // Reset the current level
            this.nextIndexPerLevel[_level] = 0
        }

        // Recurse
        this._fillLastSubTree(_level + 1)
    }

    /*  
     *  Deep-copies this object
     */
    public copy(): AccQueue {
        const newAccQueue = new AccQueue(
            this.subDepth,
            this.hashLength,
            this.zeroValue,
        )
        newAccQueue.zeros = deepCopyBigIntArray(this.zeros)
        newAccQueue.currentSubtreeIndex = this.currentSubtreeIndex
        newAccQueue.numLeaves = this.numLeaves

        newAccQueue.levels = unstringifyBigInts(JSON.parse(
            JSON.stringify(stringifyBigInts(this.levels))
        ))
        newAccQueue.nextIndexPerLevel = JSON.parse(JSON.stringify(this.nextIndexPerLevel))
        newAccQueue.subRoots = deepCopyBigIntArray(this.subRoots)

        return newAccQueue
    }

    public hash(_leaves: BigInt[]): BigInt  {
        assert(_leaves.length === this.hashLength)
        return this.hashFunc(_leaves)
    }
}

export {
    AccQueue,
}
