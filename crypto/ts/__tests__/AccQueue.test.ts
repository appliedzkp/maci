import {
    IncrementalQuinTree,
    AccQueue,
} from '../'

describe('AccQueue', () => {
    describe('Enqueue operations', () => {
        describe('Binary AccQueue', () => {
            const HASH_LENGTH = 2
            const SUB_DEPTH = 2
            //const MAIN_DEPTH = 4
            const ZERO = BigInt(0)

            const aq = new AccQueue(SUB_DEPTH, HASH_LENGTH, ZERO)

            it('Should enqueue leaves into a subtree', async () => {
                const tree0 = new IncrementalQuinTree(SUB_DEPTH, ZERO, HASH_LENGTH)

                const subtreeCapacity = HASH_LENGTH ** SUB_DEPTH
                for (let i = 0; i < subtreeCapacity; i ++) {
                    const leaf = BigInt(i + 1)
                    tree0.insert(leaf)
                    aq.enqueue(leaf)
                }
                expect(aq.getSubRoot(0).toString()).toEqual(tree0.root.toString())
            })

            it('Should enqueue another subtree', async () => {
                const tree1 = new IncrementalQuinTree(SUB_DEPTH, ZERO, HASH_LENGTH)

                const subtreeCapacity = HASH_LENGTH ** SUB_DEPTH
                for (let i = 0; i < subtreeCapacity; i ++) {
                    const leaf = BigInt(i + 1)
                    tree1.insert(leaf)
                    aq.enqueue(leaf)
                }
                expect(aq.getSubRoot(1).toString()).toEqual(tree1.root.toString())
            })
        })

        describe('Quinary AccQueue', () => {
            const HASH_LENGTH = 5
            const SUB_DEPTH = 2
            const ZERO = BigInt(0)

            const aq = new AccQueue(SUB_DEPTH, HASH_LENGTH, ZERO)

            it('Should enqueue leaves into a subtree', async () => {
                const tree0 = new IncrementalQuinTree(SUB_DEPTH, ZERO, HASH_LENGTH)

                const subtreeCapacity = HASH_LENGTH ** SUB_DEPTH
                for (let i = 0; i < subtreeCapacity; i ++) {
                    const leaf = BigInt(i + 1)
                    tree0.insert(leaf)
                    aq.enqueue(leaf)
                }
                expect(aq.getSubRoot(0).toString()).toEqual(tree0.root.toString())
            })

            it('Should enqueue another subtree', async () => {
                const tree1 = new IncrementalQuinTree(SUB_DEPTH, ZERO, HASH_LENGTH)

                const subtreeCapacity = HASH_LENGTH ** SUB_DEPTH
                for (let i = 0; i < subtreeCapacity; i ++) {
                    const leaf = BigInt(i + 1)
                    tree1.insert(leaf)
                    aq.enqueue(leaf)
                }
                expect(aq.getSubRoot(1).toString()).toEqual(tree1.root.toString())
            })
        })
    })

    describe('Merge operations', () => {
        describe('Binary AccQueue', () => {
            const HASH_LENGTH = 2
            const SUB_DEPTH = 2
            const ZERO = BigInt(0)

            it('Filling an empty subtree should create the correct subroot', () => {
                const aq = new AccQueue(SUB_DEPTH, HASH_LENGTH, ZERO)
                const tree = new IncrementalQuinTree(SUB_DEPTH, ZERO, HASH_LENGTH)
                aq.fillLastSubTree()
                expect(aq.getSubRoot(0).toString()).toEqual(tree.root.toString())
            })

            it('Should fill an incomplete subtree', () => {
                const aq = new AccQueue(SUB_DEPTH, HASH_LENGTH, ZERO)
                const tree = new IncrementalQuinTree(SUB_DEPTH, ZERO, HASH_LENGTH)

                const leaf = BigInt(1)
                aq.enqueue(leaf)
                tree.insert(leaf)

                aq.fillLastSubTree()

                expect(aq.getSubRoot(0).toString()).toEqual(tree.root.toString())
            })

            it('Filling an empty subtree again should create the correct subroot', () => {
                const aq = new AccQueue(SUB_DEPTH, HASH_LENGTH, ZERO)
                const leaf = BigInt(1)

                // Create the first subtree with one leaf
                aq.enqueue(leaf)
                aq.fillLastSubTree()
                
                // Fill the second subtree with zeros
                aq.fillLastSubTree()
                const tree = new IncrementalQuinTree(SUB_DEPTH, ZERO, HASH_LENGTH)
                expect(aq.getSubRoot(1).toString()).toEqual(tree.root.toString())
            })

            it('fillLastSubTree() should be correct for every number of leaves in an incomplete subtree', () => {
                for (let i = 0; i < 2; i ++) {
                    const tree = new IncrementalQuinTree(SUB_DEPTH, ZERO, HASH_LENGTH)
                    const aq = new AccQueue(SUB_DEPTH, HASH_LENGTH, ZERO)
                    for (let j = 0; j < i; j ++) {
                        const leaf = BigInt(i + 1)
                        aq.enqueue(leaf)
                        tree.insert(leaf)
                    }
                    aq.fillLastSubTree()

                    expect(aq.getSubRoot(0).toString()).toEqual(tree.root.toString())
                }

            })
        })

        describe('Binary AccQueue', () => {
            const HASH_LENGTH = 5
            const SUB_DEPTH = 2
            const ZERO = BigInt(0)

            it('Should fill one incomplete subtree', () => {
                const aq = new AccQueue(SUB_DEPTH, HASH_LENGTH, ZERO)
                const tree = new IncrementalQuinTree(SUB_DEPTH, ZERO, HASH_LENGTH)

                const leaf = BigInt(1)
                aq.enqueue(leaf)
                tree.insert(leaf)

                aq.fillLastSubTree()

                expect(aq.getSubRoot(0).toString()).toEqual(tree.root.toString())
            })

            it('fillLastSubTree() should be correct for every number of leaves in an incomplete subtree', () => {
                const capacity = HASH_LENGTH ** SUB_DEPTH
                for (let i = 1; i < capacity - 1; i ++) {
                    const tree = new IncrementalQuinTree(SUB_DEPTH, ZERO, HASH_LENGTH)
                    const aq = new AccQueue(SUB_DEPTH, HASH_LENGTH, ZERO)
                    for (let j = 0; j < i; j ++) {
                        const leaf = BigInt(i + 1)
                        aq.enqueue(leaf)
                        tree.insert(leaf)
                    }
                    aq.fillLastSubTree()

                    expect(aq.getSubRoot(0).toString()).toEqual(tree.root.toString())
                }
            })
        })

    })
})
