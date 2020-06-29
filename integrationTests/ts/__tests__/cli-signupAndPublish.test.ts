jest.setTimeout(30000)
import * as ethers from 'ethers'

import { MaciState } from 'maci-core'

import {
    bigInt,
    SNARK_FIELD_SIZE,
} from 'maci-crypto'

import {
    PubKey,
    PrivKey,
    Keypair,
    Command,
} from 'maci-domainobjs'

import {
    maciContractAbi,
    genTestAccounts,
} from 'maci-contracts'

import { genPubKey } from 'maci-crypto'

import { config } from 'maci-config'

import { exec, delay } from './utils'

import {
    maxUsers,
    maxMessages,
    maxVoteOptions,
    signupDuration,
    votingDuration,
    messageBatchSize,
    tallyBatchSize,
    initialVoiceCredits,
    stateTreeDepth,
    messageTreeDepth,
    voteOptionTreeDepth,
} from './params'

const accounts = genTestAccounts(2)

let maciAddress: string
let stateIndex: string
const providerUrl = config.get('chain.url')
const coordinatorKeypair = new Keypair(
    new PrivKey(bigInt('0xa'))
)
const userKeypair = new Keypair()
const maciPrivkey = coordinatorKeypair.privKey.serialize()
const deployerPrivKey = accounts[0].privateKey
const userPrivKey = accounts[1].privateKey

const maciState = new MaciState(
    coordinatorKeypair,
    stateTreeDepth,
    messageTreeDepth,
    voteOptionTreeDepth,
    maxVoteOptions,
)

