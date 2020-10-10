require('module-alias/register')
jest.setTimeout(180000)
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
describe('IncrementalQuinTree', () => {
    beforeAll(async () => {
        deployer = new JSONRPCDeployer(
            accounts[0].privateKey,
            config.get('chain.url'),
            {
                gasLimit: 10000000,
            },
        )

        console.log('Deploying PoseidonT3Contract')
        PoseidonT3Contract = await deployer.deploy(PoseidonT3.abi, PoseidonT3.bytecode, {})

        console.log('Deploying PoseidonT6Contract')
        PoseidonT6Contract = await deployer.deploy(PoseidonT6.abi, PoseidonT6.bytecode, {})

        // Link Poseidon contracts
        linkPoseidonLibraries(
            ['IncrementalQuinTree.sol', 'ComputeRoot.sol'],
            PoseidonT3Contract.address,
            PoseidonT6Contract.address,
        )

        const [ IncrementalQuinTreeAbi, IncrementalQuinTreeBin ] = loadAB('IncrementalQuinTree')

        console.log('Deploying IncrementalQuinTree')
        mtContract = await deployer.deploy(
            IncrementalQuinTreeAbi,
            IncrementalQuinTreeBin,
            DEPTH,
            NOTHING_UP_MY_SLEEVE.toString(),
        )

        const [ ComputeRootAbi, ComputeRootBin ] = loadAB('ComputeRoot')
        console.log('Deploying ComputeRoot')
        crContract = await deployer.deploy(
            ComputeRootAbi,
            ComputeRootBin,
        )

        tree = new IncrementalQuinTree(DEPTH, NOTHING_UP_MY_SLEEVE)
    })

    it('an empty tree should have the correct root', async () => {
        const root1 = await mtContract.root()
        expect(tree.root.toString()).toEqual(root1.toString())
    })

    it('computeEmptyQuinRoot() should generate the correct root', async () => {
        const emptyRoot = await crContract.computeEmptyQuinRoot(DEPTH, NOTHING_UP_MY_SLEEVE.toString())
        expect(tree.root.toString()).toEqual(emptyRoot.toString())
    })

    it('the on-chain root should match an off-chain root after various insertions', async () => {
        expect.assertions(4)
        for (let i = 0; i < 4; i++) {
            const leaf = genRandomSalt()

            tree.insert(leaf)
            const tx = await mtContract.insertLeaf(leaf.toString())
            await tx.wait()
            const root1 = (await mtContract.root()).toString()

            expect(tree.root.toString()).toEqual(root1)
        }
    })
})
