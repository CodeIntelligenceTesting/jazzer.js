#!/bin/sh
set -e

command=${1:-dryRun}

for dir in */; do
  echo "--- Executing example in \"${dir}\" -----------------"
  cd "${dir}";
  if [ -f "package.json" ]; then
    npm install
    npm run "$command"
  fi
  cd ..
done
