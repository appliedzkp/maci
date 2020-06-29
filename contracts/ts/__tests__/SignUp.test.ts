require('module-alias/register')

jest.setTimeout(50000)

import * as ethers from 'ethers'

import { genTestAccounts } from '../accounts'
import { timeTravel } from '../'

import { config } from 'maci-config'

import {
    deployMaci,
    deploySignupToken,
    deploySignupTokenGatekeeper,
    deployConstantInitialVoiceCreditProxy,
    genDeployer,
} from '../deploy'

import { MaciState } from 'maci-core'

import {
    hashLeftRight,
    bigInt,
    IncrementalQuinTree,
    NOTHING_UP_MY_SLEEVE,
} from 'maci-crypto'

import {
    Keypair,
    PrivKey,
} from 'maci-domainobjs'

const accounts = genTestAccounts(5)
const deployer = genDeployer(accounts[0].privateKey)

const stateTreeDepth = config.maci.merkleTrees.stateTreeDepth
const messageTreeDepth = config.maci.merkleTrees.messageTreeDepth
const voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth

const coordinator = new Keypair(new PrivKey(bigInt(config.maci.coordinatorPrivKey)))
const maciState = new MaciState(
    coordinator,
    stateTreeDepth,
    messageTreeDepth,
    voteOptionTreeDepth,
    NOTHING_UP_MY_SLEEVE,
)

