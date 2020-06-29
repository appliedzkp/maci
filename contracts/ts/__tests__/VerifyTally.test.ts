require('module-alias/register')
import { genTestAccounts } from '../accounts'
import { config } from 'maci-config'
import {
    hashLeftRight,
    bigInt,
    IncrementalQuinTree,
} from 'maci-crypto'
import { genTallyResultCommitment } from 'maci-core'

import * as etherlime from 'etherlime-lib'

const PoseidonT3 = require('@maci-contracts/compiled/PoseidonT3.json')
const PoseidonT6 = require('@maci-contracts/compiled/PoseidonT6.json')
const VerifyTallyAbi = require('@maci-contracts/compiled/VerifyTally.json')

const accounts = genTestAccounts(1)
let deployer
let verifyTallyContract
let PoseidonT3Contract, PoseidonT6Contract
const DEPTH = 4

describe('VerifyTally', () => {
    beforeAll(async () => {
        deployer = new etherlime.JSONRPCPrivateKeyDeployer(
            accounts[0].privateKey,
            config.get('chain.url'),
            {
                gasLimit: 8800000,
            },
        )

        console.log('Deploying PoseidonT3Contract')
        PoseidonT3Contract = await deployer.deploy(PoseidonT3, {})
        PoseidonT6Contract = await deployer.deploy(PoseidonT6, {})

        console.log('Deploying VerifyTally')
        verifyTallyContract = await deployer.deploy(
            VerifyTallyAbi,
            {
                PoseidonT3: PoseidonT3Contract.contractAddress,
                PoseidonT6: PoseidonT6Contract.contractAddress
            },
        )

    })

    it('computeMerklePath() should generate the correct root', async () => {
        const results = [
            bigInt(10),
            bigInt(20),
            bigInt(30),
            bigInt(40),
            bigInt(50),
        ]
        const salt = bigInt(1)
        const commitment = genTallyResultCommitment(results, salt, DEPTH)

        const tree = new IncrementalQuinTree(DEPTH, bigInt(0))
        for (const result of results) {
            tree.insert(result)
        }
        const root = tree.root
        const expectedTallyCommitment = hashLeftRight(root, salt)
        expect(expectedTallyCommitment.toString()).toEqual(commitment.toString())

        const index = 2
        const proof = tree.genMerklePath(index)
        expect(IncrementalQuinTree.verifyMerklePath(proof, tree.hashFunc)).toBeTruthy()

        const computedRoot = await verifyTallyContract.computeMerkleRootFromPath(
            DEPTH,
            index,
            results[index].toString(),
            proof.pathElements.map((x) => x.map((y) => y.toString())),
        )
        expect(computedRoot.toString()).toEqual(root.toString())
    })

})
