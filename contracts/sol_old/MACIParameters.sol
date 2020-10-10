pragma experimental ABIEncoderV2;
pragma solidity ^0.5.0;

contract MACIParameters {
    // This structs help to reduce the number of parameters to the constructor
    // and avoid a stack overflow error during compilation
    struct TreeDepths {
        uint8 stateTreeDepth;
        uint8 messageTreeDepth;
        uint8 voteOptionTreeDepth;
    }

    struct BatchSizes {
        uint8 tallyBatchSize;
        uint8 messageBatchSize;
    }

    struct MaxValues {
        uint256 maxUsers;
        uint256 maxMessages;
        uint256 maxVoteOptions;
    }
}
