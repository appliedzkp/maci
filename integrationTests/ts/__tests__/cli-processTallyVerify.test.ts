jest.setTimeout(500000)
import * as ethers from 'ethers'

import { MaciState } from 'maci-core'
import { bigInt } from 'maci-crypto'

import {
    PubKey,
    PrivKey,
    Keypair,
    Command,
    StateLeaf,
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

const providerUrl = config.get('chain.url')
const coordinatorKeypair = new Keypair()
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

describe('process, tally, and prove CLI subcommands', () => {
    let maciContract
    let provider
    let randomLeaf: StateLeaf

    beforeAll(async () => {
        provider = new ethers.providers.JsonRpcProvider(providerUrl)
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

        const o = exec(createCommand)

        const createOutput = o.stdout.trim()

        // Log the output for further manual testing
        console.log(createOutput)

        const regMatch = createOutput.match(/^MACI: (0x[a-fA-F0-9]{40})$/)
        maciAddress = regMatch[1]

        // Run the signup command
        const signupCommand = `node ../cli/build/index.js signup` +
            ` -p ${userKeypair.pubKey.serialize()}` +
            ` -d ${userPrivKey}` +
            ` -x ${maciAddress}`

        console.log(signupCommand)

        const signupExec = exec(signupCommand)
        if (signupExec.stderr) {
            console.error(signupExec.stderr)
            return
        } else {
            console.log(signupExec.stdout)
        }

        maciState.signUp(
            userKeypair.pubKey, 
            bigInt(initialVoiceCredits),
        )

        maciContract = new ethers.Contract(
            maciAddress,
            maciContractAbi,
            provider,
        )

        // Wait for the signup period to pass
        await delay(1000 * signupDuration)

        // This command is to vote for option 0 with 9*9 voice credits and to
        // change the user's public key
        const stateIndex = 1
        const voteOptionIndex = 0
        const newVoteWeight = 9
        const nonce = 1
        const salt = '0x0333333333333333333333333333333333333333333333333333333333333333'
        const newPubKey = (new Keypair()).pubKey

        // Retrieve the coordinator's public key
        const coordinatorPubKeyOnChain = await maciContract.coordinatorPubKey()
        const coordinatorPubKey = new PubKey([
            bigInt(coordinatorPubKeyOnChain.x.toString()),
            bigInt(coordinatorPubKeyOnChain.y.toString()),
        ])

        // Run the publish command
        const publishCommand = `node ../cli/build/index.js publish` +
            ` -sk ${userKeypair.privKey.serialize()}` +
            ` -p ${newPubKey.serialize()}` +
            ` -d ${userPrivKey}` +
            ` -x ${maciAddress}` +
            ` -i ${stateIndex}` +
            ` -v ${voteOptionIndex}` +
            ` -w ${newVoteWeight}` +
            ` -n ${nonce}` +
            ` -s ${salt}`

        console.log(publishCommand)

        const publishExec = exec(publishCommand)
        if (publishExec.stderr) {
            console.log(publishExec.stderr)
            return
        }

        const publishOutput = publishExec.stdout.trim()
        console.log(publishOutput)

        const publishRegMatch = publishOutput.match(
            /^Transaction hash: (0x[a-fA-F0-9]{64})\nEphemeral private key: (macisk.[a-f0-9]+)$/)

        // The publish command generates and outputs a random ephemeral private
        // key, so we have to retrieve it from the standard output
        const encPrivKey = PrivKey.unserialize(publishRegMatch[2])
        const encPubKey = new PubKey(genPubKey(encPrivKey.rawPrivKey))

        const command = new Command(
            bigInt(stateIndex),
            newPubKey,
            bigInt(voteOptionIndex),
            bigInt(newVoteWeight),
            bigInt(nonce),
            bigInt(salt),
        )

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

        // Wait for the voting period to pass
        await delay(1000 * votingDuration)
    })

    describe('The tally subcommand (1)', () => {
        it('should report an error if some messages have not been processed', async () =>{

            const hasUnprocessedMessages = await maciContract.hasUnprocessedMessages()
            expect(hasUnprocessedMessages).toBeTruthy()

            const tallyCommand = `NODE_OPTIONS=--max-old-space-size=4096 node ../cli/build/index.js tally` + ` -sk ${coordinatorKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -z ${StateLeaf.genRandomLeaf().serialize()}` +
                ` -t test_tally.json` +
                ` -c 0x0000000000000000000000000000000000000000` +
                ` -pvc 0x0000000000000000000000000000000000000000` +
                ` -tvc 0x0000000000000000000000000000000000000000`

            const e = exec(tallyCommand)
            expect(e.stderr.trim()).toEqual('Error: not all messages have been processed')
        })
    })

    describe('The process subcommand', () => {

        it('should process a batch of state leaves', async () =>{
            const messageIndexBefore = await maciContract.currentMessageBatchIndex()
            // Run the process command
            const processCommand = `NODE_OPTIONS=--max-old-space-size=4096 node ../cli/build/index.js process` +
                ` -sk ${coordinatorKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}`

            console.log('Start:', new Date())
            console.log(processCommand)

            const e = exec(processCommand)

            console.log('End:', new Date())

            if (e.stderr) {
                console.log(e)
            }
            const output = e.stdout.trim()
            console.log(output)

            // Check whether the transaction succeeded
            const regMatch = output.match(
                /Transaction hash: (0x[a-fA-F0-9]{64})\nRandom state leaf: ([\w\d]+)/
            )
            if (!regMatch) {
                console.log(e.stderr)
            }
            expect(regMatch).toBeTruthy()

            const messageIndexAfter = await maciContract.currentMessageBatchIndex()
            expect((messageIndexAfter - messageIndexBefore).toString()).toEqual(messageBatchSize.toString())

            randomLeaf = StateLeaf.unserialize(regMatch[2])
        })

        it('should report an error if all messages have been processed', async () =>{

            const hasUnprocessedMessages = await maciContract.hasUnprocessedMessages()
            expect(hasUnprocessedMessages).toBeFalsy()

            const processCommand = `NODE_OPTIONS=--max-old-space-size=4096 node ../cli/build/index.js process` +
                ` -sk ${coordinatorKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}`

            const e = exec(processCommand)
            expect(e.stderr.trim()).toEqual('Error: all messages have already been processed')
        })

        it('should reject an invalid MACI contract address', async () =>{
            const processCommand = `node ../cli/build/index.js process` +
                ` -sk ${coordinatorKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x 0xxx`

            const output = exec(processCommand).stderr
            expect(output).toEqual('Error: invalid MACI contract address\n')
        })

        it('should reject a contract address that does not have MACI deployed to it', async () => {
            const processCommand = `node ../cli/build/index.js process` +
                ` -sk ${coordinatorKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x 0xxx`

            const output = exec(processCommand).stderr
            expect(output).toEqual('Error: invalid MACI contract address\n')
        })

        it('should reject an invalid Ethereum private key', async () => {
            const processCommand = `node ../cli/build/index.js process` +
                ` -sk ${coordinatorKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x 0x0000000000000000000000000000000000000000`
            const output = exec(processCommand).stderr
            expect(output).toEqual('Error: there is no contract deployed at the specified address\n')
        })
    })

    describe('The tally and verify subcommands (2)', () => {

        it('should tally all state leaves', async () =>{
            const tallyCommand = `node ../cli/build/index.js tally` +
                ` -sk ${coordinatorKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -z ${randomLeaf.serialize()}` +
                ` -t test_tally.json` +
                ` -c 0x0000000000000000000000000000000000000000` +
                ` -pvc 0x0000000000000000000000000000000000000000` +
                ` -tvc 0x0000000000000000000000000000000000000000`

            console.log(tallyCommand)

            const e = exec(tallyCommand)
            const output = e.stdout

            if (output) {
                console.log(output)
            }

            if (e.stderr) {
                console.log(e.stderr)
            }

            const regMatch = output.match(
                /Transaction hash: (0x[a-fA-F0-9]{64})\nCurrent results salt: (0x[a-fA-F0-9]+)\nResult commitment: 0x[a-fA-F0-9]+\nTotal spent voice credits salt: (0x[a-fA-F0-9]+)\nTotal spent voice credits commitment: (0x[a-fA-F0-9]+)\nTotal spent voice credits per vote option salt: (0x[a-fA-F0-9]+)\nTotal spent voice credits per vote option commitment: (0x[a-fA-F0-9]+)\n$/
            )

            if (!regMatch) {
                console.log(output)
            }

            expect(regMatch).toBeTruthy()

            const verifyCommand = `node ../cli/build/index.js verify` +
                ` -t test_tally.json`

            const verifyExec = exec(verifyCommand)
            const verifyOutput = verifyExec.stdout
            const verifyRegMatch = verifyOutput.match(
                /The results commitment in the specified file is correct given the tally and salt\nThe total spent voice credit commitment in the specified file is correct given the tally and salt\nThe per vote option spent voice credit commitment in the specified file is correct given the tally and salt\nThe results commitment in the MACI contract on-chain is valid\nThe total spent voice credit commitment in the MACI contract on-chain is valid\nThe per vote option spent voice credit commitment in the MACI contract on-chain is valid\n/
            )
            if (!verifyRegMatch) {
                console.log(verifyOutput)
            }
            expect(verifyRegMatch).toBeTruthy()
        })

        it('should report an error if all state leaves have been tallied', async () =>{
            const tallyCommand = `node ../cli/build/index.js tally` +
                ` -sk ${coordinatorKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -z ${randomLeaf.serialize()}` +
                ` -t test_tally.json` +
                ` -c 0x0000000000000000000000000000000000000000` +
                ` -pvc 0x0000000000000000000000000000000000000000` +
                ` -tvc 0x0000000000000000000000000000000000000000`

            console.log(tallyCommand)

            const output = exec(tallyCommand).stderr
            expect(output).toEqual('Error: all state leaves have been tallied\n')
        })

        it('should report an error if the random leaf is invalid', async () =>{
            const tallyCommand = `node ../cli/build/index.js tally` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -z xxxxxxx` +
                ` -t test_tally.json` +
                ` -c 0x0000000000000000000000000000000000000000` +
                ` -pvc 0x0000000000000000000000000000000000000000` +
                ` -tvc 0x0000000000000000000000000000000000000000`

            const output = exec(tallyCommand).stderr
            expect(output).toEqual('Error: invalid zeroth state leaf\n')
        })

        it('should reject an invalid MACI contract address', async () =>{
            const tallyCommand = `node ../cli/build/index.js tally` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x 0xxx` +
                ` -z ${randomLeaf.serialize()}` +
                ` -t test_tally.json` +
                ` -c 0x0000000000000000000000000000000000000000` +
                ` -pvc 0x0000000000000000000000000000000000000000` +
                ` -tvc 0x0000000000000000000000000000000000000000`

            const output = exec(tallyCommand).stderr
            expect(output).toEqual('Error: invalid MACI contract address\n')
        })

        it('should reject a contract address that does not have MACI deployed to it', async () => {
            const tallyCommand = `node ../cli/build/index.js tally` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x 0xxx` +
                ` -z ${randomLeaf.serialize()}` +
                ` -t test_tally.json` +
                ` -c 0x0000000000000000000000000000000000000000` +
                ` -pvc 0x0000000000000000000000000000000000000000` +
                ` -tvc 0x0000000000000000000000000000000000000000`

            const output = exec(tallyCommand).stderr
            expect(output).toEqual('Error: invalid MACI contract address\n')
        })

        it('should reject an invalid Ethereum private key', async () => {
            const tallyCommand = `node ../cli/build/index.js tally` +
                ` -sk ${coordinatorKeypair.privKey.serialize()}` +
                ` -d 0xxx` +
                ` -x ${maciAddress}` +
                ` -z ${randomLeaf.serialize()}` +
                ` -t test_tally.json` +
                ` -c 0x0000000000000000000000000000000000000000` +
                ` -pvc 0x0000000000000000000000000000000000000000` +
                ` -tvc 0x0000000000000000000000000000000000000000`

            const output = exec(tallyCommand).stderr
            expect(output).toEqual('Error: invalid Ethereum private key\n')
        })

        it('should reject an oversized current results salt', async () => {
            const tallyCommand = `node ../cli/build/index.js tally` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -z ${randomLeaf.serialize()}` +
                ` -t test_tally.json` +
                ` -c 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff` +
                ` -pvc 0x0000000000000000000000000000000000000000` +
                ` -tvc 0x0000000000000000000000000000000000000000`

            const output = exec(tallyCommand).stderr
            expect(output).toEqual('Error: the current results salt should be less than the BabyJub field size\n')
        })

        it('should reject an invalid current results salt', async () => {
            const tallyCommand = `node ../cli/build/index.js tally` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -z ${randomLeaf.serialize()}` +
                ` -t test_tally.json` +
                ` -c 0xx` +
                ` -pvc 0x0000000000000000000000000000000000000000` +
                ` -tvc 0x0000000000000000000000000000000000000000`

            const output = exec(tallyCommand).stderr
            expect(output).toEqual('Error: the current results salt should be a 32-byte hexadecimal string\n')
        })

        it('should reject an oversized total spent voice credits salt', async () => {
            const tallyCommand = `node ../cli/build/index.js tally` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -z ${randomLeaf.serialize()}` +
                ` -t test_tally.json` +
                ` -c 0x0000000000000000000000000000000000000000` +
                ` -pvc 0x0000000000000000000000000000000000000000` +
                ` -tvc 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`

            const output = exec(tallyCommand).stderr
            expect(output).toEqual('Error: the current total spent voice credits salt should be less than the BabyJub field size\n')
        })

        it('should reject an invalid current total spent voice credits salt', async () => {
            const tallyCommand = `node ../cli/build/index.js tally` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -z ${randomLeaf.serialize()}` +
                ` -t test_tally.json` +
                ` -c 0x0000000000000000000000000000000000000000` +
                ` -pvc 0x0000000000000000000000000000000000000000` +
                ` -tvc 0xx`

            const output = exec(tallyCommand).stderr
            expect(output).toEqual('Error: the current total spent voice credits salt should be a 32-byte hexadecimal string\n')
        })

        it('should reject an oversized per vote option spent voice credits salt', async () => {
            const tallyCommand = `node ../cli/build/index.js tally` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -z ${randomLeaf.serialize()}` +
                ` -t test_tally.json` +
                ` -c 0x0000000000000000000000000000000000000000` +
                ` -tvc 0x0000000000000000000000000000000000000000` +
                ` -pvc 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`

            const output = exec(tallyCommand).stderr
            expect(output).toEqual('Error: the current spent voice credits per vote option salt should be less than the BabyJub field size\n')
        })

        it('should reject an invalid current per vote option spent voice credits salt', async () => {
            const tallyCommand = `node ../cli/build/index.js tally` +
                ` -sk ${userKeypair.privKey.serialize()}` +
                ` -d ${userPrivKey}` +
                ` -x ${maciAddress}` +
                ` -z ${randomLeaf.serialize()}` +
                ` -t test_tally.json` +
                ` -c 0x0000000000000000000000000000000000000000` +
                ` -tvc 0x0000000000000000000000000000000000000000` +
                ` -pvc 0xx`

            const output = exec(tallyCommand).stderr
            expect(output).toEqual('Error: the current spent voice credits per vote option salt should be a 32-byte hexadecimal string\n')
        })
    })
})
