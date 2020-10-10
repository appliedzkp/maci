require('module-alias/register')
import { genTestAccounts } from '../accounts'
import { config } from 'maci-config'
import {
    hashLeftRight,
    hash5,
    hash11,
    genRandomSalt,
} from 'maci-crypto'

import { JSONRPCDeployer } from '../deploy'
const PoseidonT3 = require('@maci-contracts/compiled/PoseidonT3.json')
const PoseidonT6 = require('@maci-contracts/compiled/PoseidonT6.json')

import { loadAB, linkPoseidonLibraries } from '../'

const accounts = genTestAccounts(1)
let deployer
let hasherContract
let PoseidonT3Contract, PoseidonT6Contract

describe('Hasher', () => {
    beforeAll(async () => {
        deployer = new JSONRPCDeployer(
            accounts[0].privateKey,
            config.get('chain.url'),
            {
                gasLimit: 8800000,
            },
        )

        console.log('Deploying Poseidon')

        PoseidonT3Contract = await deployer.deploy(PoseidonT3.abi, PoseidonT3.bytecode, {})
        PoseidonT6Contract = await deployer.deploy(PoseidonT6.abi, PoseidonT6.bytecode, {})

        // Link Poseidon contracts
        linkPoseidonLibraries(
            ['crypto/Hasher.sol'],
            PoseidonT3Contract.address,
            PoseidonT6Contract.address,
        )

        const [ HasherAbi, HasherBin ] = loadAB('Hasher')

        console.log('Deploying Hasher')
        hasherContract = await deployer.deploy(
            HasherAbi,
            HasherBin,
        )
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
        const hashed = hash5(values.map(BigInt))

        const onChainHash = await hasherContract.hash5(values)
        expect(onChainHash.toString()).toEqual(hashed.toString())
    })

    it('maci-crypto.hash11 should match hasher.hash11 for 10 elements', async () => {
        const values: string[] = []
        for (let i = 0; i < 10; i++) {
            values.push(genRandomSalt().toString())
        }
        const hashed = hash11(values.map(BigInt))
        const onChainHash = await hasherContract.hash11(values)

        expect(onChainHash.toString()).toEqual(hashed.toString())
    })

    it('maci-crypto.hash11 should match hasher.hash11 for 11 elements', async () => {
        const values: string[] = []
        for (let i = 0; i < 11; i++) {
            values.push(genRandomSalt().toString())
        }
        const hashed = hash11(values.map(BigInt))
        const onChainHash = await hasherContract.hash11(values)

        expect(onChainHash.toString()).toEqual(hashed.toString())
    })
})
