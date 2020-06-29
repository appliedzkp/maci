include "../../node_modules/circomlib/circuits/mux1.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../hasherPoseidon.circom";
include "./calculateTotal.circom";
include "./checkRoot.circom";

// This file contains circuits for quintary Merkle tree verifcation.
// It assumes that each node contains 5 leaves, as we use the PoseidonT6
// circuit to hash leaves, which supports up to 5 input elements.

/*
Note: circom has some particularities which limit the code patterns we can use.

- You can only assign a value to a signal once.
- A component's input signal must only be wired to another component's output
  signal.
- Variables can store linear combinations, and can also be used for loops,
  declaring sizes of things, and anything that is not related to inputs of a
  circuit.
- The compiler fails whenever you try to mix invalid elements.
- You can't use a signal as a list index.
*/


/*
 * Given a list of items and an index, output the item at the position denoted
 * by the index. The number of items must be less than 8, and the index must
 * be less than the number of items.
 */
template QuinSelector(choices) {
    signal input in[choices];
    signal input index;
    signal output out;
    
    // Ensure that index < choices
    component lessThan = LessThan(3);
    lessThan.in[0] <== index;
    lessThan.in[1] <== choices;
    lessThan.out === 1;

    component calcTotal = CalculateTotal(choices);
    component eqs[choices];

    // For each item, check whether its index equals the input index.
    for (var i = 0; i < choices; i ++) {
        eqs[i] = IsEqual();
        eqs[i].in[0] <== i;
        eqs[i].in[1] <== index;

        // eqs[i].out is 1 if the index matches. As such, at most one input to
        // calcTotal is not 0.
        calcTotal.nums[i] <== eqs[i].out * in[i];
    }

    // Returns 0 + 0 + 0 + item
    out <== calcTotal.sum;
}

/*
 * The output array contains the input items, with the the leaf inserted at the
 * specified index. For example, if input = [0, 20, 30, 40], index = 3, and
 * leaf = 10, the output will be [0, 20, 30, 10, 40].
 */
template Splicer(numItems) {
    // Since we only insert one item, the number of output items is 1 +
    // numItems
    var NUM_OUTPUT_ITEMS = numItems + 1;

    signal input in[numItems];
    signal input leaf;
    signal input index;
    signal output out[NUM_OUTPUT_ITEMS];

    component greaterThan[NUM_OUTPUT_ITEMS];
    component isLeafIndex[NUM_OUTPUT_ITEMS];
    component quinSelectors[NUM_OUTPUT_ITEMS];
    component muxes[NUM_OUTPUT_ITEMS];

    var i;
    var j;
    /*
        There is a loop where the goal is to assign values to the output
        signal.

        | output[0] | output[1] | output[2] | ...

        We can either assign the leaf, or an item from the `items` signal, to
        the output. We use this using Mux1(). Mux1's selector is 0 or 1
        depending on whether the index is equal to the loop counter.

        i --> [IsEqual] <-- index
                    |
                    v
        leaf ---> [Mux1] <--- <item from in>
                    |
                    v
                output[m]

        To obtain the value from <item from in>, we need to compute an item
        index (let it be `s`).

        1. if index = 2 and i = 0, then s = 0
        2. if index = 2 and i = 1, then s = 1
        3. if index = 2 and i = 2, then s = 2
        4. if index = 2 and i = 3, then s = 2
        5. if index = 2 and i = 4, then s = 3

        We then wire `s`, as well as each item in `in` to a QuinSelector.
        The output signal from the QuinSelector is <item from in> and gets
        wired to Mux1 (as above).
    */
    for (i = 0; i < numItems + 1; i ++) {
        // greaterThen[i].out will be 1 if the i is greater than the index
        greaterThan[i] = GreaterThan(3);
        greaterThan[i].in[0] <== i;
        greaterThan[i].in[1] <== index;

        quinSelectors[i] = QuinSelector(numItems + 1);

        // Select the value from `in` at index i - greaterThan[i].out.
        // e.g. if index = 2 and i = 1, greaterThan[i].out = 0, so 1 - 0 = 0
        // but if index = 2 and i = 3, greaterThan[i].out = 1, so 3 - 1 = 2
        quinSelectors[i].index <== i - greaterThan[i].out;

        for (j = 0; j < numItems; j ++) {
            quinSelectors[i].in[j] <== in[j];
        }
        quinSelectors[i].in[numItems] <== 0;

        isLeafIndex[i] = IsEqual();
        isLeafIndex[i].in[0] <== index;
        isLeafIndex[i].in[1] <== i;

        muxes[i] = Mux1();
        muxes[i].s <== isLeafIndex[i].out;
        muxes[i].c[0] <== quinSelectors[i].out;
        muxes[i].c[1] <== leaf;

        out[i] <== muxes[i].out;
    }
}

