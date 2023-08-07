#!/bin/sh

cd ..
npm install
npm run build
npm run build --workspace='@jazzer.js/fuzzer'

sed_version_and_mv() {
    while read data; do
        local no_version=$(echo $data | sed -r -f end-to-end/remove-version.sed)
        echo "mv $data end-to-end/$no_version"
        mv $data end-to-end/$no_version
    done
}

npm pack --workspaces | sed_version_and_mv 
