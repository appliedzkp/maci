require('module-alias/register')
import { genTestAccounts } from '../accounts'
import { config } from 'maci-config'
import {
    hashLeftRight,
    hash5,
    hash11,
    genRandomSalt,
} from 'maci-crypto'

import * as etherlime from 'etherlime-lib'
const Hasher = require('@maci-contracts/compiled/Hasher.json')
const PoseidonT3 = require('@maci-contracts/compiled/PoseidonT3.json')
const PoseidonT6 = require('@maci-contracts/compiled/PoseidonT6.json')

const accounts = genTestAccounts(1)
let deployer
let hasherContract
let PoseidonT3Contract, PoseidonT6Contract

describe('Hasher', () => {
    beforeAll(async () => {
        deployer = new etherlime.JSONRPCPrivateKeyDeployer(
            accounts[0].privateKey,
            config.get('chain.url'),
            {
                gasLimit: 8800000,
            },
        )

        console.log('Deploying Poseidon')

        PoseidonT3Contract = await deployer.deploy(PoseidonT3, {})
        PoseidonT6Contract = await deployer.deploy(PoseidonT6, {})

        console.log('Deploying Hasher')
        hasherContract = await deployer.deploy(Hasher, {
            PoseidonT3: PoseidonT3Contract.contractAddress,
            PoseidonT6: PoseidonT6Contract.contractAddress
        })
    })

    it('maci-crypto.hashLeftRight should match hasher.hashLeftRight', async () => {
        const left = genRandomSalt()
        const right = genRandomSalt()
        const hashed = hashLeftRight(left, right)

        const onChainHash = await hasherContract.hashLeftRight(left.toString(), right.toString())
        expect(onChainHash.toString()).toEqual(hashed.toString())
    })

    it('maci-crypto.hash5 should match hasher.hash5', async () => {
        const values: string[] = []
        for (let i = 0; i < 5; i++) {
            values.push(genRandomSalt().toString())
        }
        const hashed = hash5(values)

        const onChainHash = await hasherContract.hash5(values)
        expect(onChainHash.toString()).toEqual(hashed.toString())
    })

    it('maci-crypto.hash11 should match hasher.hash11 for 10 elements', async () => {
        const values: string[] = []
        for (let i = 0; i < 10; i++) {
            values.push(genRandomSalt().toString())
        }
        const hashed = hash11(values)
        const onChainHash = await hasherContract.hash11(values)

        expect(onChainHash.toString()).toEqual(hashed.toString())
    })

    it('maci-crypto.hash11 should match hasher.hash11 for 11 elements', async () => {
        const values: string[] = []
        for (let i = 0; i < 11; i++) {
            values.push(genRandomSalt().toString())
        }
        const hashed = hash11(values)
        const onChainHash = await hasherContract.hash11(values)

        expect(onChainHash.toString()).toEqual(hashed.toString())
    })
})
