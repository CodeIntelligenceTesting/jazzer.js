# Development

## Dependencies

Jazzer.js has the following dependencies when built from source:

- [Node.js 16](https://nodejs.org/)
- [NPM 7.0](https://www.npmjs.com/)
- [cmake-js](https://github.com/cmake-js/cmake-js) dependencies
  - [CMake](https://cmake.org/download/) version 3.10 or later
  - C/C++ compiler toolchain of the used platform
    - See cmake-js
      [installation documentation](https://github.com/cmake-js/cmake-js#installation)

## Build

To build the project execute `install` and `build` in the root directory.

```shell
npm install
npm run build
```

This takes care of downloading all dependencies, compiling the TypeScript code
and building libFuzzer via `cmake-js`.

## Test

All tests can be executed via the `test` npm script in the root directory.
Please make sure that you build the newest version with the commands mentioned
above.

```shell
npm run test
```

This executes all [Jest](https://jestjs.io/) unit tests and also all `test`
scripts in the workspaces, plus a `dryRun` of all example projects.

**Note**: Please make sure to provide test cases for all code changes.

## Format and lint

All code and documentation have to satisfy format and linting rules. This is
enforced through a git pre-commit hook. The `check` npm script in the root
directory runs the appropriate checks.

```shell
npm run check
```

`fix` will try to resolve found issues automatically for you.

```shell
npm run fix
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
