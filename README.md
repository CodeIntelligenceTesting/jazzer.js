<div style="text-align: center;">
<img src="https://7466322.fs1.hubspotusercontent-na1.net/hubfs/7466322/Logos/CI%20Logos/Jazzer.js%20logo.png" height=150px alt="Jazzer.js logo">
</div>

# Jazzer.js

[![NPM](https://img.shields.io/npm/v/@jazzer.js/core)](https://img.shields.io/npm/v/@jazzer.js/core)
![GitHub Actions](https://github.com/CodeIntelligenceTesting/jazzer.js/workflows/Tests/badge.svg)

Jazzer.js is a coverage-guided, in-process fuzzer for the
[Node.js](https://nodejs.org) platform developed by
[Code Intelligence](https://www.code-intelligence.com). It is based on
[libFuzzer](https://llvm.org/docs/LibFuzzer.html) and brings many of its
instrumentation-powered mutation features to the JavaScript ecosystem.

Jazzer.js currently supports the following platforms:

- Linux x86_64
- macOS x86_64 and arm64
- Windows x86_64

## Quickstart

To use Jazzer.js in your own project follow these few simple steps:

1. Add the `@jazzer.js/core` dev-dependency

   ```shell
   npm install --save-dev @jazzer.js/core
   ```

2. Create a fuzz target invoking your code

   ```js
   // file "FuzzTarget.js"
   module.exports.fuzz = function (data /*: Buffer */) {
   	const fuzzerData = data.toString();
   	myAwesomeCode(fuzzerData);
   };
   ```

3. Start the fuzzer using the fuzz target

   ```shell
   npx jazzer FuzzTarget
   ```

4. Enjoy fuzzing!

## Usage

### Creating a fuzz target

Jazzer.js requires an entry point for the fuzzer, this is commonly referred to
as fuzz target. A simple example is shown below.

```js
module.exports.fuzz = function (data) {
	myAwesomeCode(data.toString());
};
```

A fuzz target module needs to export a function called `fuzz`, which takes a
`Buffer` parameter and executes the actual code under test.

The `Buffer`, a subclass of `Uint8Array`, can be used to create needed
parameters for the actual code under test, so that the fuzzer can detect the
usage of parts of the input and mutate them in the next iterations to reach new
code paths. In this use-case `Buffer` is not the nicest abstraction to work with
and will be replaced with a more suitable one in the future. An example on how
to use the `data` parameter is shown below, documentation on `Buffer` can be
found in the Node.js
[documentation](https://nodejs.org/docs/latest-v14.x/api/buffer.html).

```js
module.exports.fuzz = function (data) {
	const intParam = data.readInt32BE(0);
	const stringParam = data.toString("utf-8", 4);
	myAwesomeCode(intParam, stringParam);
};
```

#### Asynchronous fuzz targets

Jazzer.js supports asynchronous fuzz targets out of the box, no special handling
or configuration is needed.

The resolution of a `Promise` returned by a fuzz target is awaited before the
next fuzzing input is provided. This enables the fuzzing of `async`/`await`,
`Promise` and callback based code.

Asynchronous code needs careful synchronization between the
[Node.js Event Loop](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/)
and the fuzzing thread, hence provides a lower throughput compared to
synchronous fuzzing. Even so, asynchronous fuzzing is the default mode of
Jazzer.js due to its prevalence in the JavaScript ecosystem and because it works
for all fuzz targets.

Solely synchronous code can participate in the enhanced performance of
synchronous fuzzing by setting the `--sync` flag when starting the fuzzer.

An example of a `Promise` based fuzz target can be found at
[examples/promise/fuzz.js](examples/promise/fuzz.js).

#### Using TypeScript to write fuzz targets

It is also possible to use [TypeScript](https://www.typescriptlang.org), or in
that matter any other language transpiling to JavaScript, to write fuzz targets,
as long as a modules exporting a `fuzz` function is generated.

An example on how to use TypeScript to fuzz a library can be found at
[examples/js-yaml/package.json](examples/js-yaml/package.json).

### Running the fuzzer

After adding `@jazzer.js/core` as dev-dependency to a project the fuzzer can be
executed using the `jazzer` npm command. To do so use `npx`:

```shell
npx jazzer <fuzzer parameters>
```

Or add a new script to your `package.json`:

```json
"scripts": {
"fuzz": "jazzer <fuzzer parameters>"
}
```

The general command format is:

```text
jazzer <fuzzTarget> <fuzzerFlags> [corpus...] [-- <fuzzingEngineFlags>]
```

Detailed documentation and some example calls are available using the `--help`
flag, so that only the most important ones are discussed here.

| Parameter                                                               | Description                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<fuzzTarget>`                                                          | Import path to the fuzz target module.                                                                                                                                                                                                                                                                   |
| `[corpus...]`                                                           | Paths to the corpus directories. If not given, no initial seeds are used nor interesting inputs saved.                                                                                                                                                                                                   |
| `-- <fuzzingEngineFlags>`                                               | Parameters after `--` are forwarded to the internal fuzzing engine (`libFuzzer`). Available settings can be found in its [options documentation](https://www.llvm.org/docs/LibFuzzer.html#options).                                                                                                      |
| `-i`, `--instrumentation_includes` / `-e`, `--instrumentation_excludes` | Part of filepath names to include/exclude in the instrumentation. A tailing `/` should be used to include directories and prevent confusion with filenames. `*` can be used to include all files. Can be specified multiple times. Default will include everything outside the `node_modules` directory. |
| `--sync`                                                                | Enables synchronous fuzzing. **May only be used for entirely synchronous code**.                                                                                                                                                                                                                         |
| `--help`                                                                | Detailed help message containing all flags.                                                                                                                                                                                                                                                              |

## Documentation

Further documentation is available at [docs/readme.md](docs/README.md).

### Demo Video - Introduction to Jazzer.js

We recorded a live demo in which shows how to get Jazzer.js up and running for
your own projects. If you are just getting started, this might be helpful.

You can watch the recording
[here](https://youtu.be/KyIhxEiNnfc).

## Credit

Jazzer.js is inspired by its namesake
[Jazzer](https://github.com/CodeIntelligenceTesting/jazzer), also developed by
[Code Intelligence](https://www.code-intelligence.com).

<p align="center">
<a href="https://www.code-intelligence.com"><img src="https://www.code-intelligence.com/hubfs/Logos/CI%20Logos/CI_Header_GitHub_quer.jpeg" height=50px alt="Code Intelligence logo"></a>
</p>
