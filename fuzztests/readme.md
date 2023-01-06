# Internal fuzz tests

**Note**: These are only internal tests and not intended as examples.

This directory contains fuzz tests created via the Jest integration that test
internal Jazzer.js functionality.

## Config

General fuzz test configuration is done via `.jazzerjsrc`

## Execution

Use the provided script `runFuzzTests` to execute all tests in the `fuzztests`
directory. Pass in `async` as first argument to start all tests in parallel. To
change the working dir, pass in the target directory as second parameter.

**Sync:**

```shell
./runFuzzTests.js
```

**Async:**

```shell
./runFuzzTests.js async
```

**Other dir:**

```shell
./runFuzzTests.js async otherDirectory
```
