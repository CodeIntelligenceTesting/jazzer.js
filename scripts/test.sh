#!/bin/bash
set -e

echo "Running jest tests"
npm run test

echo "Building the native fuzzer addon"
#npm run compile --workspace=packages/fuzzer
cd packages/fuzzer
npm install
npm run compile

echo "Running addon tests"
#npm run test --workspace=packages/fuzzer
npm run test
