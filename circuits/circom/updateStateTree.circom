include "./decrypt.circom";
include "./ecdh.circom"
include "./hasherPoseidon.circom";
include "./trees/incrementalMerkleTree.circom"
include "./trees/incrementalQuinTree.circom"
include "./publickey_derivation.circom"
include "./verify_signature.circom";

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux1.circom";
include "../node_modules/circomlib/circuits/mux2.circom";

template ValidateIndices() {
    signal input vote_options_max_leaf_index;
    signal input vote_options_max_leaves;
    signal input state_tree_max_leaf_index;
    signal input state_tree_max_leaves;

    component valid_vote_options_max_leaf_index = LessEqThan(32);
    valid_vote_options_max_leaf_index.in[0] <== vote_options_max_leaf_index;
    valid_vote_options_max_leaf_index.in[1] <== vote_options_max_leaves;
    valid_vote_options_max_leaf_index.out === 1;

    component valid_state_tree_max_leaf_index = LessEqThan(32);
    valid_state_tree_max_leaf_index.in[0] <== state_tree_max_leaf_index;
    valid_state_tree_max_leaf_index.in[1] <== state_tree_max_leaves;
    valid_state_tree_max_leaf_index.out === 1;
}

template CheckValidUpdate() {
    signal input valid_signature;
    signal input sufficient_voice_credits;
    signal input correct_nonce;
    signal input valid_state_leaf_index;
    signal input valid_vote_options_leaf_index;

    signal output out;

    component valid_update = IsEqual();
    valid_update.in[0] <== 5;
    valid_update.in[1] <== valid_signature + sufficient_voice_credits + correct_nonce + valid_state_leaf_index + valid_vote_options_leaf_index;

    out <== valid_update.out;
}

