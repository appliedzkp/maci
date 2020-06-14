require('module-alias/register')
jest.setTimeout(60000)

import * as ethers from 'ethers'
import { config } from 'maci-config'
import { MaciState } from 'maci-core'
import {
    bigInt,
    genRandomSalt,
    NOTHING_UP_MY_SLEEVE,
} from 'maci-crypto'

import {
    PrivKey,
    Command,
    Keypair,
    VoteLeaf,
} from 'maci-domainobjs'

import {
    timeTravel,
    genDeployer,
    genTestAccounts,
    deployMaci,
    deployFreeForAllSignUpGatekeeper,
    deployConstantInitialVoiceCreditProxy,
} from '../'


const accounts = genTestAccounts(5)
const deployer = genDeployer(accounts[0].privateKey)
let freeForAllSignUpGatekeeperContract
let constantIntialVoiceCreditProxyContract
let maciContract
const coordinator = new Keypair(new PrivKey(bigInt(config.maci.coordinatorPrivKey)))
const stateTreeDepth = config.maci.merkleTrees.stateTreeDepth
const messageTreeDepth = config.maci.merkleTrees.messageTreeDepth
const voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth
const initialVoiceCreditBalance = config.maci.initialVoiceCreditBalance

const maciState = new MaciState(
    coordinator,
    stateTreeDepth,
    messageTreeDepth,
    voteOptionTreeDepth,
    NOTHING_UP_MY_SLEEVE,
)

describe('Publishing messages', () => {
    beforeAll(async () => {
        freeForAllSignUpGatekeeperContract = await deployFreeForAllSignUpGatekeeper(deployer)
        constantIntialVoiceCreditProxyContract = await deployConstantInitialVoiceCreditProxy(
            deployer,
            initialVoiceCreditBalance,
        )

        const contracts = await deployMaci(
            deployer,
            freeForAllSignUpGatekeeperContract.contractAddress,
            constantIntialVoiceCreditProxyContract.contractAddress,
        )

        maciContract = contracts.maciContract
        const keypair = new Keypair()
        maciState.signUp(keypair.pubKey, initialVoiceCreditBalance)
        const tx = await maciContract.signUp(
            keypair.pubKey.asContractParam(),
            ethers.utils.defaultAbiCoder.encode(['uint256'], [0]),
            ethers.utils.defaultAbiCoder.encode(['uint256'], [0]),
        )
        await tx.wait()
    })

    it('nobody can publish a message before the sign-up period passes', async () => {
        expect.assertions(1)
        const keypair = new Keypair()
        const command = new Command(
            bigInt(0),
            keypair.pubKey,
            bigInt(0),
            new VoteLeaf(bigInt(0), bigInt(0)),
            bigInt(0),
            genRandomSalt(),
        )
        const signature = command.sign(keypair.privKey)
        const message = command.encrypt(signature, bigInt(0))
        try {
            await maciContract.publishMessage(
                message.asContractParam(),
                keypair.pubKey.asContractParam(),
            )
        } catch (e) {
            expect(e.message.endsWith('MACI: the sign-up period is not over')).toBeTruthy()
        }
    })

    it('The empty message tree should have the correct root', async () => {
        const root = maciState.genMessageRoot()
        const root2 = await maciContract.getMessageTreeRoot()  

        expect(root.toString()).toEqual(root2.toString())
    })

    it('A message tree with several messages should have the correct root', async () => {
        // Move forward in time
        await timeTravel(deployer.provider, config.maci.signUpDurationInSeconds + 1)

        for (let i = 0; i < 4; i++) {
            const keypair = new Keypair()
            const command = new Command(
                bigInt(0),
                keypair.pubKey,
                bigInt(0),
                new VoteLeaf(bigInt(0), bigInt(0)),
                bigInt(0),
                genRandomSalt(),
            )
            const signature = command.sign(keypair.privKey)
            const message = command.encrypt(signature, bigInt(0))
            const tx = await maciContract.publishMessage(
                message.asContractParam(),
                keypair.pubKey.asContractParam(),
            )
            const receipt = await tx.wait()
            expect(receipt.status).toEqual(1)

            maciState.publishMessage(
                message,
                keypair.pubKey,
            )
            const root = maciState.genMessageRoot()
            const root2 = await maciContract.getMessageTreeRoot()  

            expect(root.toString()).toEqual(root2.toString())
        }
    })
})

