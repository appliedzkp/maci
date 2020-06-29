const maxUsers = 4 ** 2 - 1
const maxMessages = 4 ** 2 - 1
const maxVoteOptions = 15
const signupDuration = 15 
const votingDuration = 60
const messageBatchSize = 4
const tallyBatchSize = 4
const initialVoiceCredits = 1000
const stateTreeDepth = 4
const messageTreeDepth = 4
const voteOptionTreeDepth = 2

export {
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
}
