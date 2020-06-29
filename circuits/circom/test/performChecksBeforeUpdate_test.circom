include "../updateStateTree.circom"

// message_length
// message_without_signature_length
// message_tree_depth
// state_tree_data_length
// state_tree_depth
// state_tree_max_leaves
// vote_options_tree_depth
// vote_options_max_leaves
// CMD_VOTE_WEIGHT_IDX
// STATE_TREE_PUBLIC_KEY_X_IDX
// STATE_TREE_PUBLIC_KEY_Y_IDX
// CMD_SIG_R8X_IDX
// CMD_SIG_R8Y_IDX
// CMD_SIG_S_IDX


component main = PerformChecksBeforeUpdate(11, 7, 4, 5, 4, 15, 2, 15, 4, 0, 1, 7, 8, 9);
