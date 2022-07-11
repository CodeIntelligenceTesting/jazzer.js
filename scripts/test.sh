#!/bin/bash
set -e

echo "Running jest tests"
npm run test

echo "Transpile TypeScript files"
npm run compile

echo "Building the native fuzzer addon"
npm run compile --workspace=packages/fuzzer

echo "Running addon tests"
npm run test --workspace=packages/fuzzer