debugger
describe('signup and publish CLI subcommands', () => {
    let maciContract

    beforeAll(async () => {
        const provider = new ethers.providers.JsonRpcProvider(providerUrl)
        // Fund the user's account
        const deployerWallet = new ethers.Wallet(accounts[0].privateKey, provider)
        const tx = await deployerWallet.provider.sendTransaction(
            accounts[0].sign({
                nonce: await deployerWallet.provider.getTransactionCount(accounts[0].address),
                gasPrice: ethers.utils.parseUnits('10', 'gwei'),
                gasLimit: 21000,
                to: accounts[1].address,
                value: ethers.utils.parseUnits('0.1', 'ether'),
                data: '0x'
            })
        )
        await tx.wait()

        // Run the create subcommand
        const createCommand = `node ../cli/build/index.js create` +
            ` -d ${deployerPrivKey} -sk ${maciPrivkey}` +
            ` -u ${maxUsers}` +
            ` -m ${maxMessages}` +
            ` -v ${maxVoteOptions}` +
            ` -e ${providerUrl}` +
            ` -s ${signupDuration}` +
            ` -o ${votingDuration}` +
            ` -bm ${messageBatchSize}` +
            ` -bv ${tallyBatchSize}` +
            ` -c ${initialVoiceCredits}`

        console.log(createCommand)
        const createOutput = exec(createCommand).stdout.trim()

        // Log the output for further manual testing
        console.log(createOutput)

        const regMatch = createOutput.match(/^MACI: (0x[a-fA-F0-9]{40})$/)
        maciAddress = regMatch[1]
    })

    describe('the signup subcommand', () => {
        it('should sign a user up', async () => {

            // Get the number of signups recorded on-chain
            const provider = new ethers.providers.JsonRpcProvider(providerUrl)
            maciContract = new ethers.Contract(
                maciAddress,
                maciContractAbi,
                provider,
            )
            const onChainNumSignupsBefore = await maciContract.numSignUps()

            // Run the signup command
            const signupCommand = `node ../cli/build/index.js signup` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}`

            console.log(signupCommand)

            const signupOutput = exec(signupCommand).stdout.trim()
            console.log(signupOutput)

            // Check whether the transaction succeeded
            const signupRegMatch = signupOutput.match(/^Transaction hash: (0x[a-fA-F0-9]{64})\nState index: (\d+)$/)
            expect(signupRegMatch).toBeTruthy()

            // Check the state tree index from the event log
            const txHash = signupRegMatch[1]
            const indexFromCli = signupRegMatch[2]
            const iface = new ethers.utils.Interface(maciContract.interface.abi)

            const receipt = await provider.getTransactionReceipt(txHash)
            if (receipt && receipt.logs) {
                stateIndex = iface.parseLog(receipt.logs[1]).values._stateIndex.toString()

                expect(stateIndex).toEqual(indexFromCli)

            } else {
                console.error('Error: unable to retrieve the transaction receipt')
            }

            // Check whether the signup command increased the number of signups
            const onChainNumSignupsAfter = await maciContract.numSignUps()
            expect(onChainNumSignupsBefore.toNumber()).toEqual(onChainNumSignupsAfter.toNumber() - 1)

            maciState.signUp(
                userKeypair.pubKey, 
                bigInt(initialVoiceCredits),
            )

            const root = await maciContract.getStateTreeRoot()
            expect(root.toString()).toEqual(maciState.genStateRoot().toString())

        })

        it('should sign another user up', async () => {
            const keypair = new Keypair()
            const signupCommand = `node ../cli/build/index.js signup` +
                ` -p ${keypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}`
            const signupOutput = exec(signupCommand).stdout.trim()
            console.log(signupOutput)

            // Check whether the transaction succeeded
            const signupRegMatch = signupOutput.match(/^Transaction hash: (0x[a-fA-F0-9]{64})\nState index: (\d+)$/)
            expect(signupRegMatch).toBeTruthy()
        })

        it('should reject a provider URL that does not work', async () => {
            const signupCommand = `node ../cli/build/index.js signup` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress} ` +
                ` -e xxx`

            const output = exec(signupCommand).stderr
            expect(output).toEqual('Error: unable to connect to the Ethereum provider at xxx\n')
        })

        it('should reject an invalid MACI contract address', async () => {
            const signupCommand = `node ../cli/build/index.js signup` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x 0x` 

            const output = exec(signupCommand).stderr
            expect(output).toEqual('Error: invalid MACI contract address\n')
        })

        it('should reject a contract address that does not have MACI deployed to it', async () => {
            const signupCommand = `node ../cli/build/index.js signup` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x 0x0000000000000000000000000000000000000000` 

            const output = exec(signupCommand).stderr
            expect(output).toEqual('Error: there is no contract deployed at the specified address\n')
        })

        it('should reject an invalid MACI public key', async () => {
            const signupCommand = `node ../cli/build/index.js signup` +
                ` -p mackpk.fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress} `
            const output = exec(signupCommand).stderr
            expect(output).toEqual('Error: invalid MACI public key\n')
        })

        it('should reject an Ethereum private key', async () => {
            const signupCommand = `node ../cli/build/index.js signup` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d 0x` +
                ` -x ${maciAddress}` 

            const output = exec(signupCommand).stderr
            expect(output).toEqual('Error: invalid Ethereum private key\n')
        })

        it('should reject invalid signup gateway data', async () => {
            const signupCommand = `node ../cli/build/index.js signup` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress} ` +
                ` -s xxx`
            const output = exec(signupCommand).stderr
            expect(output).toEqual('Error: invalid signup gateway data\n')
        })

        it('should reject invalid initial voice credit proxy data', async () => {
            const signupCommand = `node ../cli/build/index.js signup` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress} ` +
                ` -v xxx`
            const output = exec(signupCommand).stderr
            expect(output).toEqual('Error: invalid initial voice credit proxy data\n')
        })

    })

    describe('The publish subcommand', () => {

        const voteOptionIndex = 0
        const newVoteWeight = 9
        const nonce = 0
        const salt = '0x0333333333333333333333333333333333333333333333333333333333333333'

        it('should publish a message', async () => {
            // Retrieve the coordinator's public key
            const coordinatorPubKeyOnChain = await maciContract.coordinatorPubKey()
            const coordinatorPubKey = new PubKey([
                bigInt(coordinatorPubKeyOnChain.x.toString()),
                bigInt(coordinatorPubKeyOnChain.y.toString()),
            ])

            // Wait for the signup period to pass
            await delay(1000 * signupDuration)

            // Run the publish command
            const publishCommand = `node ../cli/build/index.js publish` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -i ${stateIndex}` +
                ` -v ${voteOptionIndex}` +
                ` -w ${newVoteWeight}` +
                ` -n ${nonce}` +
                ` -s ${salt}`

            const publishOutput = await exec(publishCommand).stdout.trim()
            console.log(publishOutput)

            const publishRegMatch = publishOutput.match(
                /^Transaction hash: (0x[a-fA-F0-9]{64})\nEphemeral private key: (macisk.[a-f0-9]+)$/)
            expect(publishRegMatch).toBeTruthy()

            const command = new Command(
                bigInt(stateIndex),
                userKeypair.pubKey,
                bigInt(voteOptionIndex),
                bigInt(newVoteWeight),
                bigInt(nonce),
                bigInt(salt),
            )

            // The publish command generates and outputs a random ephemeral private
            // key, so we have to retrieve it from the standard output
            const encPrivKey = PrivKey.unserialize(publishRegMatch[2])
            const encPubKey = new PubKey(genPubKey(encPrivKey.rawPrivKey))

            const signature = command.sign(userKeypair.privKey)

            const message = command.encrypt(
                signature,
                Keypair.genEcdhSharedKey(
                    encPrivKey,
                    coordinatorPubKey,
                )
            )

            // Check whether the message tree root is correct
            maciState.publishMessage(
                message,
                encPubKey,
            )

            const onChainMessageRoot = await maciContract.getMessageTreeRoot()
            expect(maciState.genMessageRoot().toString()).toEqual(onChainMessageRoot.toString())
        })

        it('should reject an invalid MACI contract address', async () =>{
            const publishCommand = `node ../cli/build/index.js publish` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x 0xxx` +
                ` -i ${stateIndex}` +
                ` -v ${voteOptionIndex}` +
                ` -w ${newVoteWeight}` +
                ` -n ${nonce}` +
                ` -s ${salt}`

            const output = exec(publishCommand).stderr
            expect(output).toEqual('Error: invalid MACI contract address\n')
        })

        it('should reject a contract address that does not have MACI deployed to it', async () => {
            const publishCommand = `node ../cli/build/index.js publish` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x 0x0000000000000000000000000000000000000000` +
                ` -i ${stateIndex}` +
                ` -v ${voteOptionIndex}` +
                ` -w ${newVoteWeight}` +
                ` -n ${nonce}` +
                ` -s ${salt}`

            const output = exec(publishCommand).stderr
            expect(output).toEqual('Error: there is no contract deployed at the specified address\n')
        })

        it('should reject an invalid Ethereum private key', async () => {
            const publishCommand = `node ../cli/build/index.js publish` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d 0x` +
                ` -x ${maciAddress}` +
                ` -i ${stateIndex}` +
                ` -v ${voteOptionIndex}` +
                ` -w ${newVoteWeight}` +
                ` -n ${nonce}` +
                ` -s ${salt}`

            const output = exec(publishCommand).stderr
            expect(output).toEqual('Error: invalid Ethereum private key\n')
        })

        it('should reject a negative state index', async () => {
            const publishCommand = `node ../cli/build/index.js publish` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -i -1` +
                ` -v ${voteOptionIndex}` +
                ` -w ${newVoteWeight}` +
                ` -n ${nonce}` +
                ` -s ${salt}`

            const output = exec(publishCommand).stderr
            expect(output).toEqual('Error: the state index must be greater than 0\n')
        })

        it('should reject an invalid state index', async () => {
            const publishCommand = `node ../cli/build/index.js publish` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -i 999` +
                ` -v ${voteOptionIndex}` +
                ` -w ${newVoteWeight}` +
                ` -n ${nonce}` +
                ` -s ${salt}`

            const output = exec(publishCommand).stderr
            expect(output).toEqual('Error: the state index is invalid\n')
        })

        it('should reject a negative vote option index', async () => {
            const publishCommand = `node ../cli/build/index.js publish` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -i ${stateIndex}` +
                ` -v -1` +
                ` -w ${newVoteWeight}` +
                ` -n ${nonce}` +
                ` -s ${salt}`

            const output = exec(publishCommand).stderr
            expect(output).toEqual('Error: the vote option index should be 0 or greater\n')
        })

        it('should reject an invalid vote option index', async () => {
            const publishCommand = `node ../cli/build/index.js publish` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -i ${stateIndex}` +
                ` -v 99999` +
                ` -w ${newVoteWeight}` +
                ` -n ${nonce}` +
                ` -s ${salt}`

            const output = exec(publishCommand).stderr
            expect(output).toEqual('Error: the vote option index is invalid\n')
        })

        it('should reject a negative nonce', async () => {
            const publishCommand = `node ../cli/build/index.js publish` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -i ${stateIndex}` +
                ` -v ${voteOptionIndex}` +
                ` -w ${newVoteWeight}` +
                ` -n -1` +
                ` -s ${salt}`

            const output = exec(publishCommand).stderr
            expect(output).toEqual('Error: the nonce should be 0 or greater\n')
        })

        it('should reject an invalid salt', async () => {
            const publishCommand = `node ../cli/build/index.js publish` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -i ${stateIndex}` +
                ` -v ${voteOptionIndex}` +
                ` -w ${newVoteWeight}` +
                ` -n ${nonce}` +
                ` -s 0xx`
            const output = exec(publishCommand).stderr
            expect(output).toEqual('Error: the salt should be a 32-byte hexadecimal string\n')
        })

        it('should reject an oversized salt', async () => {
            const publishCommand = `node ../cli/build/index.js publish` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -p ${userKeypair.pubKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -i ${stateIndex}` +
                ` -v ${voteOptionIndex}` +
                ` -w ${newVoteWeight}` +
                ` -n ${nonce}` +
                ` -s 0x${bigInt(SNARK_FIELD_SIZE).toString(16)}`
            const output = exec(publishCommand).stderr
            expect(output).toEqual('Error: the salt should less than the BabyJub field size\n')
        })
    })
})
