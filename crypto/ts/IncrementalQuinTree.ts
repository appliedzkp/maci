import * as assert from 'assert'
import {
    SnarkBigInt,
    hashLeftRight,
    hash5,
    bigInt,
    stringifyBigInts,
    unstringifyBigInts,
} from './'

type Leaf = SnarkBigInt
type Root = SnarkBigInt
type PathElements = SnarkBigInt[]
type Indices = SnarkBigInt[]

interface MerkleProof {
    pathElements: PathElements;
    indices: Indices;
    depth: number;
    root: SnarkBigInt;
    leaf: Leaf;
}

const deepCopyBigIntArray = (arr: SnarkBigInt[]) => {
    return arr.map((x) => bigInt(x.toString()))
}

/* 
 * An incremental Merkle tree which conforms to the implementation in
 * IncrementalQuinTree.sol. It supports 2 or 5 elements per leaf.
 */
class IncrementalQuinTree {
    // The number of leaves per node
    public leavesPerNode: SnarkBigInt

    // The tree depth
    public depth: number

    // The default value for empty leaves
    public zeroValue: SnarkBigInt

    // The tree root
    public root: SnarkBigInt

    // The the smallest empty leaf index
    public nextIndex: SnarkBigInt

    // All leaves in the tree
    public leaves: Leaf[] = []

    // Contains the zero value per level. i.e. zeros[0] is zeroValue,
    // zeros[1] is the hash of leavesPerNode zeros, and so on.
    public zeros: SnarkBigInt[] = []

    // Caches values needed for efficient appends.
    public filledSubtrees: SnarkBigInt[][] = []

    // Caches values needed to compute Merkle paths.
    public filledPaths: any = {}

    // The hash function to use
    public hashFunc: (leaves: SnarkBigInt[]) => SnarkBigInt


    constructor (
        _depth: number,
        _zeroValue: SnarkBigInt,
        _leavesPerNode: number | SnarkBigInt = 5,
    ) {
        // This class supports either 2 leaves per node, or 5 leaves per node.
        // 5 is largest number of inputs which circomlib's Poseidon EVM hash
        // function implementation provides for.
        // TODO: modify this to support 3 or 4 leaves per node

        this.leavesPerNode = bigInt(_leavesPerNode)
        assert(this.leavesPerNode.equals(bigInt(2)) || this.leavesPerNode.equals(bigInt(5)))

        this.depth = bigInt(_depth)
        this.nextIndex = bigInt(0)
        this.zeroValue = bigInt(_zeroValue)

        // Set this.hashFunc depending on the number of leaves per node
        if (this.leavesPerNode === bigInt(2)) {
            // Uses PoseidonT3 under the hood, which accepts 2 inputs
            this.hashFunc = (inputs: SnarkBigInt[]) => {
                return hashLeftRight(inputs[0], inputs[1])
            }
        } else {
            // Uses PoseidonT6 under the hood, which accepts up to 5 inputs
            this.hashFunc = hash5
        }

        this.zeros = []
        this.filledSubtrees = []
        let currentLevelHash = this.zeroValue

        // Calculate intermediate values
        for (let i = bigInt(0); i < this.depth; i++) {
            if (i < this.depth - bigInt(1)) {
                this.filledPaths[i] = []
            }
            this.zeros.push(currentLevelHash)

            const z: SnarkBigInt[] = []
            for (let j = bigInt(0); j < this.leavesPerNode; j ++) {
                z.push(this.zeros[i])
            }
            this.filledSubtrees.push(z)

            currentLevelHash = this.hash(z)
        }

        // Calculate the root
        this.root = this.hash(this.filledSubtrees[this.depth - bigInt(1)])
    }

