#!/bin/bash
set -e

cd "$(dirname "$0")"
cd ..

# The nothing-up-my-sleeve value
maciNums="8370432830353022751713833565135785980866757267633941821328460903436894336785"

# Binary tree with zero = 0
node build/genZeroesContract.js \
    MerkleBinary0 0 2 33 "Binary tree zeroes (0)" \
    > sol/trees/zeroes/MerkleBinary0.sol

# Binary tree with zero = maciNums
node build/genZeroesContract.js \
    MerkleBinaryMaci $maciNums 2 33 "Binary tree zeroes (Keccack hash of 'Maci')" \
    > sol/trees/zeroes/MerkleBinaryMaci.sol

# Quinary tree with zero = 0
node build/genZeroesContract.js \
    MerkleQuinary0 0 5 33 "Quinary tree zeroes (0)" \
    > sol/trees/zeroes/MerkleQuinary0.sol

# Quinary tree with zero = maciNums
node build/genZeroesContract.js \
    MerkleQuinaryMaci $maciNums 5 33 "Quinary tree zeroes (Keccack hash of 'Maci')" \
    > sol/trees/zeroes/MerkleQuinaryMaci.sol
