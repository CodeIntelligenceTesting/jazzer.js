# @jazzer.js/instrumentor

The `@jazzer.js/instrumentor` module is used to instrument code for fuzzing.

It provides and registers [Babel](https://babeljs.io/) plugins to transform code
in such a way that it provides feedback to the fuzzer. This feedback consists of
coverage statistics, so that the fuzzer can detect when new code paths are
reached, and comparison feedback, to enable the fuzzer to mutate it's input in a
meaningful way.

CJS modules are intercepted using
[istanbul-lib-hook](https://github.com/istanbuljs/istanbuljs/tree/master/packages/istanbul-lib-hook).
ES modules are intercepted via a Node.js loader hook (`module.register`,
requires Node >= 20.6).

## Install

Using npm:

```sh
npm install --save-dev @jazzer.js/instrumentor
```

## Documentation

See
[Jazzer.js README](https://github.com/CodeIntelligenceTesting/jazzer.js#readme)
for more information.
