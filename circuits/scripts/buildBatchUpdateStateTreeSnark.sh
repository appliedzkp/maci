#!/bin/bash

set -e

cd "$(dirname "$0")"
cd ..
mkdir -p build

node build/buildSnarks.js -i circom/prod/batchUpdateStateTreeVerifier.circom -j build/batchUstCircuit.json -p build/batchUstPk.json -v build/batchUstVk.json -s build/BatchUpdateStateTreeVerifier.sol -vs BatchUpdateStateTreeVerifier -m build/batchUst.params

echo 'Copying BatchUpdateStateTreeVerifier.sol to contracts/sol.'
cp ./build/BatchUpdateStateTreeVerifier.sol ../contracts/sol/
