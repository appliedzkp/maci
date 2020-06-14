import { MaciState } from '../'
import { config } from 'maci-config'
import {
    bigInt,
    genRandomSalt,
} from 'maci-crypto'

import {
    PrivKey,
    Command,
    Message,
    Keypair,
    VoteLeaf,
} from 'maci-domainobjs'

const coordinator = new Keypair(new PrivKey(bigInt(config.maci.coordinatorPrivKey)))
const stateTreeDepth = config.maci.merkleTrees.stateTreeDepth
const messageTreeDepth = config.maci.merkleTrees.messageTreeDepth
const voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth
const initialVoiceCreditBalance = config.maci.initialVoiceCreditBalance
const maxVoteOptionIndex = config.maci.voteOptionsMaxLeafIndex

const user = new Keypair()

const maciState = new MaciState(
    coordinator,
    stateTreeDepth,
    messageTreeDepth,
    voteOptionTreeDepth,
    maxVoteOptionIndex,
)

const genMessage = (command: Command): Message => {
    const signature = command.sign(user.privKey)
    const sharedKey = Keypair.genEcdhSharedKey(user.privKey, coordinator.pubKey)
    const message = command.encrypt(signature, sharedKey)

    return message
}

const posVote = bigInt(9)
const negVote = bigInt(0)

describe('Process one message', () => {
    beforeAll(async () => {
        // Sign up the user
        maciState.signUp(user.pubKey, initialVoiceCreditBalance)
    })

    it('processMessage() should process a valid message', async () => {
        const command = new Command(
            bigInt(1),
            user.pubKey,
            bigInt(0),
            new VoteLeaf(posVote, negVote),
            bigInt(1),
            genRandomSalt(),
        )

        const message = genMessage(command)

        const copiedState = maciState.copy()

        // Publish a message
        copiedState.publishMessage(message, user.pubKey)
        expect(copiedState.messages.length).toEqual(1)
        const oldState = copiedState.copy()
        copiedState.processMessage(0)
        const newStateRoot = copiedState.genStateRoot()

        expect(newStateRoot.toString()).not.toEqual(oldState.genStateRoot().toString())

        const totalVotes = command.vote.pos + command.vote.neg
        expect(copiedState.users[0].voiceCreditBalance.toString())
            .toEqual((bigInt(initialVoiceCreditBalance) - totalVotes.pow(bigInt(2))).toString())
        expect(copiedState.users[0].votes[0].pos.toString()).toEqual(posVote.toString())
    })

    it('processMessage() should not process a message with an incorrect nonce', async () => {
        const command = new Command(
            bigInt(1),
            user.pubKey,
            bigInt(0),
            new VoteLeaf(posVote, negVote),
            bigInt(0),
            genRandomSalt(),
        )

        const message = genMessage(command)

        const copiedState = maciState.copy()

        // Publish a message
        copiedState.publishMessage(message, user.pubKey)
        expect(copiedState.messages.length).toEqual(1)
        const oldState = copiedState.copy()
        copiedState.processMessage(0)
        const newStateRoot = copiedState.genStateRoot()

        expect(newStateRoot.toString()).toEqual(oldState.genStateRoot().toString())
    })

    it('processMessage() should not process a message with an incorrect vote weight', async () => {
        const pos = bigInt(initialVoiceCreditBalance + 1)
        const neg = bigInt(0)
        const command = new Command(
            bigInt(1),
            user.pubKey,
            bigInt(0),
            new VoteLeaf(pos, neg),
            bigInt(1),
            genRandomSalt(),
        )

        const message = genMessage(command)

        const copiedState = maciState.copy()

        // Publish a message
        copiedState.publishMessage(message, user.pubKey)
        expect(copiedState.messages.length).toEqual(1)
        const oldState = copiedState.copy()
        copiedState.processMessage(0)
        const newStateRoot = copiedState.genStateRoot()

        expect(newStateRoot.toString()).toEqual(oldState.genStateRoot().toString())
    })

    it('processMessage() should not process a message with an incorrect state tree index', async () => {
        const command = new Command(
            bigInt(2),
            user.pubKey,
            bigInt(0),
            new VoteLeaf(posVote, negVote),
            bigInt(1),
            genRandomSalt(),
        )

        const message = genMessage(command)

        const copiedState = maciState.copy()

        // Publish a message
        copiedState.publishMessage(message, user.pubKey)
        expect(copiedState.messages.length).toEqual(1)
        const oldState = copiedState.copy()
        copiedState.processMessage(0)
        const newStateRoot = copiedState.genStateRoot()

        expect(newStateRoot.toString()).toEqual(oldState.genStateRoot().toString())
    })

    it('processMessage() should not process a message with an incorrect signature', async () => {
        const command = new Command(
            bigInt(1),
            user.pubKey,
            bigInt(0),
            new VoteLeaf(posVote, negVote),
            bigInt(1),
            genRandomSalt(),
        )

        const signature = command.sign(user.privKey)
        signature.S = signature.S + bigInt(1)
        const sharedKey = Keypair.genEcdhSharedKey(user.privKey, coordinator.pubKey)
        const message = command.encrypt(signature, sharedKey)

        const copiedState = maciState.copy()

        // Publish a message
        copiedState.publishMessage(message, user.pubKey)
        expect(copiedState.messages.length).toEqual(1)
        const oldState = copiedState.copy()
        copiedState.processMessage(0)
        const newStateRoot = copiedState.genStateRoot()

        expect(newStateRoot.toString()).toEqual(oldState.genStateRoot().toString())
    })

    it('processMessage() should not process a message with an invalid maxVoteOptionIndex', async () => {
        const command = new Command(
            bigInt(1),
            user.pubKey,
            bigInt(maxVoteOptionIndex + 1),
            new VoteLeaf(posVote, negVote),
            bigInt(1),
            genRandomSalt(),
        )

        const signature = command.sign(user.privKey)
        const sharedKey = Keypair.genEcdhSharedKey(user.privKey, coordinator.pubKey)
        const message = command.encrypt(signature, sharedKey)

        const copiedState = maciState.copy()

        // Publish a message
        copiedState.publishMessage(message, user.pubKey)
        expect(copiedState.messages.length).toEqual(1)
        const oldState = copiedState.copy()
        copiedState.processMessage(0)
        const newStateRoot = copiedState.genStateRoot()

        expect(newStateRoot.toString()).toEqual(oldState.genStateRoot().toString())
    })
})