template PerformChecksBeforeUpdate(
    MESSAGE_LENGTH,
    MESSAGE_WITHOUT_SIGNATURE_LENGTH,
    message_tree_depth,
    STATE_TREE_DATA_LENGTH,
    state_tree_depth,
    state_tree_max_leaves,
    vote_options_tree_depth,
    vote_options_max_leaves,
    CMD_VOTE_WEIGHT_IDX,
    STATE_TREE_PUBLIC_KEY_X_IDX,
    STATE_TREE_PUBLIC_KEY_Y_IDX,
    CMD_SIG_R8X_IDX,
    CMD_SIG_R8Y_IDX,
    CMD_SIG_S_IDX
) {
    var VOTE_OPTION_TREE_BASE = 5;
    var VOTE_OPTION_TREE_PATH_ELEMENTS_LENGTH = VOTE_OPTION_TREE_BASE - 1;

    signal input vote_options_max_leaf_index;
    signal input state_tree_max_leaf_index;

    signal input ecdh_private_key;
    signal input coordinator_public_key[2];
    signal input ecdh_public_key[2];

    signal input message[MESSAGE_LENGTH];
    signal input msg_tree_root;
    signal input msg_tree_path_elements[message_tree_depth];
    signal input msg_tree_path_index[message_tree_depth];

    signal input state_tree_data_raw[STATE_TREE_DATA_LENGTH];
    signal input state_tree_root;
    signal input state_tree_path_elements[state_tree_depth];
    signal input state_tree_path_index[state_tree_depth];

    signal input vote_options_tree_root;
    signal input vote_options_leaf_raw;
    signal input vote_options_tree_path_elements[vote_options_tree_depth][VOTE_OPTION_TREE_PATH_ELEMENTS_LENGTH];
    signal input vote_options_tree_path_index[vote_options_tree_depth];

    signal output decrypted_command_out[MESSAGE_LENGTH-1];
    signal output new_vote_options_tree_root;
    signal output signature_verifier_valid;

    // Check 0: Make sure max indexes are valid
    component validate_indices = ValidateIndices();
    validate_indices.vote_options_max_leaf_index <== vote_options_max_leaf_index;
    validate_indices.vote_options_max_leaves <== vote_options_max_leaves;
    validate_indices.state_tree_max_leaf_index <== state_tree_max_leaf_index;
    validate_indices.state_tree_max_leaves <== state_tree_max_leaves;

    // Check 1. The coordinator's private key is correct
    component derived_pub_key = PublicKey();
    derived_pub_key.private_key <== ecdh_private_key;

    derived_pub_key.public_key[0] === coordinator_public_key[0];
    derived_pub_key.public_key[1] === coordinator_public_key[1];

    // Derive shared key
    component ecdh = Ecdh();
    ecdh.private_key <== ecdh_private_key;
    ecdh.public_key[0] <== ecdh_public_key[0];
    ecdh.public_key[1] <== ecdh_public_key[1];

    // Check 2. The decrypted message matches the given message
    component decrypted_command = Decrypt(MESSAGE_LENGTH - 1);
    decrypted_command.private_key <== ecdh.shared_key;
    for (var i = 0; i < MESSAGE_LENGTH; i++) {
        decrypted_command.message[i] <== message[i];
    }
    for (var i = 0; i < MESSAGE_LENGTH - 1; i++) {
        decrypted_command_out[i] <== decrypted_command.out[i];
    }

    // TODO: combine this loop with the above
    // Compute the leaf, which is the hash of the message
    component msg_hash = Hasher11();
    for (var i = 0; i < MESSAGE_LENGTH; i++) {
        msg_hash.in[i] <== message[i];
    }

    // Check 3. The leaf exists in the message tree
    component msg_tree_leaf_exists = LeafExists(message_tree_depth);
    msg_tree_leaf_exists.root <== msg_tree_root;
    msg_tree_leaf_exists.leaf <== msg_hash.hash;
    for (var i = 0; i < message_tree_depth; i++) {
        msg_tree_leaf_exists.path_elements[i] <== msg_tree_path_elements[i];
        msg_tree_leaf_exists.path_index[i] <== msg_tree_path_index[i];
    }

    // Check 4. Make sure the hash of the data corresponds to the existing leaf
    // in the state tree
    component existing_state_tree_leaf_hash = Hasher5();
    for (var i = 0; i < STATE_TREE_DATA_LENGTH; i++) {
        existing_state_tree_leaf_hash.in[i] <== state_tree_data_raw[i];
    }

    component state_tree_valid = LeafExists(state_tree_depth);
    state_tree_valid.root <== state_tree_root;
    state_tree_valid.leaf <== existing_state_tree_leaf_hash.hash;
    for (var i = 0; i < state_tree_depth; i++) {
        state_tree_valid.path_elements[i] <== state_tree_path_elements[i];
        state_tree_valid.path_index[i] <== state_tree_path_index[i];
    }

    // Check 5. Verify the current vote weight exists in the user's
    // vote_option_tree_root index
    component vote_options_tree_valid = QuinLeafExists(vote_options_tree_depth);
    vote_options_tree_valid.root <== vote_options_tree_root;
    vote_options_tree_valid.leaf <== vote_options_leaf_raw;
    for (var i = 0; i < vote_options_tree_depth; i++) {
        for (var j = 0; j < VOTE_OPTION_TREE_PATH_ELEMENTS_LENGTH; j++) {
            vote_options_tree_valid.path_elements[i][j] <== vote_options_tree_path_elements[i][j];
        }
        vote_options_tree_valid.path_index[i] <== vote_options_tree_path_index[i];
    }

    // Update vote_option_tree_root with the newly updated vote weight
    component new_vote_options_tree = QuinTreeInclusionProof(vote_options_tree_depth);
    new_vote_options_tree.leaf <== decrypted_command.out[CMD_VOTE_WEIGHT_IDX];
    for (var i = 0; i < vote_options_tree_depth; i++) {
        for (var j = 0; j < VOTE_OPTION_TREE_PATH_ELEMENTS_LENGTH; j++) {
            new_vote_options_tree.path_elements[i][j] <== vote_options_tree_path_elements[i][j];
        }
        new_vote_options_tree.path_index[i] <== vote_options_tree_path_index[i];
    }
    new_vote_options_tree_root <== new_vote_options_tree.root;

    // Verify signature against existing public key
    component signature_verifier = VerifySignature7();

    signature_verifier.from_x <== state_tree_data_raw[STATE_TREE_PUBLIC_KEY_X_IDX]; // public key x
    signature_verifier.from_y <== state_tree_data_raw[STATE_TREE_PUBLIC_KEY_Y_IDX]; // public key y

    signature_verifier.R8x <== decrypted_command.out[CMD_SIG_R8X_IDX]; // sig R8x
    signature_verifier.R8y <== decrypted_command.out[CMD_SIG_R8Y_IDX]; // sig R8x
    signature_verifier.S <== decrypted_command.out[CMD_SIG_S_IDX]; // sig S

    for (var i = 0; i < MESSAGE_WITHOUT_SIGNATURE_LENGTH; i++) {
        signature_verifier.preimage[i] <== decrypted_command.out[i];
    }
    signature_verifier_valid <== signature_verifier.valid;
}