    /* 
     * Insert a leaf into the Merkle tree
     * @param _value The value to insert. This may or may not already be
     *               hashed.
     */
    public insert(
        _value: Leaf,
    ) {
        // Ensure that _value is a SnarkBigInt
        _value = bigInt(_value)

        // A node is one level above the leaf
        // m is the leaf's relative position within its node
        let m = this.nextIndex % this.leavesPerNode

        // Zero out the level in filledSubtrees
        if (m === bigInt(0)) {
            for (let j = bigInt(1); j < this.filledSubtrees[0].length; j ++) {
                this.filledSubtrees[0][j] = this.zeros[0]
            }
        }

        this.filledSubtrees[0][m] = _value

        let currentIndex: SnarkBigInt = this.nextIndex
        for (let i = 1; i < this.depth; i++) {
            // currentIndex is the leaf or node's absolute index
            currentIndex /= this.leavesPerNode

            // m is the leaf's relative position within its node
            m = currentIndex % this.leavesPerNode

            // Zero out the level
            if (m === bigInt(0)) {
                for (let j = bigInt(1); j < this.filledSubtrees[i].length; j ++) {
                    this.filledSubtrees[i][j] = this.zeros[i]
                }
            }

            const hashed = this.hash(this.filledSubtrees[i - 1])
            this.filledSubtrees[i][m] = hashed

            if (this.filledPaths[i - 1].length <= currentIndex) {
                this.filledPaths[i - 1].push(hashed)
            } else {
                this.filledPaths[i - 1][currentIndex] = hashed
            }
        }

        this.leaves.push(_value)
        this.nextIndex += bigInt(1)
        this.root = this.hash(
            this.filledSubtrees[this.filledSubtrees.length - 1],
        )
    }

    /* 
     * Update the leaf at the specified index with the given value.
     */
    public update(
        _index: number,
        _value: Leaf,
    ) {
        if (_index >= this.nextIndex || _index >= this.leaves.length) {
            throw new Error('The leaf index specified is too large')
        }

        _value = bigInt(_value)

        const temp = this.leaves
        temp[_index] = _value

        this.leaves[_index] = _value

        const newTree = new IncrementalQuinTree(
            this.depth,
            this.zeroValue,
            this.leavesPerNode,
        )

        for (let i = 0; i < temp.length; i++) {
            newTree.insert(temp[i])
        }

        this.leaves = newTree.leaves
        this.zeros = newTree.zeros
        this.filledSubtrees = newTree.filledSubtrees
        this.filledPaths = newTree.filledPaths
        this.root = newTree.root
        this.nextIndex = newTree.nextIndex
    }

    /*
     * Returns the leaf value at the given index
     */
    public getLeaf(_index: number): Leaf {
        return this.leaves[_index]
    }

