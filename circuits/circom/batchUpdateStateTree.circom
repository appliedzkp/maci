include "./trees/incrementalMerkleTree.circom"
include "./updateStateTree.circom";
include "../node_modules/circomlib/circuits/mux1.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

template BatchUpdateStateTree(
    state_tree_depth,
    message_tree_depth,
    vote_options_tree_depth,
    batch_size
) {
    // state_tree_depth: the depth of the state tree
    // message_tree_depth: the depth of the message tree
    // vote_options_tree_depth: depth of the vote tree
    // batch_size: the number of messages to process

    // The new state tree root
    signal output root;

    // The coordinator's public key
    signal input coordinator_public_key[2];

    var MESSAGE_LENGTH = 11;
    signal private input message[batch_size][MESSAGE_LENGTH];

    //  The vote option index's weight, which is an unhashed value
    signal private input vote_options_leaf_raw[batch_size];

    // The vote option tree root
    signal private input vote_options_tree_root[batch_size];
    signal private input vote_options_tree_path_elements[batch_size][vote_options_tree_depth][4];
    signal private input vote_options_tree_path_index[batch_size][vote_options_tree_depth];
    signal input vote_options_max_leaf_index;

    // Message tree
    signal input msg_tree_root;
    signal private input msg_tree_path_elements[batch_size][message_tree_depth];
    signal input msg_tree_batch_start_index;
    signal input msg_tree_batch_end_index;
    signal message_indices[batch_size];

    component msg_tree_path_index_selectors[batch_size];
    component msg_tree_path_index_comparators[batch_size];
    component msg_tree_path_index[batch_size];

    // Ensure that msg_tree_batch_start_index <= msg_tree_batch_end_index
    component msg_tree_index_checker = LessEqThan(32);
    msg_tree_index_checker.in[0] <== msg_tree_batch_start_index;
    msg_tree_index_checker.in[1] <== msg_tree_batch_end_index;
    msg_tree_index_checker.out === 1;

    for (var i = 0; i < batch_size; i++) {
        // Compare message_indices[i] and msg_tree_batch_end_index
        // if msg_tree_batch_end_index < message_indices[i], use msg_tree_batch_end_index
        // if msg_tree_batch_end_index >= message_indices[i], use message_indices[i]

        message_indices[i] <== msg_tree_batch_start_index + i;

        msg_tree_path_index_comparators[i] = LessThan(32);
        msg_tree_path_index_comparators[i].in[0] <== msg_tree_batch_end_index;
        msg_tree_path_index_comparators[i].in[1] <== message_indices[i];

        msg_tree_path_index_selectors[i] = Mux1();
        msg_tree_path_index_selectors[i].c[0] <== message_indices[i];
        msg_tree_path_index_selectors[i].c[1] <== msg_tree_batch_end_index;
        msg_tree_path_index_selectors[i].s <== msg_tree_path_index_comparators[i].out;

        msg_tree_path_index[i] = Num2Bits(message_tree_depth);
        msg_tree_path_index[i].in <== msg_tree_path_index_selectors[i].out;
    }

    // The random leaf
    signal private input random_leaf;
    signal private input random_leaf_path_elements[state_tree_depth];
    component random_leaf_path_index = Num2Bits(state_tree_depth);
    random_leaf_path_index.in <== 0;

    // The root after we insert the random leaf. This is the final root after
    // all commands have been processed.
    signal private input random_leaf_root;

    // State tree
    var state_tree_data_length = 5;
    signal input state_tree_max_leaf_index;
    signal input state_tree_root[batch_size];
    signal private input state_tree_path_elements[batch_size][state_tree_depth];
    signal private input state_tree_path_index[batch_size][state_tree_depth];
    signal private input state_tree_data_raw[batch_size][state_tree_data_length];

    // Shared keys
    signal private input ecdh_private_key;
    signal input ecdh_public_key[batch_size][2];

    component new_state_tree[batch_size];
    for (var i = 0; i < batch_size; i++) {
        new_state_tree[i] = UpdateStateTree(state_tree_depth, message_tree_depth, vote_options_tree_depth);

        // Public Key
        new_state_tree[i].coordinator_public_key[0] <== coordinator_public_key[0];
        new_state_tree[i].coordinator_public_key[1] <== coordinator_public_key[1];

        // Message
        for (var j = 0; j < MESSAGE_LENGTH; j++) {
            new_state_tree[i].message[j] <== message[i][j];
        }

        // Vote Options Tree
        new_state_tree[i].vote_options_leaf_raw <== vote_options_leaf_raw[i];
        new_state_tree[i].vote_options_tree_root <== vote_options_tree_root[i];
        for (var j = 0; j < vote_options_tree_depth; j++) {
            for (var k = 0; k < 4; k ++) {
                new_state_tree[i].vote_options_tree_path_elements[j][k] <== vote_options_tree_path_elements[i][j][k];
            }
            new_state_tree[i].vote_options_tree_path_index[j] <== vote_options_tree_path_index[i][j];
        }
        new_state_tree[i].vote_options_max_leaf_index <== vote_options_max_leaf_index;

        // Message Tree
        new_state_tree[i].msg_tree_root <== msg_tree_root;
        for (var j = 0; j < message_tree_depth; j++) {
            new_state_tree[i].msg_tree_path_elements[j] <== msg_tree_path_elements[i][j];
            new_state_tree[i].msg_tree_path_index[j] <== msg_tree_path_index[i].out[j];
        }

        // State Tree
        new_state_tree[i].state_tree_root <== state_tree_root[i];
        for (var j = 0; j < state_tree_data_length; j++) {
            new_state_tree[i].state_tree_data_raw[j] <== state_tree_data_raw[i][j];
        }
        for (var j = 0; j < state_tree_depth; j++) {
            new_state_tree[i].state_tree_path_elements[j] <== state_tree_path_elements[i][j];
            new_state_tree[i].state_tree_path_index[j] <== state_tree_path_index[i][j];
        }
        new_state_tree[i].state_tree_max_leaf_index <== state_tree_max_leaf_index;

        // Shared Keys
        new_state_tree[i].ecdh_private_key <== ecdh_private_key;

        new_state_tree[i].ecdh_public_key[0] <== ecdh_public_key[i][0];
        new_state_tree[i].ecdh_public_key[1] <== ecdh_public_key[i][1];
    }

    // Update random leaf at index 0
    component final_state_tree = MerkleTreeInclusionProof(state_tree_depth);
    final_state_tree.leaf <== random_leaf;
    for (var i = 0; i < state_tree_depth; i++) {
        final_state_tree.path_elements[i] <== random_leaf_path_elements[i];
        final_state_tree.path_index[i] <== random_leaf_path_index.out[i];
    }

    // Assert root calculations are valid
    for (var i = 0; i < batch_size - 1; i++) {
        new_state_tree[i].root === state_tree_root[i + 1];
    }
    new_state_tree[batch_size - 1].root === random_leaf_root;

    root <== final_state_tree.root;
}