template UpdateStateTree(
    state_tree_depth,
    message_tree_depth,
    vote_options_tree_depth
) {
    // params:
    //    state_tree_depth: the depth of the state tree
    //    message_tree_depth: the depth of the message tree
    //    vote_options_tree_depth: depth of the vote tree

    // *************** BEGIN definitions ***************

    // Indices for convenience
    var CMD_STATE_TREE_INDEX_IDX = 0;
    var CMD_PUBLIC_KEY_X_IDX = 1;
    var CMD_PUBLIC_KEY_Y_IDX = 2;
    var CMD_VOTE_OPTION_INDEX_IDX = 3;
    var CMD_VOTE_WEIGHT_IDX = 4;
    var CMD_NONCE_IDX = 5;
    var CMD_SALT_IDX = 6;
    var CMD_SIG_R8X_IDX = 7;
    var CMD_SIG_R8Y_IDX = 8;
    var CMD_SIG_S_IDX = 9;

    // Output: New state tree root
    signal output root;

    // Input(s)
    signal input coordinator_public_key[2];

    // Note: a message is an encrypted command
    var MESSAGE_LENGTH = 11;
    var MESSAGE_SIGNATURE_LENGTH = 4;
    var MESSAGE_WITHOUT_SIGNATURE_LENGTH = MESSAGE_LENGTH - MESSAGE_SIGNATURE_LENGTH;
    /* let n = vote_options_tree_depth

       anything > 0 is encrypted

       [0]  - iv (generated when msg is encrypted)
       [1]  - state_tree_index
       [2]  - publickey_x
       [3]  - publickey_y
       [4]  - vote_option_index
       [5]  - vote_weight
       [6]  - nonce
       [7]  - salt
       [8]  - signature_r8x
       [9]  - signature_r8y
       [10] - signature_s
     */
    signal input message[MESSAGE_LENGTH];

    // Note: State tree data length is the command parsed, and then massaged to
    // fit the schema
    var STATE_TREE_PUBLIC_KEY_X_IDX = 0;
    var STATE_TREE_PUBLIC_KEY_Y_IDX = 1;
    var STATE_TREE_VOTE_OPTION_TREE_ROOT_IDX = 2;
    var STATE_TREE_VOICE_CREDIT_BALANCE_IDX = 3;
    var STATE_TREE_NONCE_IDX = 4;

    var STATE_TREE_DATA_LENGTH = 5;

    var STATE_TREE_BASE = 2;

    var VOTE_OPTION_TREE_BASE = 5;
    var VOTE_OPTION_TREE_PATH_ELEMENTS_LENGTH = VOTE_OPTION_TREE_BASE - 1;

    signal private input vote_options_leaf_raw;
    signal private input vote_options_tree_root;
    signal private input vote_options_tree_path_elements[vote_options_tree_depth][VOTE_OPTION_TREE_PATH_ELEMENTS_LENGTH];
    signal private input vote_options_tree_path_index[vote_options_tree_depth];
    signal input vote_options_max_leaf_index;

    // Message tree
    signal input msg_tree_root;
    signal input msg_tree_path_elements[message_tree_depth];
    signal input msg_tree_path_index[message_tree_depth];

    // State tree
    signal private input state_tree_data_raw[STATE_TREE_DATA_LENGTH];

    signal input state_tree_max_leaf_index;
    signal input state_tree_root;
    signal private input state_tree_path_elements[state_tree_depth];
    signal private input state_tree_path_index[state_tree_depth];

    // Shared keys
    signal private input ecdh_private_key;
    signal input ecdh_public_key[2];

    // Internal variables for passing between templates
    signal decrypted_command_out[MESSAGE_LENGTH - 1];
    signal new_vote_options_tree_root;
    signal signature_verifier_valid;

    var vote_options_max_leaves = VOTE_OPTION_TREE_BASE ** vote_options_tree_depth;
    var state_tree_max_leaves = STATE_TREE_BASE ** state_tree_depth;

    // *************** END definitions ***************

    // *************** BEGIN perform checks before update ***************
    component perform_checks_before_update = PerformChecksBeforeUpdate(
        MESSAGE_LENGTH,
      	MESSAGE_WITHOUT_SIGNATURE_LENGTH,
        message_tree_depth,
        STATE_TREE_DATA_LENGTH,
        state_tree_depth,
        state_tree_max_leaves,
        vote_options_tree_depth,
        vote_options_max_leaves,
        CMD_VOTE_WEIGHT_IDX,
        STATE_TREE_PUBLIC_KEY_X_IDX,
        STATE_TREE_PUBLIC_KEY_Y_IDX,
        CMD_SIG_R8X_IDX,
        CMD_SIG_R8Y_IDX,
        CMD_SIG_S_IDX
    );

    perform_checks_before_update.vote_options_max_leaf_index <== vote_options_max_leaf_index;
    perform_checks_before_update.state_tree_max_leaf_index <== state_tree_max_leaf_index;

    perform_checks_before_update.ecdh_private_key <== ecdh_private_key;
    for (var i = 0; i < 2; i++) {
        perform_checks_before_update.coordinator_public_key[i] <== coordinator_public_key[i];
        perform_checks_before_update.ecdh_public_key[i] <== ecdh_public_key[i];
    }
    for (var i = 0; i < MESSAGE_LENGTH; i++) {
        perform_checks_before_update.message[i] <== message[i];
    }
    perform_checks_before_update.msg_tree_root <== msg_tree_root;
    for (var i = 0; i < message_tree_depth; i++) {
        perform_checks_before_update.msg_tree_path_elements[i] <== msg_tree_path_elements[i];
        perform_checks_before_update.msg_tree_path_index[i] <== msg_tree_path_index[i];
    }

    for (var i = 0; i < STATE_TREE_DATA_LENGTH; i++) {
        perform_checks_before_update.state_tree_data_raw[i] <== state_tree_data_raw[i];
    }
    perform_checks_before_update.state_tree_root <== state_tree_root;
    for (var i = 0; i < state_tree_depth; i++) {
        perform_checks_before_update.state_tree_path_elements[i] <== state_tree_path_elements[i];
        perform_checks_before_update.state_tree_path_index[i] <== state_tree_path_index[i];
    }

    perform_checks_before_update.vote_options_tree_root <== vote_options_tree_root;
    perform_checks_before_update.vote_options_leaf_raw <== vote_options_leaf_raw;
    for (var i = 0; i < vote_options_tree_depth; i++) {
        for (var j = 0; j < VOTE_OPTION_TREE_PATH_ELEMENTS_LENGTH; j++) {
            perform_checks_before_update.vote_options_tree_path_elements[i][j] <== vote_options_tree_path_elements[i][j];
        }
        perform_checks_before_update.vote_options_tree_path_index[i] <== vote_options_tree_path_index[i];
    }

    for (var i = 0; i < MESSAGE_LENGTH - 1; i++) {
        decrypted_command_out[i] <== perform_checks_before_update.decrypted_command_out[i];
    }
    new_vote_options_tree_root <== perform_checks_before_update.new_vote_options_tree_root;
    signature_verifier_valid <== perform_checks_before_update.signature_verifier_valid;

    // *************** END perform checks before update ***************

    // *************** BEGIN perform update ***************

    // Calculate the new voice credit balance
    signal vote_options_leaf_squared;
    vote_options_leaf_squared <== vote_options_leaf_raw *
                                  vote_options_leaf_raw;

    signal user_vote_weight_squared;
    user_vote_weight_squared <== decrypted_command_out[CMD_VOTE_WEIGHT_IDX] *
                                 decrypted_command_out[CMD_VOTE_WEIGHT_IDX];

    signal new_voice_credit_balance;
    new_voice_credit_balance <== state_tree_data_raw[STATE_TREE_VOICE_CREDIT_BALANCE_IDX] +
                                 vote_options_leaf_squared -
                                 user_vote_weight_squared;

    // Update the state leaf
    signal new_state_tree_data[STATE_TREE_DATA_LENGTH];
    new_state_tree_data[0] <== decrypted_command_out[CMD_PUBLIC_KEY_X_IDX];
    new_state_tree_data[1] <== decrypted_command_out[CMD_PUBLIC_KEY_Y_IDX];
    new_state_tree_data[2] <== new_vote_options_tree_root;
    new_state_tree_data[3] <== new_voice_credit_balance;
    new_state_tree_data[4] <== decrypted_command_out[CMD_NONCE_IDX];

    component new_state_tree_leaf = Hasher5();
    for (var i = 0; i < STATE_TREE_DATA_LENGTH; i++) {
        new_state_tree_leaf.in[i] <== new_state_tree_data[i];
    }

    // Checks to see if it's a valid update
    component valid_signature = IsEqual();
    valid_signature.in[0] <== signature_verifier_valid;
    valid_signature.in[1] <== 1;

    component sufficient_voice_credits = GreaterEqThan(32);
    sufficient_voice_credits.in[0] <== new_voice_credit_balance;
    sufficient_voice_credits.in[1] <== 0;

    component correct_nonce = IsEqual();
    correct_nonce.in[0] <== decrypted_command_out[CMD_NONCE_IDX];
    correct_nonce.in[1] <== state_tree_data_raw[STATE_TREE_NONCE_IDX] + 1;

    component valid_state_leaf_index = LessEqThan(32);
    valid_state_leaf_index.in[0] <== decrypted_command_out[CMD_STATE_TREE_INDEX_IDX];
    valid_state_leaf_index.in[1] <== state_tree_max_leaf_index;

    component valid_vote_options_leaf_index = LessEqThan(32);
    valid_vote_options_leaf_index.in[0] <== decrypted_command_out[CMD_VOTE_OPTION_INDEX_IDX];
    valid_vote_options_leaf_index.in[1] <== vote_options_max_leaf_index;

    // No-op if there's an invalid update
    component check_valid_update = CheckValidUpdate();
    check_valid_update.valid_signature <== valid_signature.out;
    check_valid_update.sufficient_voice_credits <== sufficient_voice_credits.out;
    check_valid_update.correct_nonce <== correct_nonce.out;
    check_valid_update.valid_state_leaf_index <== valid_state_leaf_index.out;
    check_valid_update.valid_vote_options_leaf_index <== valid_vote_options_leaf_index.out;

    // Compute the Merkle root of the new state tree
    component new_state_tree = MerkleTreeInclusionProof(state_tree_depth);
    new_state_tree.leaf <== new_state_tree_leaf.hash;
    for (var i = 0; i < state_tree_depth; i++) {
        new_state_tree.path_elements[i] <== state_tree_path_elements[i];
        new_state_tree.path_index[i] <== state_tree_path_index[i];
    }

    // Make sure selected_tree_hash exists in the tree
    component new_state_tree_valid = LeafExists(state_tree_depth);
    new_state_tree_valid.root <== new_state_tree.root;
    new_state_tree_valid.leaf <== new_state_tree_leaf.hash;
    for (var i = 0; i < state_tree_depth; i++) {
        new_state_tree_valid.path_elements[i] <== state_tree_path_elements[i];
        new_state_tree_valid.path_index[i] <== state_tree_path_index[i];
    }

    // The output root is the original state tree root if message is invalid,
    // and the new state tree root if it is valid
    component selected_state_tree_root = Mux1();
    selected_state_tree_root.c[0] <== state_tree_root;
    selected_state_tree_root.c[1] <== new_state_tree.root;
    selected_state_tree_root.s <== check_valid_update.out;

    root <== selected_state_tree_root.out;
    // *************** END perform update ***************
}