    /*  Generates a Merkle proof from a leaf to the root.
     */
    public genMerklePath(_index: number): MerkleProof {
        if (_index < 0) {
            throw new Error('The leaf index must be greater than 0')
        }
        if (_index >= this.nextIndex || _index >= this.leaves.length) {
            throw new Error('The leaf index is too large')
        }

        const pathElements: SnarkBigInt[][] = []
        const indices: SnarkBigInt[] = [bigInt(_index) % this.leavesPerNode]

        let r = bigInt(_index).div(this.leavesPerNode)

        for (let i = 0; i < this.depth; i ++) {
            const s: SnarkBigInt[] = []
            if (i === 0) {
                // Get a slice of leaves, padded with zeros
                const leafStartIndex = bigInt(_index) - (bigInt(_index) % this.leavesPerNode)
                const leafEndIndex = leafStartIndex + this.leavesPerNode
                for (let j = leafStartIndex; j < leafEndIndex; j ++) {
                    if (j < this.leaves.length) {
                        s.push(this.leaves[j])
                    } else {
                        s.push(this.zeros[i])
                    }
                }
            } else {
                for (let j = 0; j < this.leavesPerNode; j ++) {
                    const x = r.mul(this.leavesPerNode) + bigInt(j)
                    if (this.filledPaths[i - 1].length <= x) {
                        s.push(this.zeros[i])
                    } else {
                        const e = this.filledPaths[i - 1][x]
                        s.push(e)
                    }
                }
            }

            const p = r % this.leavesPerNode
            pathElements.push(s)

            if (i < this.depth - bigInt(1)) {
                indices.push(p)
            }

            r = r.div(this.leavesPerNode)
        }

        // Remove the commitments to elements which are the leaves per level
        let newPe: SnarkBigInt[] = [[]]
        const firstIndex = bigInt(_index) % this.leavesPerNode

        for (let i = 0; i < pathElements[0].length; i ++) {
            if (bigInt(i) !== firstIndex) {
                newPe[0].push(pathElements[0][i])
            }
        }

        for (let i = 1; i < pathElements.length; i ++) {
            const level: SnarkBigInt[] = []
            for (let j = 0; j < pathElements[i].length; j ++) {
                if (bigInt(j) !== indices[i]) {
                    level.push(pathElements[i][j])
                }
            }
            newPe.push(level)
        }

        // If there are only 2 leaves per node, flatten pathElements
        if (this.leavesPerNode === bigInt(2)) {
            const flattened: SnarkBigInt[] = []
            for (const level of newPe) {
                assert(level.length === 1)
                flattened.push(level[0])
            }
            newPe = flattened
        }

        return {
            pathElements: newPe,
            indices,
            depth: this.depth,
            root: this.root,
            leaf: this.leaves[_index],
        }
    }

    public static verifyMerklePath(
        _proof: MerkleProof,
        _hashFunc: (leaves: SnarkBigInt[]) => SnarkBigInt,
    ): boolean {
        assert (_proof.pathElements)

        let pathElements: SnarkBigInt[]
        // If there are only 2 leaves per node, un-flatten pathElements
        if (! Array.isArray(_proof.pathElements[0])) {
            pathElements = []
            for (const element of _proof.pathElements) {
                pathElements.push([element])
            }
        } else {
            pathElements = _proof.pathElements
        }

        // Validate the proof format
        assert (_proof.indices)
        for (let i = 0; i < _proof.depth; i ++) {
            assert(pathElements[i])
            assert(_proof.indices[i] != undefined)
        }

        // Hash the first level
        const firstLevel: SnarkBigInt[] = pathElements[0].map(bigInt)
        firstLevel.splice(_proof.indices[0].toJSNumber(), 0, _proof.leaf)
        let currentLevelHash: SnarkBigInt = _hashFunc(firstLevel)

        // Verify the proof
        for (let i = 1; i < pathElements.length; i ++) {
            const level: SnarkBigInt[] = pathElements[i].map(bigInt)
            level.splice(_proof.indices[i].toJSNumber(), 0, currentLevelHash)
            currentLevelHash = _hashFunc(level)
        }

        return currentLevelHash.equals(_proof.root)
    }

    /*  Deep-copies this object
     */
    public copy(): IncrementalQuinTree {
        const newTree = new IncrementalQuinTree(
            this.depth,
            this.zeroValue,
            this.leavesPerNode,
        )
        newTree.leaves = deepCopyBigIntArray(this.leaves)
        newTree.zeros = deepCopyBigIntArray(this.zeros)
        newTree.root = this.root
        newTree.nextIndex = this.nextIndex
        newTree.filledSubtrees = this.filledSubtrees.map(deepCopyBigIntArray)
        newTree.filledPaths = unstringifyBigInts(JSON.parse(
            JSON.stringify(stringifyBigInts(this.filledPaths))
        ))

        return newTree
    }

    public hash(_leaves: SnarkBigInt[]): SnarkBigInt  {
        if (this.leavesPerNode > bigInt(2)) {
            while (_leaves.length < 5) {
                _leaves.push(this.zeroValue)
            }
        }
        return this.hashFunc(_leaves)
    }
}

export {
    IncrementalQuinTree,
}
