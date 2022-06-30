# Development

## Dependencies

Jazzer.js has the following dependencies when being built from source:

- [Node.js 14](https://nodejs.org/)
- [NPM 7.0](https://www.npmjs.com/)
- [cmake-js](https://github.com/cmake-js/cmake-js) dependencies
  - [CMake v7.0.0](https://cmake.org/download/)
  - C/C++ compiler toolchain of the used platform
    - See cmake-js
      [installation documentation](https://github.com/cmake-js/cmake-js#installation)

## Build

To build the project execute `install` in the root directory.

```shell
npm install
```

This takes care of downloading all dependencies, compiling the TypeScript code
and building libFuzzer via `cmake-js`.

## Test

All tests can be executed via the `test:all` npm script in the root directory.

```shell
npm run test:all
```

This executes all [Jest](https://jestjs.io/) unit tests and also all `test`
scripts in the workspaces.

**Note**: Please make sure to provide test cases for all code changes.

## Format and lint

All code has to satisfy the format and linting rules. This is enforced through a
git pre-commit hook. The `format` npm script in the root directory runs the
appropriate checks.

```shell
npm run format
```

## Structure

Jazzer.js is mostly developed using
[TypeScript](https://www.typescriptlang.org), for example higher-level parts and
the code instrumentation. The lower-lever Node.js addon providing the libFuzzer
integration is created using [C++](https://cplusplus.com).

TypeScript is globally set up on root level and compiled into `dist` folders in
the individual workspaces. On the other hand C++ is only used in the `fuzzer`
workspace and compiled using `cmake-js`. More information on that part can be
found in the [workspace readme](../packages/fuzzer/README.md).
