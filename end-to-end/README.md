# Jazzer End to End Canary Test

This is the code from `examples/jest_typescript_integration` with a single
change to `package.json`: the Jazzer.js dependencies now come from
`jazzer-js-<package name>.tgz` files in this directory. These can be created by
running `./package-jazzer-js.sh` which will call `npm pack` on the Jazzer
packages so that we can test for any packaging errors.

The Typescript integration example was chosen as that should exercise more of
jazzer.js than the other examples.

## Running Locally

```bash
rm -rf node_modules package-lock.json *.tgz
./package-jazzer-js.sh
npm install --prefer-online --save-dev *.tgz
npx jest
```

_Note_: running just `npm install` may result in caching issues where the
contents of the tarballs in this directory are ignored and older versions from
the cache are used instead. `--prefer-online` forces npm to check for updated
files, which could cause hash mismatches compared to `package-lock.json`. Hence,
remove `package-lock.json` and other dependencies before running the tests.