describe('MACI', () => {
    let maciContract
    let signUpTokenContract
    let constantIntialVoiceCreditProxyContract
    let signUpTokenGatekeeperContract

    // Set up users

    const user1 = {
        wallet: accounts[1],
        keypair: new Keypair(),
    }

    const user2 = {
        wallet: accounts[2],
        keypair: new Keypair(),
    }

    // This array contains four commands from the same user
    for (let i = 0; i < config.maci.messageBatchSize; i++) {
        const voteOptionTree = new IncrementalQuinTree(voteOptionTreeDepth, bigInt(0))

        const newVoteWeight = bigInt(9)

        voteOptionTree.insert(newVoteWeight)
    }

    beforeAll(async () => {
        signUpTokenContract = await deploySignupToken(deployer)
        constantIntialVoiceCreditProxyContract = await deployConstantInitialVoiceCreditProxy(
            deployer,
            config.maci.initialVoiceCreditBalance,
        )
        signUpTokenGatekeeperContract = await deploySignupTokenGatekeeper(
            deployer,
            signUpTokenContract.contractAddress,
        )
        const contracts = await deployMaci(
            deployer,
            signUpTokenGatekeeperContract.contractAddress,
            constantIntialVoiceCreditProxyContract.contractAddress,
        )

        maciContract = contracts.maciContract

        const numEth = 0.5
        for (let i = 1; i < accounts.length; i++) {
            const tx = await deployer.provider.sendTransaction(
                accounts[0].sign({
                    nonce: await deployer.provider.getTransactionCount(accounts[0].address),
                    gasPrice: ethers.utils.parseUnits('10', 'gwei'),
                    gasLimit: 21000,
                    to: accounts[i].address,
                    value: ethers.utils.parseUnits(numEth.toString(), 'ether'),
                    data: '0x'
                })
            )
            await tx.wait()
            console.log(`Gave away ${numEth} ETH to`, accounts[i].address)
        }

        // give away a signUpToken to each user
        await signUpTokenContract.giveToken(user1.wallet.address)
        await signUpTokenContract.giveToken(user2.wallet.address)
    })

    it('each user should own a token', async () => {
        const ownerOfToken1 = await signUpTokenContract.ownerOf(1)
        expect(ownerOfToken1).toEqual(user1.wallet.address)

        const ownerOfToken2 = await signUpTokenContract.ownerOf(2)
        expect(ownerOfToken2).toEqual(user2.wallet.address)
    })

    it('the emptyVoteOptionTreeRoot value should be correct', async () => {
        const temp = new IncrementalQuinTree(voteOptionTreeDepth, bigInt(0))
        const emptyVoteOptionTreeRoot = temp.root

        const root = await maciContract.emptyVoteOptionTreeRoot()
        expect(emptyVoteOptionTreeRoot.toString()).toEqual(root.toString())
    })

    it('the currentResultsCommitment value should be correct', async () => {
        const crc = await maciContract.currentResultsCommitment()
        const tree = new IncrementalQuinTree(voteOptionTreeDepth, 0)
        const expected = hashLeftRight(tree.root, bigInt(0))

        expect(crc.toString()).toEqual(expected.toString())
    })

    it('the currentSpentVoiceCreditsCommitment value should be correct', async () => {
        const comm = await maciContract.currentSpentVoiceCreditsCommitment()
        const expected = hashLeftRight(bigInt(0), bigInt(0))

        expect(comm.toString()).toEqual(expected.toString())
    })

    it('the stateTree root should be correct', async () => {
        const root = await maciContract.getStateTreeRoot()
        expect(maciState.genStateRoot().toString()).toEqual(root.toString())
    })

    describe('Sign-ups', () => {

        it('An empty MaciState should have the correct state root', async () => {
            const contractStateRoot = await maciContract.getStateTreeRoot()
            expect(contractStateRoot.toString()).toEqual(maciState.genStateRoot().toString())
        })

        it('a user who does not own a SignUpToken should not be able to sign up', async () => {
            expect.assertions(1)

            const wallet = user1.wallet.connect(deployer.provider as any)
            const contract = new ethers.Contract(
                maciContract.contractAddress,
                maciContract.interface.abi,
                wallet,
            )

            try {
                await contract.signUp(
                    user1.keypair.pubKey.asContractParam(),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [2]),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [0]), // Any value is fine as the ConstantInitialVoiceCreditProxy will ignore it
                    { gasLimit: 2000000 },
                )

            } catch (e) {
                expect(e.message.endsWith('SignUpTokenGatekeeper: this user does not own the token')).toBeTruthy()
            }
        })

        it('a user who owns a SignUpToken should be able to sign up', async () => {
            maciState.signUp(
                user1.keypair.pubKey, 
                bigInt(
                    config.maci.initialVoiceCreditBalance,
                ),
            )

            const wallet = user1.wallet.connect(deployer.provider as any)
            const contract = new ethers.Contract(
                maciContract.contractAddress,
                maciContract.interface.abi,
                wallet,
            )
            const tx = await contract.signUp(
                user1.keypair.pubKey.asContractParam(),
                ethers.utils.defaultAbiCoder.encode(['uint256'], [1]),
                ethers.utils.defaultAbiCoder.encode(['uint256'], [0]),
                { gasLimit: 2000000 },
            )
            const receipt = await tx.wait()

            expect(receipt.status).toEqual(1)

            // The roots should match
            const root = await maciContract.getStateTreeRoot()
            expect(maciState.genStateRoot().toString()).toEqual(root.toString())

            const iface = new ethers.utils.Interface(maciContract.interface.abi)
            const index = iface.parseLog(receipt.logs[1]).values._stateIndex
            expect(index.toString()).toEqual(maciState.users.length.toString())
        })

        it('a user who uses a previously used SignUpToken to sign up should not be able to do so', async () => {
            expect.assertions(5)
            const wallet = user1.wallet.connect(deployer.provider as any)
            const wallet2 = user2.wallet.connect(deployer.provider as any)

            const tokenContract = new ethers.Contract(
                signUpTokenContract.contractAddress,
                signUpTokenContract.interface.abi,
                wallet,
            )

            // Send token 1 from user1 to user2
            let tx = await tokenContract.safeTransferFrom(
                user1.wallet.address,
                user2.wallet.address,
                1,
                { gasLimit: 500000 },
            )

            let receipt = await tx.wait()
            expect(receipt.status).toEqual(1)

            let ownerOfToken1 = await signUpTokenContract.ownerOf(1)
            expect(ownerOfToken1).toEqual(user2.wallet.address)

            // Attempt to sign up with token 1 as user2, which should fail
            try {
                const maciContract2 = new ethers.Contract(
                    maciContract.contractAddress,
                    maciContract.interface.abi,
                    wallet2,
                )
                await maciContract2.signUp(
                    user2.keypair.pubKey.asContractParam(),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [1]),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [0]),
                    { gasLimit: 2000000 },
                )
            } catch (e) {
                expect(e.message.endsWith('SignUpTokenGatekeeper: this token has already been used to sign up')).toBeTruthy()
            }

            // Send the token back to user1 from user2
            const tokenContract2 = new ethers.Contract(
                signUpTokenContract.contractAddress,
                signUpTokenContract.interface.abi,
                wallet2,
            )

            tx = await tokenContract2.safeTransferFrom(
                user2.wallet.address,
                user1.wallet.address,
                1,
                { gasLimit: 500000 },
            )

            receipt = await tx.wait()
            expect(receipt.status).toEqual(1)

            ownerOfToken1 = await signUpTokenContract.ownerOf(1)
            expect(ownerOfToken1).toEqual(user1.wallet.address)
        })

        it('nobody can sign up after the sign-up period is over', async () => {
            expect.assertions(1)
            
            // Move forward in time
            await timeTravel(deployer.provider, config.maci.signUpDurationInSeconds + 1)

            try {
                await maciContract.signUp(
                    user1.keypair.pubKey.asContractParam(),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [1]),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [0]),
                    { gasLimit: 2000000 },
                )
            } catch (e) {
                expect(e.message.endsWith('MACI: the sign-up period has passed')).toBeTruthy()
            }
        })
    })
})
