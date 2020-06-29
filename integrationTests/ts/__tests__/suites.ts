import * as ethers from 'ethers'
import {
    PubKey,
    PrivKey,
    Keypair,
    Command,
    StateLeaf,
} from 'maci-domainobjs'

import { 
    genPerVOSpentVoiceCreditsCommitment,
    genSpentVoiceCreditsCommitment,
    genTallyResultCommitment,
    MaciState,
} from 'maci-core'

import {
    bigInt,
    genRandomSalt,
} from 'maci-crypto'

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
    messageBatchSize,
    tallyBatchSize,
    initialVoiceCredits,
    stateTreeDepth,
    messageTreeDepth,
    voteOptionTreeDepth,
} from './params'

const loadData = (name: string) => {
    return require('@maci-integrationTests/ts/__tests__/suites/' + name)
}

const executeSuite = async (data: any, expect: any) => {
    console.log(data)
    const accounts = genTestAccounts(2)
    const userPrivKey = accounts[1].privateKey
    const coordinatorKeypair = new Keypair()
    const maciPrivkey = coordinatorKeypair.privKey.serialize()
    const deployerPrivKey = accounts[0].privateKey
    const providerUrl = config.get('chain.url')
    const provider = new ethers.providers.JsonRpcProvider(providerUrl)

    const deployerWallet = new ethers.Wallet(accounts[0].privateKey, provider)
    const tx = await deployerWallet.provider.sendTransaction(
        accounts[0].sign({
            nonce: await deployerWallet.provider.getTransactionCount(accounts[0].address),
            gasPrice: ethers.utils.parseUnits('10', 'gwei'),
            gasLimit: 21000,
            to: accounts[1].address,
            value: ethers.utils.parseUnits('1', 'ether'),
            data: '0x'
        })
    )
    await tx.wait()

    const maciState = new MaciState(
        coordinatorKeypair,
        stateTreeDepth,
        messageTreeDepth,
        voteOptionTreeDepth,
        maxVoteOptions,
    )

    const signupDuration = data.numUsers * 15
    const votingDuration = data.numUsers * 15

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
    const maciAddress = regMatch[1]
    
    const userKeypairs: Keypair[] = []

    console.log(`Signing up ${data.numUsers} users`)
    // Sign up
    for (let i = 0; i < data.numUsers; i++) {
        const userKeypair = new Keypair()
        userKeypairs.push(userKeypair)
        // Run the signup command
        const signupCommand = `node ../cli/build/index.js signup` +
            ` -p ${userKeypair.pubKey.serialize()}` +
            ` -d ${userPrivKey}` +
            ` -x ${maciAddress}`

        //console.log(signupCommand)

        const signupExec = exec(signupCommand)
        if (signupExec.stderr) {
            console.error(signupExec.stderr)
            return false
        }

        maciState.signUp(
            userKeypair.pubKey, 
            bigInt(initialVoiceCredits),
        )
    }

    const maciContract = new ethers.Contract(
        maciAddress,
        maciContractAbi,
        provider,
    )

    expect(maciState.genStateRoot().toString()).toEqual((await maciContract.getStateTreeRoot()).toString())

    await maciContract.signUpTimestamp()

    await delay(1000 * signupDuration)

    // Publish messages
    console.log(`Publishing messages`)

    for (let i = 0; i < data.commands.length; i++) {
        if (data.commands[i].user >= userKeypairs.length) {
            continue
        }

        const userKeypair = userKeypairs[data.commands[i].user]
        const stateIndex = i + 1
        const voteOptionIndex = data.commands[i].voteOptionIndex
        const newVoteWeight  = data.commands[i].voteWeight
        const nonce = data.commands[i].nonce
        const salt = '0x' + genRandomSalt().toString(16)
 
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

        //console.log(publishCommand)

        const publishExec = exec(publishCommand)
        if (publishExec.stderr) {
            console.log(publishExec.stderr)
            return false
        }

        const publishOutput = publishExec.stdout.trim()
        //console.log(publishOutput)

        const publishRegMatch = publishOutput.match(
            /Transaction hash: (0x[a-fA-F0-9]{64})\nEphemeral private key: (macisk.[a-f0-9]+)$/)

        // The publish command generates and outputs a random ephemeral private
        // key, so we have to retrieve it from the standard output
        const encPrivKey = PrivKey.unserialize(publishRegMatch[2])
        const encPubKey = new PubKey(genPubKey(encPrivKey.rawPrivKey))

        const command = new Command(
            bigInt(stateIndex),
            userKeypair.pubKey,
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
                coordinatorKeypair.pubKey,
            )
        )

        maciState.publishMessage(
            message,
            encPubKey,
        )
    }

    // Check whether the message tree root is correct
    expect(maciState.genMessageRoot().toString()).toEqual((await maciContract.getMessageTreeRoot()).toString())

    await delay(1000 * votingDuration)

    // Process messages
    const processCommand = `NODE_OPTIONS=--max-old-space-size=4096 node ../cli/build/index.js process` +
        ` -sk ${coordinatorKeypair.privKey.serialize()}` +
        ` -d ${userPrivKey}` +
        ` -x ${maciAddress}` +
        ` --repeat`

    console.log(processCommand)

    const e = exec(processCommand)

    if (e.stderr) {
        console.log(e.stderr)
    }
    console.log(e.stdout)

    const output = e.stdout.trim()

    // Check whether the transaction succeeded
    const processRegMatch = output.match(
        /Processed batch starting at index ([0-9]+)\nTransaction hash: (0x[a-fA-F0-9]{64})\nRandom state leaf: (.+)$/
    )

    expect(processRegMatch).toBeTruthy()

    // Check whether it has processed all batches
    const processedIndexNum = parseInt(processRegMatch[1], 10)
    const currentMessageBatchIndex = await maciContract.currentMessageBatchIndex()

    expect((processedIndexNum + messageBatchSize).toString()).toEqual(currentMessageBatchIndex.toString())

    const randomLeaf = StateLeaf.unserialize(processRegMatch[3])

    const tallyCommand = `NODE_OPTIONS=--max-old-space-size=4096 node ../cli/build/index.js tally` +
        ` -sk ${coordinatorKeypair.privKey.serialize()}` +
        ` -d ${userPrivKey}` +
        ` -x ${maciAddress}` +
        ` -z ${randomLeaf.serialize()}` +
        ` -t test_tally.json` +
        ` -c 0x0000000000000000000000000000000000000000000000000000000000000000` +
        ` -tvc 0x0000000000000000000000000000000000000000000000000000000000000000` +
        ` -pvc 0x0000000000000000000000000000000000000000000000000000000000000000` +
        ` -r`

    console.log(tallyCommand)

    const tallyOutput = exec(tallyCommand)

    if (tallyOutput.stderr) {
        console.log(tallyOutput.stderr)
    }

    console.log(tallyOutput.stdout)

    const tallyRegMatch = tallyOutput.match(
        /Transaction hash: (0x[a-fA-F0-9]{64})\nCurrent results salt: (0x[a-fA-F0-9]+)\nResult commitment: 0x[a-fA-F0-9]+\nTotal spent voice credits salt: (0x[a-fA-F0-9]+)\nTotal spent voice credits commitment: 0x[a-fA-F0-9]+\nTotal spent voice credits per vote option salt: (0x[a-fA-F0-9]+)\nTotal spent voice credits per vote option commitment: (0x[a-fA-F0-9]+)\n$/
    )

    if (!tallyRegMatch) {
        console.log('Mismatch:')
        console.log(tallyOutput)
    }

    expect(tallyRegMatch).toBeTruthy()

    const resultsSalt = bigInt(tallyRegMatch[2])

    const finalTallyCommitment = await maciContract.currentResultsCommitment()
    const expectedTallyCommitment = genTallyResultCommitment(
        data.expectedTally,
        resultsSalt,
        voteOptionTreeDepth,
    )

    expect(finalTallyCommitment.toString())
        .toEqual(expectedTallyCommitment.toString())

    const tvcSalt = bigInt(tallyRegMatch[3])
    const finalTvcCommitment = 
        await maciContract.currentSpentVoiceCreditsCommitment()

    const expectedTvcCommitment = genSpentVoiceCreditsCommitment(
        data.expectedTotalSpentVoiceCredits,
        tvcSalt,
    )
    expect(expectedTvcCommitment.toString())
        .toEqual(finalTvcCommitment.toString())


    const pvcSalt = bigInt(tallyRegMatch[4])
    const finalPvcCommitment =
        await maciContract.currentPerVOSpentVoiceCreditsCommitment()
    const expectedPvcCommitment = genPerVOSpentVoiceCreditsCommitment(
        data.expectedSpentVoiceCredits,
        pvcSalt,
        voteOptionTreeDepth,
    )
    expect(expectedPvcCommitment.toString())
        .toEqual(finalPvcCommitment.toString())

    const verifyCommand = `NODE_OPTIONS=--max-old-space-size=4096 node ../cli/build/index.js verify ` +
        '-t test_tally.json'

    console.log(verifyCommand)

    const verifyOutput = exec(verifyCommand)

    if (verifyOutput.stderr) {
        console.log(verifyOutput.stderr)
    }

    const verifyRegMatch = verifyOutput.match(
        /The results commitment in the specified file is correct given the tally and salt\nThe total spent voice credit commitment in the specified file is correct given the tally and salt\nThe per vote option spent voice credit commitment in the specified file is correct given the tally and salt\nThe results commitment in the MACI contract on-chain is valid\nThe total spent voice credit commitment in the MACI contract on-chain is valid\nThe per vote option spent voice credit commitment in the MACI contract on-chain is valid\n/
    )
    if (!verifyRegMatch) {
        console.log(verifyOutput)
    }
    expect(verifyRegMatch).toBeTruthy()

    return true
}

export {
    loadData,
    executeSuite,
}
