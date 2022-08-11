#!/bin/sh
set -e

for dir in $(ls -d */); do
  cd "${dir}";
  npm install
  npm run dryRun
  cd ..
done
