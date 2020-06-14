include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * This circuit does a few things:
 * 1. Check whether the `packedLeaf` input is within range
 * 2. Compute the `pos` and `neg` outputs
 * 3. Outputs `out` as 1 if `pos` and `neg` are valid *and* `packedLeaf` is in
 * range, and 0 otherwise.
 * The reason that this circuit does not establish constraints on the above
 * checks is because updateStateTree.circom needs to do a no-op if the
 * `packedLeaf` value is invalid, or else an attacker could DOS the system.
 */
template ValidPackedVoteLeaf() {
    var VOTE_LEAF_BITS_PER_VAL = 124;
    var MAX_PACKED_LEAF = 2 ** (2 * VOTE_LEAF_BITS_PER_VAL);

    signal input packedLeaf;
    signal output pos;
    signal output neg;
    signal output out;

    // Range-check packedLeaf
    component rangeChecker = LessThan(248);
    rangeChecker.in[0] <== packedLeaf;
    rangeChecker.in[1] <== MAX_PACKED_LEAF;

    // Convert a packed VoteLeaf into its positive and negative components. We
    // encode 0x80 positive votes and 0x0100 negative votes as such:
    // 0x800000000000000000000000000000100
    signal p;
    signal n;

    // Set p to the packedLeaf value shifted right by 124 bits
    p <-- packedLeaf >> VOTE_LEAF_BITS_PER_VAL;

    // Set n to the packedLeaf value mod 2 ** 124
    var POW = 2 ** VOTE_LEAF_BITS_PER_VAL;
    n <-- packedLeaf % POW;

    component eqChecker = IsEqual();
    eqChecker.in[0] <== packedLeaf;
    eqChecker.in[1] <== p * POW + n;

    component finalChecker = IsEqual();
    finalChecker.in[0] <== rangeChecker.out + eqChecker.out;
    finalChecker.in[1] <== 2;

    out <== finalChecker.out;
    pos <== p;
    neg <== n;
}

/*
 * Convert a packed VoteLeaf into its positive and negative components.
 * We encode 0x80 positive votes and 0x0100 negative votes as
 * such:
 * 0x800000000000000000000000000000100
 */
template UnpackVoteLeaf() {
	signal input packedLeaf;
	signal output pos;
	signal output neg;

	var VOTE_LEAF_BITS_PER_VAL = 124;
	var MAX_PACKED_LEAF = 2 ** (VOTE_LEAF_BITS_PER_VAL * 2);

	// Range-check packedLeaf
	component rangeChecker = LessEqThan(255);
	rangeChecker.in[0] <== packedLeaf;
	rangeChecker.in[1] <== MAX_PACKED_LEAF;
	rangeChecker.out === 1;

	signal p;
	signal n;

	// Set p to the packedLeaf value shifted right by 124 bits
	p <-- packedLeaf >> VOTE_LEAF_BITS_PER_VAL;

	var POW = 2 ** VOTE_LEAF_BITS_PER_VAL;
	// Set n to the packedLeaf value mod 2 ** 124
	n <-- packedLeaf % POW;

	// Pack p and n and check that they match packedLeaf
	packedLeaf === p * POW + n;

	// Wire p and n to the outputs
	pos <== p;
	neg <== n;
}

template CalculateSquaredVoteLeaf() {
    signal input packedLeaf;
    signal output squared;

    component unpacker = UnpackVoteLeaf();
    unpacker.packedLeaf <== packedLeaf;

    signal pos;
    signal neg;

    pos <== unpacker.pos;
    neg <== unpacker.neg;

    squared <== (pos + neg) * (pos + neg);
}
