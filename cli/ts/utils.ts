import * as ethers from 'ethers'
import * as prompt from 'prompt-async'

prompt.colors = false
prompt.message = ''

import { bigInt, SNARK_FIELD_SIZE } from 'maci-crypto'

import {
    MaciState,
} from 'maci-core'

import {
    PubKey,
    Keypair,
    Message,
    StateLeaf,
} from 'maci-domainobjs'

import {
    genJsonRpcDeployer,
} from 'maci-contracts'

import {
    maciContractAbi,
} from 'maci-contracts'

/*
 * Retrieves and parses on-chain MACI contract data to create an off-chain
 * representation as a MaciState object.
 * @param provider An Ethereum provider
 * @param address The address of the MACI contract
 * @coordinatorKeypair The coordinator's keypair
 */
const genMaciStateFromContract = async (
    provider: ethers.providers.Provider,
    address: string,
    coordinatorKeypair: Keypair,
    zerothLeaf: StateLeaf,
) => {

    const maciContract = new ethers.Contract(
        address,
        maciContractAbi,
        provider,
    )

    const treeDepths = await maciContract.treeDepths()
    const stateTreeDepth = bigInt(treeDepths[0].toString())
    const messageTreeDepth = bigInt(treeDepths[1].toString())
    const voteOptionTreeDepth = bigInt(treeDepths[2].toString())
    const maxVoteOptionIndex = bigInt((
            await maciContract.voteOptionsMaxLeafIndex()
        ).toString())

    const maciState = new MaciState(
        coordinatorKeypair,
        stateTreeDepth,
        messageTreeDepth,
        voteOptionTreeDepth,
        maxVoteOptionIndex,
    )

    const signUpLogs = await provider.getLogs({
        ...maciContract.filters.SignUp(),
        fromBlock: 0,
    })
    
    const publishMessageLogs = await provider.getLogs({
        ...maciContract.filters.PublishMessage(),
        fromBlock: 0,
    })

    const iface = new ethers.utils.Interface(maciContractAbi)
    for (const log of signUpLogs) {
        const events = iface.parseLog(log)
        const voiceCreditBalance = bigInt(events.values._voiceCreditBalance.toString())
        let pubKey

        if (log.transactionHash) {

            // Retrieve and decode the transaction data as it is not possible
            // to get the user's public key from the SignUp event (at least
            // with Ganache - TBC)
            const tx = await provider.getTransaction(log.transactionHash)
            const data = ethers.utils.defaultAbiCoder.decode(
                iface.functions.signUp.inputs,
                ethers.utils.hexDataSlice(tx.data, 4),
            )
            pubKey = new PubKey([
                bigInt(data._userPubKey.x.toString()),
                bigInt(data._userPubKey.y.toString()),
            ])

        } else {
            throw new Error('Error: could not retrieve a signUp transaction hash')
        }

        maciState.signUp(
            pubKey,
            voiceCreditBalance,
        )
    }

    for (const log of publishMessageLogs) {
        let message: Message
        let encPubKey: PubKey

        if (log.transactionHash) {
            const tx = await provider.getTransaction(log.transactionHash)
            const data = ethers.utils.defaultAbiCoder.decode(
                iface.functions.publishMessage.inputs,
                ethers.utils.hexDataSlice(tx.data, 4),
            )

            const msgIv = bigInt(data._message.iv.toString())
            const msgData = data._message.data.map((x) => bigInt(x.toString()))
            message = new Message(msgIv, msgData)

            encPubKey = new PubKey([
                bigInt(data._encPubKey.x.toString()),
                bigInt(data._encPubKey.y.toString()),
            ])

            maciState.publishMessage(message, encPubKey)
        } else {
            throw new Error('Error: could not retrieve a publishMessage transaction hash')
        }
    }
    
    // Check whether the above steps were done correctly
    const onChainStateRoot = await maciContract.getStateTreeRoot()
    if (maciState.genStateRoot().toString(16) !== bigInt(onChainStateRoot).toString(16)) {
        throw new Error('Error: could not correctly recreate the state tree from on-chain data')
    }

    const onChainMessageRoot = await maciContract.getMessageTreeRoot()
    if (maciState.genMessageRoot().toString(16) !== bigInt(onChainMessageRoot).toString(16)) {
        throw new Error('Error: could not correctly recreate the message tree from on-chain data')
    }

    // Process the messages so that the users array is up to date with the
    // contract's state tree
    const postSignUpStateRoot = await maciContract.postSignUpStateRoot()
    const currentMessageBatchIndex = (await maciContract.currentMessageBatchIndex())
    const messageBatchSize = (await maciContract.messageBatchSize())

    for (let i = 0; i < currentMessageBatchIndex; i += messageBatchSize) {
        maciState.batchProcessMessage(
            i,
            messageBatchSize,
            zerothLeaf,
        )
    }

    if (maciState.genStateRoot().toString(16) !== bigInt(postSignUpStateRoot).toString(16)) {
        throw new Error('Error: could not correctly process messages to recreate the state')
    }

    return maciState
}

const calcBinaryTreeDepthFromMaxLeaves = (maxLeaves: number) => {
    let result = 0
    while (2 ** result < maxLeaves) {
        result ++
    }
    return result
}

const calcQuinTreeDepthFromMaxLeaves = (maxLeaves: number) => {
    let result = 0
    while (5 ** result < maxLeaves) {
        result ++
    }
    return result
}

const validateEthAddress = (address: string) => {
    return address.match(/^0x[a-fA-F0-9]{40}$/) != null
}

const promptPwd = async (name: string) => {
    prompt.start()
    const input = await prompt.get([
        {
            name,
            hidden: true,
        }
    ])

    return input[name]
}

const checkDeployerProviderConnection = async (
    sk: string,
    ethProvider: string,
) => {

    const deployer = genJsonRpcDeployer(sk, ethProvider)
    try {
        await deployer.provider.getBlockNumber()
    } catch {
        return false
    }

    return true
}

const validateSaltFormat = (salt: string): boolean => {
    return salt.match(/^0x[a-fA-F0-9]+$/) != null
}

const validateSaltSize = (salt: string): boolean => {
    return bigInt(salt) < SNARK_FIELD_SIZE
}

const validateEthSk = (sk: string): boolean => {
    try {
        new ethers.Wallet(sk)
    } catch {
        return false
    }
    return true
}

const contractExists = async (
    provider: ethers.providers.Provider,
    address: string,
) => {
    const code = await provider.getCode(address)
    return code.length > 2
}

export {
    promptPwd,
    calcBinaryTreeDepthFromMaxLeaves,
    calcQuinTreeDepthFromMaxLeaves,
    validateEthSk,
    checkDeployerProviderConnection,
    validateSaltSize,
    validateSaltFormat,
    validateEthAddress,
    contractExists,
    genMaciStateFromContract,
}
