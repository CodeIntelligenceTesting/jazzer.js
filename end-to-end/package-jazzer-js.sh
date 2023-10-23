#!/opt/homebrew/bin/bash
set -e

main() {
    cd ..
    npm install
    npm run build
    npm run build --workspace='@jazzer.js/fuzzer'
    npm run prepack --workspace='@jazzer.js/fuzzer'

    local tarballs=$(npm pack --workspaces)
    echo "$tarballs"
    echo "$tarballs" | sed_version_and_mv 
}

sed_version_and_mv() {
    while read data; do
        if [[ -n "$data" ]]; then
            local no_version=$(echo $data | sed -r -f end-to-end/remove-version.sed)
            echo "mv $data end-to-end/$no_version"
            mv $data end-to-end/$no_version
        else
            echo "received empty line"
        fi
    done
}

main