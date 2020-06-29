include "../node_modules/circomlib/circuits/mux1.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "./trees/incrementalQuinTree.circom";
include "./trees/incrementalMerkleTree.circom";
include "./hasherPoseidon.circom";
include "./trees/calculateTotal.circom";
include "./trees/checkRoot.circom";

// This circuit tallies the votes from a batch of state leaves, and produces an
// intermediate state root. 

// TODO: rename the inputs so that they are more intuitive

template QuadVoteTally(
    // The depth of the full state tree
    fullStateTreeDepth,
    // The depth of the intermediate state tree
    intermediateStateTreeDepth,
    // The depth of the vote option tree
    voteOptionTreeDepth
) {

    // --- BEGIN inputs

    // The state root of the full state tree
    signal input fullStateRoot;

    // numUsers is the size of the current batch of state leaves to process
    var numUsers = 2 ** intermediateStateTreeDepth;

    var k = fullStateTreeDepth - intermediateStateTreeDepth;

    //	The Merkle path elements from `intermediateStateRoot` to `stateRoot`.
    signal private input intermediatePathElements[k];

    // The Merkle path index from `intermediateStateRoot` to `stateRoot`.
    signal input intermediatePathIndex;

    // The intermediate state root, which is generated from the current batch
    // of state leaves (see `stateLeaves` below)
    signal input intermediateStateRoot;

    // Each element in `currentResults` and `newResults` is the sum of the
    // square root of each user's voice credits per option.
    // [x, y] means x for option 0, and y for option 1.

    var numVoteOptions = 5 ** voteOptionTreeDepth;

    // `currentResults` is the vote tally of all prior batches of state leaves	
    signal private input currentResults[numVoteOptions];

    signal input currentResultsCommitment;
    signal private input currentResultsSalt;

    // `newResults` is the vote tally of this batch of state leaves
    signal output newResultsCommitment;

    // The salt to hash with the computed results in order to produce newResultsCommitment
    signal private input newResultsSalt;

    // The batch of state leaves to tally
    var messageLength = 5;
    signal private input stateLeaves[numUsers][messageLength];

    // Each element in `voteLeaves` is an array of the square roots of a user's
    // voice credits per option.
    signal private input voteLeaves[numUsers][numVoteOptions];

    // The total spent voice credit commitments and salts
    signal input currentSpentVoiceCreditsCommitment;
    signal private input currentSpentVoiceCredits;
    signal private input currentSpentVoiceCreditsSalt;
    signal private input newSpentVoiceCreditsSalt;
    signal output newSpentVoiceCreditsCommitment;

    // The per-option spent voice credit commitments and salts
    signal input currentPerVOSpentVoiceCreditsCommitment;
    signal private input currentPerVOSpentVoiceCredits[numVoteOptions];
    signal private input currentPerVOSpentVoiceCreditsSalt;
    signal private input newPerVOSpentVoiceCreditsSalt;
    signal output newPerVOSpentVoiceCreditsCommitment;

    // --- END inputs

    var STATE_TREE_VOTE_OPTION_TREE_ROOT_IDX = 2;
    var STATE_TREE_VOICE_CREDIT_BALANCE_IDX = 3;

    // --- BEGIN check the full state root

    var i;
    var j;
    var m;

    // Generate the intermediate path index for Merkle proof verifcation
    component intermediatePathIndices = Num2Bits(k);
    intermediatePathIndices.in <== intermediatePathIndex;

    // Check that the intermediate root is part of the full state tree
    component fullStateRootChecker = LeafExists(k);
    fullStateRootChecker.root <== fullStateRoot; 
    fullStateRootChecker.leaf <== intermediateStateRoot; 
    for (i = 0; i < k; i ++) {
        fullStateRootChecker.path_elements[i] <== intermediatePathElements[i];
        fullStateRootChecker.path_index[i] <== intermediatePathIndices.out[i];
    }

    // --- END

    // --- BEGIN check the intermediate state root

    component stateLeafHashers[numUsers];
    component intermediateStateRootChecker = CheckRoot(intermediateStateTreeDepth);
    component voteOptionRootChecker[numUsers];

    // Instantiate the state leaf checker and vote option root checker
    // components in the same loop
    for (i=0; i < numUsers; i++) {
        voteOptionRootChecker[i] = QuinCheckRoot(voteOptionTreeDepth);
        stateLeafHashers[i] = Hasher5();

        // Hash each state leaf
        for (j=0; j < messageLength; j++) {
            stateLeafHashers[i].in[j] <== stateLeaves[i][j];
        }

        // Calculate the intermediate state root
        intermediateStateRootChecker.leaves[i] <== stateLeafHashers[i].hash;
    }

    // Ensure via a constraint that the `intermediateStateRoot` is the correct
    // Merkle root of the stateLeaves passed into this snark
    intermediateStateRoot === intermediateStateRootChecker.root;

    // --- END

    // --- BEGIN total spent voice credit tally

    // Verify currentSpentVoiceCreditsCommitment
    component currentSpentVoiceCreditCommitmentHasher = HashLeftRight();
    currentSpentVoiceCreditCommitmentHasher.left <== currentSpentVoiceCredits;
    currentSpentVoiceCreditCommitmentHasher.right <== currentSpentVoiceCreditsSalt;
    currentSpentVoiceCreditsCommitment === currentSpentVoiceCreditCommitmentHasher.hash;

    component newSpentVoiceCreditSubtotal = CalculateTotal(numUsers * numVoteOptions + 1);

    // Add the cumulative spent voice credits from all prior batches
    newSpentVoiceCreditSubtotal.nums[numUsers * numVoteOptions] <== currentSpentVoiceCredits;

    // Add the spent voice credits for this batch
    for (i=0; i < numUsers; i++) {
        for (j=0; j < numVoteOptions; j++) {
            // Add the voice credits spent per vote option
            newSpentVoiceCreditSubtotal.nums[i * numVoteOptions + j] <== 
                voteLeaves[i][j] * voteLeaves[i][j];
        }
    }

    // Compute the commitment to the new voice credit tally
    component newSpentVoiceCreditCommitmentHasher = HashLeftRight();
    newSpentVoiceCreditCommitmentHasher.left <== newSpentVoiceCreditSubtotal.sum;
    newSpentVoiceCreditCommitmentHasher.right <== newSpentVoiceCreditsSalt;
    newSpentVoiceCreditsCommitment <== newSpentVoiceCreditCommitmentHasher.hash;
    // --- END

    // --- BEGIN the vote tally and vote option root, as well as the per vote
    // option spent voice credit tally

    // Verify currentPerVOSpentVoiceCreditsCommitment
    component currentPerVOSpentVoiceCreditsTree = QuinCheckRoot(voteOptionTreeDepth);
    for (i = 0; i < numVoteOptions; i++) {
        currentPerVOSpentVoiceCreditsTree.leaves[i] <== currentPerVOSpentVoiceCredits[i];
    }
    component currentPerVOSpentVoiceCreditCommitmentHasher = HashLeftRight();
    currentPerVOSpentVoiceCreditCommitmentHasher.left <== currentPerVOSpentVoiceCreditsTree.root;
    currentPerVOSpentVoiceCreditCommitmentHasher.right <== currentPerVOSpentVoiceCreditsSalt;
    currentPerVOSpentVoiceCreditsCommitment === currentPerVOSpentVoiceCreditCommitmentHasher.hash;

    component voteOptionSubtotals[numVoteOptions];
    component perVOSpentVoiceCreditSubtotals[numVoteOptions];

    // Prepare the CalculateTotal components to add up (a) the current vote
    // tally and (b) the spent voice credits
    for (i=0; i < numVoteOptions; i++) {
        voteOptionSubtotals[i] = CalculateTotal(numUsers + 1);

        // Add the existing vote tally to the subtotal
        voteOptionSubtotals[i].nums[numUsers] <== currentResults[i];

        perVOSpentVoiceCreditSubtotals[i] = CalculateTotal(numUsers + 1);
        // Add the existing per vote option spent voice credit tally to the subtotal
        perVOSpentVoiceCreditSubtotals[i].nums[numUsers] <== currentPerVOSpentVoiceCredits[i];
    }

    // Determine if we should skip leaf 0. This should only be the case if
    // intermediatePathIndex is 0

    // `isZero.out` is 1 only if intermediatePathIndex equals 0
    component isZero = IsZero();
    isZero.in <== intermediatePathIndex;

    // If intermediatePathIndex equals 0, the first leaf should be [0, 0, ...]
    // (just zeros).

    // Otherwise, it should be voteLeaves[0][...]

    component mux[numVoteOptions];
    for (i = 0; i < numVoteOptions; i++) {
        mux[i] = Mux1();

        // The selector.
        mux[i].s <== isZero.out;
        mux[i].c[0] <== voteLeaves[0][i];
        mux[i].c[1] <== 0;

        //`mux.out` returns mux.c[0] if s == 0 and mux.c[1] otherwise
        voteOptionRootChecker[0].leaves[i] <== mux[i].out;
        voteOptionSubtotals[i].nums[0] <== mux[i].out;

        perVOSpentVoiceCreditSubtotals[i].nums[0] <== mux[i].out * mux[i].out;
    }

    for (i = 1; i < numUsers; i++) {
        //  Note that we ignore user 0 (leaf 0 of the state tree) which
        //  only contains random data

        for (j = 0; j < numVoteOptions; j++) {
            // Ensure that the voteLeaves for this user is correct (such that
            // when each (unhashed) vote leaf is inserted into an MT, the Merkle root
            // matches the `voteOptionTreeRoot` field of the state leaf)

            voteOptionRootChecker[i].leaves[j] <== voteLeaves[i][j];

            // Calculate the sum of votes for each option.
            voteOptionSubtotals[j].nums[i] <== voteLeaves[i][j];

            // Calculate the sum of voice credits for each option.
            perVOSpentVoiceCreditSubtotals[j].nums[i] <== voteLeaves[i][j] * voteLeaves[i][j];
        }

        // Check that the computed vote option tree root matches the
        // corresponding value in the state leaf
        voteOptionRootChecker[i].root === stateLeaves[i][STATE_TREE_VOTE_OPTION_TREE_ROOT_IDX];
    }

    component perVOSpentVoiceCreditTree = QuinCheckRoot(voteOptionTreeDepth);
    for (i = 0; i < numVoteOptions; i++) {
        perVOSpentVoiceCreditTree.leaves[i] <== perVOSpentVoiceCreditSubtotals[i].sum;
    }

    component newPerVOSpentVoiceCreditCommitmentHasher = HashLeftRight();
    newPerVOSpentVoiceCreditCommitmentHasher.left <== perVOSpentVoiceCreditTree.root;
    newPerVOSpentVoiceCreditCommitmentHasher.right <== newPerVOSpentVoiceCreditsSalt;
    newPerVOSpentVoiceCreditsCommitment <== newPerVOSpentVoiceCreditCommitmentHasher.hash;

    // --- END

    // --- BEGIN verify commitments to results

    component resultCommitmentVerifier = ResultCommitmentVerifier(voteOptionTreeDepth);
    resultCommitmentVerifier.currentResultsSalt <== currentResultsSalt;
    resultCommitmentVerifier.currentResultsCommitment <== currentResultsCommitment;
    resultCommitmentVerifier.newResultsSalt <== newResultsSalt;
    for (i = 0; i < numVoteOptions; i++) {
        resultCommitmentVerifier.newResults[i] <== voteOptionSubtotals[i].sum;
        resultCommitmentVerifier.currentResults[i] <== currentResults[i];
    }

    // Output a commitment to the new results
    newResultsCommitment <== resultCommitmentVerifier.newResultsCommitment;

    // --- END
}

