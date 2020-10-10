#!/bin/bash
set -o pipefail

cd "$(dirname "$0")"
cd ..

# Delete old files
rm -rf ./compiled/*

echo 'Downloading solc...'
solcBin=$(pwd)/solc
wget -nc -q -O $solcBin https://github.com/ethereum/solidity/releases/download/v0.7.2/solc-static-linux
chmod a+x $solcBin

paths="$(pwd)/sol/,$(pwd)/node_modules/@openzeppelin/"
oz_map="@openzeppelin/=$(pwd)/node_modules/@openzeppelin/"

echo 'Building contracts'
# TODO: remove --bin-runtime ?
$solcBin $oz_map -o ./compiled \
    ./sol/*.sol \
    ./sol/**/*.sol \
    ./sol/**/**/*.sol \
    --overwrite --optimize --bin --abi --bin-runtime --allow-paths=$paths

# Build the Poseidon contract from bytecode
node build/buildPoseidon.js
