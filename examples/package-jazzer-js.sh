#!/bin/sh

cd ..
npm install
npm run build
npm run build --workspace='@jazzer.js/fuzzer'

sed_version_and_mv() {
    while read data; do
        local no_version=$(echo $data | sed -r -f examples/remove-version.sed)
        echo "mv $data examples/$no_version"
        mv $data examples/$no_version
    done
}

npm pack --workspaces | sed_version_and_mv 

cd examples
for dir in */; do
  echo "--- Cleaning and rebuilding \"${dir}\" -----------------"
  cd "${dir}";
  if [ -f "package.json" ]; then
    npm install
  fi
  cd ..
done
