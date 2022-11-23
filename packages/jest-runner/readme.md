# Jest Fuzz Runner

Custom runner that executes fuzz tests in regression or fuzzing mode. This
package also augments the available [Jest](https://jestjs.io/) test functions
with a `fuzz` extension.

## Idea

- Define a custom runner that execute fuzz tests, `it.fuzz`, in regression or
  fuzzing mode.
- Registers our instrumentation during startup to instrument code (both cases)
- Registers own implementations of global test functions, like `test` and `it`,
  which register functions to execute when the fuzz test module is loaded
- Executes the registered functions in one of the modes and reports the
  `TestResult`s back to Jest
- In regression mode:
  - Uses an input dir located besides the tests to load seed files
- In fuzzing mode:
  - Provides a custom fuzz target function which is called by the fuzzer and
    passes input to the actual fuzz test

## How a test is executed

1. "jest" exported in "packages/jest-cli", calls "run" from same package
2. Calls "runCLI" from "packages/jest-core/cli"
3. Calls "runJest' from "packages/jest-core"
4. Loads all tests form FS
5. Calls "scheduleTests" from "packages/jest-core" "TestScheduler"
6. Transforms module (?what does it do?)
7. Executes test file with runner
8. Runner provides feedback via events ("test-file-start", "test-file-success",
   "test-case-result", ...) or callbacks
9. "TestRunner" from "packages/jest-runner" "index" implements "runTests"
10. Executes "runTestInternal" of "packages/jest-runner" "runTests"
11. Uses "jestAdapter" of
    "packages/jest-circus/src/legacy-code-todo-rewrite/jestAdapter" to execute
    test (or jasmine for old configs)

## Useful links

- [Light Runner](https://github.com/nicolo-ribaudo/jest-light-runner)  
  Light weight `jest-circus` runner. Our runner could use a similar approach.
- [Create Jest Runner](https://github.com/jest-community/create-jest-runner)  
  Wrapper to create test runners, probably not powerful enough
- [Test Result Type](https://github.com/facebook/jest/blob/main/packages/jest-types/src/TestResult.ts)
- [Jest each](https://github.com/facebook/jest/tree/main/packages/jest-each)  
  The fuzz extension works similar to `each`.
- [VS Code Jest extension](https://github.com/jest-community/vscode-jest)  
  This extension can be used to investigate how the IDE integration of Jest
  tests work.