template QuinTreeInclusionProof(levels) {
    // Each node has 5 leaves
    var LEAVES_PER_NODE = 5;
    var LEAVES_PER_PATH_LEVEL = LEAVES_PER_NODE - 1;

    signal input leaf;
    signal input path_index[levels];
    signal input path_elements[levels][LEAVES_PER_PATH_LEVEL];
    signal output root;

    var i;
    var j;

    component hashers[levels];
    component splicers[levels];

    // Hash the first level of path_elements
    splicers[0] = Splicer(LEAVES_PER_PATH_LEVEL);
    hashers[0] = Hasher5();
    splicers[0].index <== path_index[0];
    splicers[0].leaf <== leaf;
    for (i = 0; i < LEAVES_PER_PATH_LEVEL; i++) {
        splicers[0].in[i] <== path_elements[0][i];
    }

    for (i = 0; i < LEAVES_PER_NODE; i++) {
        hashers[0].in[i] <== splicers[0].out[i];
    }

    // Hash each level of path_elements

    for (i = 1; i < levels; i++) {
        splicers[i] = Splicer(LEAVES_PER_PATH_LEVEL);
        splicers[i].index <== path_index[i];
        splicers[i].leaf <== hashers[i - 1].hash;
        for (j = 0; j < LEAVES_PER_PATH_LEVEL; j ++) {
            splicers[i].in[j] <== path_elements[i][j];
        }

        hashers[i] = Hasher5();
        for (j = 0; j < LEAVES_PER_NODE; j ++) {
            hashers[i].in[j] <== splicers[i].out[j];
        }
    }
    
    root <== hashers[levels - 1].hash;
}

template QuinLeafExists(levels){
    // Ensures that a leaf exists within a quintree with given `root`

    var LEAVES_PER_NODE = 5;
    var LEAVES_PER_PATH_LEVEL = LEAVES_PER_NODE - 1;

    var i;
    var j;

    signal input leaf;
    signal input path_elements[levels][LEAVES_PER_PATH_LEVEL];
    signal input path_index[levels];
    signal input root;

    // Verify the Merkle path
    component verifier = QuinTreeInclusionProof(levels);
    verifier.leaf <== leaf;
    for (i = 0; i < levels; i ++) {
        verifier.path_index[i] <== path_index[i];
        for (j = 0; j < LEAVES_PER_PATH_LEVEL; j ++) {
            verifier.path_elements[i][j] <== path_elements[i][j];
        }
    }

    root === verifier.root;
}

/*
 * Given a tree index, generate the indices which QuinTreeInclusionProof and
 * QuinLeafExists require. e.g. if the index is 30 and the number of levels is
 * 4, the output should be [1, 1, 0, 0]
 */
template QuinGeneratePathIndices(levels) {
    var BASE = 5;
    signal input in; 
    signal output out[levels];

    var m = in;
    signal n[levels + 1];
    for (var i = 0; i < levels; i ++) {
        // circom's best practices state that we should avoid using <-- unless
        // we know what we are doing. But this is the only way to perform the
        // modulo operation.

        n[i] = m;
        
        out[i] <-- m % BASE;

        m = m \ BASE;
    }

    n[levels] = m;

    // Do a range check on each out[i]
    for (var i = 1; i < levels + 1; i ++) {
        n[i - 1] === n[i] * BASE + out[i-1];
    }
    
    component leq[levels];
    var sum = 0;
    for (var i = 0; i < levels; i ++) {
        // Check that each output element is less than the base
        leq[i] = LessThan(3);
        leq[i].in[0] <== out[i];
        leq[i].in[1] <== BASE;
        leq[i].out === 1;

        // Re-compute the total sum
        sum += out[i] * BASE ** i;
    }
    
    // Check that the total sum matches the index
    sum === in;
}
