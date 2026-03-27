# @jazzer.js/fuzzer

This module provides a native Node.js addon which loads libfuzzer into Node.js.
Users can install it with `npm install`, which tries to download a prebuilt
shared object from GitHub but falls back to compilation on the user's machine if
there is no suitable binary.

Loading the addon initializes libFuzzer and the sanitizer runtime. Users can
then start the fuzzer with the exported `startFuzzing` or `startFuzzingAsync`
functions; see [the test](fuzzer.test.ts) for an example. In sync mode
(`--sync`), the fuzzer runs on the main thread and blocks the event loop. In the
default async mode, libFuzzer runs on a separate native thread and communicates
with the JS event loop via a thread-safe function.

## Development

The project can be built with `npm run build` (which is incremental after the
first build); a subsequent `npm test` makes sure that the addon loads cleanly.
Binaries can be prebuilt with `npm run prebuild` and uploaded with
`npm run prebuild -- --upload`. Please format the code with `clang-format` (or
use the format functionality of `clangd`).

Internally, the build system uses several steps:

1. `package.json` defines the `npm` scripts.
2. Several of them use `prebuild` or `prebuild-install`; together, those two
   tools implement a binary cache via GitHub releases, so that users don't have
   to build the code themselves.
3. We run `prebuild` with the `cmake-js` backend, which makes it call `cmake-js`
   to build the code when necessary.
4. `cmake-js` is a wrapper around CMake; it expects CMake and the C++ toolchain
   to exist on the machine already.
5. In our CMake configuration, we set up compiler-rt as an external project;
   CMake fetches and builds it before compiling our own code against it.

To debug build issues, it's often useful to start with a plain
`cmake-js compile` or `cmake-js recompile`, which just invokes CMake with a few
extra arguments that help it find the Node.js headers and such.

When working on the addon's C++ code, you may want to use a language server like
`clangd` for IDE features. CMake is configured to emit a `compile_commands.json`
file, so the language server should work after the first `npm install`.
