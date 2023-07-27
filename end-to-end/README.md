# Jazzer End to End Canary Test

This is the code from `examples/jest_typescript_integration` with a single
change to `package.json`: the `@jazzer.js/jest-runner` dependency is now set to
version `*`. This project is meant to be run in our release pipeline after the
release has been created to do a final check to make sure that nothing is broken
in our packaging.

The Typescript integration example was chosen as that should exercise more of
jazzer.js than the other examples.
