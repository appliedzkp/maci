require('module-alias/register')
jest.setTimeout(120000)
import { genTestAccounts } from '../accounts'
import { config } from 'maci-config'
import {
    genRandomSalt,
    NOTHING_UP_MY_SLEEVE,
    IncrementalQuinTree,
} from 'maci-crypto'

import { JSONRPCDeployer } from '../deploy'
const PoseidonT3 = require('@maci-contracts/compiled/PoseidonT3.json')
const PoseidonT6 = require('@maci-contracts/compiled/PoseidonT6.json')

import { loadAB, linkPoseidonLibraries } from '../'

const accounts = genTestAccounts(1)
let deployer
let mtContract
let crContract
let PoseidonT3Contract, PoseidonT6Contract

const DEPTH = 32

let tree
describe('IncrementalMerkleTree', () => {
    beforeAll(async () => {
        deployer = new JSONRPCDeployer(
            accounts[0].privateKey,
            config.get('chain.url'),
            {
                gasLimit: 8800000,
            },
        )

        console.log('Deploying PoseidonT3Contract')
        PoseidonT3Contract = await deployer.deploy(PoseidonT3.abi, PoseidonT3.bytecode, {})

        console.log('Deploying PoseidonT6Contract')
        PoseidonT6Contract = await deployer.deploy(PoseidonT6.abi, PoseidonT6.bytecode, {})

        // Link Poseidon contracts
        linkPoseidonLibraries(
            ['IncrementalMerkleTree.sol', 'ComputeRoot.sol'],
            PoseidonT3Contract.address,
            PoseidonT6Contract.address,
        )

        const [ IncrementalMerkleTreeAbi, IncrementalMerkleTreeBin ] = loadAB('IncrementalMerkleTree')
        console.log('Deploying IncrementalMerkleTree')
        mtContract = await deployer.deploy(
            IncrementalMerkleTreeAbi,
            IncrementalMerkleTreeBin,
            DEPTH,
            NOTHING_UP_MY_SLEEVE.toString(),
        )

        const [ ComputeRootAbi, ComputeRootBin ] = loadAB('ComputeRoot')
        console.log('Deploying ComputeRoot')
        crContract = await deployer.deploy(
            ComputeRootAbi,
            ComputeRootBin,
        )

        tree = new IncrementalQuinTree(DEPTH, NOTHING_UP_MY_SLEEVE, 2)
    })

    it('an empty tree should have the correct root', async () => {
        const root1 = await mtContract.root()
        expect(tree.root.toString()).toEqual(root1.toString())
    })

    it('computeEmptyRoot() should generate the correct root', async () => {
        const emptyRoot = await crContract.computeEmptyRoot(DEPTH, NOTHING_UP_MY_SLEEVE.toString())
        expect(tree.root.toString()).toEqual(emptyRoot.toString())
    })

    it('the on-chain root should match an off-chain root after various insertions', async () => {
        expect.assertions(8)
        for (let i = 0; i < 8; i++) {
            const leaf = genRandomSalt()

            const tx = await mtContract.insertLeaf(leaf.toString())
            await tx.wait()
            const root1 = await mtContract.root()

            tree.insert(leaf)

            expect(tree.root.toString()).toEqual(root1.toString())
        }
    })
})
