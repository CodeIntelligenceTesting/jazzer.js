#!/bin/sh
set -e

for dir in */; do
  echo "--- Executing example in \"${dir}\" -----------------"
  cd "${dir}";
  if [ -f "package.json" ]; then
    npm install
    npm run dryRun
  fi
  cd ..
done