/*
 * Verifies the commitment to the current results. Also computes and outputs a
 * commitment to the new results.
 */
template ResultCommitmentVerifier(voteOptionTreeDepth) {
    var numVoteOptions = 5 ** voteOptionTreeDepth;

    signal input currentResultsSalt;
    signal input currentResultsCommitment;
    signal input currentResults[numVoteOptions];

    signal input newResultsSalt;
    signal input newResults[numVoteOptions];
    signal output newResultsCommitment;

    // Salt and hash the results up to the current batch
    component currentResultsTree = QuinCheckRoot(voteOptionTreeDepth);
    component newResultsTree = QuinCheckRoot(voteOptionTreeDepth);
    for (var i = 0; i < numVoteOptions; i++) {
        newResultsTree.leaves[i] <== newResults[i];
        currentResultsTree.leaves[i] <== currentResults[i];
    }

    component currentResultsCommitmentHasher = HashLeftRight();
    currentResultsCommitmentHasher.left <== currentResultsTree.root;
    currentResultsCommitmentHasher.right <== currentResultsSalt;

    // Also salt and hash the result of the current batch
    component newResultsCommitmentHasher = HashLeftRight();
    newResultsCommitmentHasher.left <== newResultsTree.root;
    newResultsCommitmentHasher.right <== newResultsSalt;

    // Check if the salted hash of the results up to the current batch is valid
    currentResultsCommitment === currentResultsCommitmentHasher.hash;

    newResultsCommitment <== newResultsCommitmentHasher.hash;
}
