#!/bin/bash

set -e

cd "$(dirname "$0")"
cd ..
mkdir -p build

node build/buildSnarks.js -i circom/prod/quadVoteTally.circom -j build/qvtCircuit.json -p build/qvtPk.bin -v build/qvtVk.json -s build/QuadVoteTallyVerifier.sol -vs QuadVoteTallyVerifier -m build/qvt.params

echo 'Copying QuadVoteTallyVerifier.sol to contracts/sol.'
cp ./build/QuadVoteTallyVerifier.sol ../contracts/sol/
