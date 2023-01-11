# Fuzzing using fuzz targets and the CLI

Creating fuzz targets and executing those via CLI commands is straightforward
and similar to what you would expect from other fuzzers. How to do so is
described in detail in the following sections.

## Setting up Jazzer.js

Before you can use Jazzer.js, you have to add the required dependency
`@jazzer.js/core` to your project. To do so, execute the following command in
your project root directory.

```shell
npm install --save-dev @jazzer.js/core
```

This will install Jazzer.js and all required dependencies in your project.

## Creating a fuzz target

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
parameters for the actual code under test. However, `Buffer` is not the nicest
abstraction to work with. For that reason, Jazzer.js provides the wrapper class
`FuzzedDataProvider`, which allows reading primitive types from the `Buffer`. An
example on how to use the fuzzer input with the `FuzzedDataProvider` class is
shown below.

```js
const { FuzzedDataProvider } = require("@jazzer.js/core");

module.exports.fuzz = function (fuzzerInputData) {
	const data = new FuzzedDataProvider(fuzzerInputData);
	const intParam = data.consumeIntegral(4);
	const stringParam = data.consumeString(4, "utf-8");
	myAwesomeCode(intParam, stringParam);
};
```

For more information on how to use the `FuzzedDataProvider` class, please refer
to the [example](../tests/FuzzedDataProvider/fuzz.js), the
[tests](../packages/core/FuzzedDataProvider.test.ts), and the
[implementation](../packages/core/FuzzedDataProvider.ts) of the
`FuzzedDataProvider` class.

### Fuzz target execution modes

Jazzer.js supports asynchronous fuzz targets out of the box, no special handling
or configuration is needed.

#### Promise based execution

The resolution of a `Promise`, returned by a fuzz target, is awaited before the
next fuzzing input is provided. This enables the fuzzing of `async`/`await` and
`Promise` based code.

An example of a `Promise` based fuzz target can be found at
[tests/promise/fuzz.js](../tests/promise/fuzz.js).

#### Done callback based execution

If the fuzz target takes a callback function as second parameter, the fuzzer
will await its invocation before providing the next input.

Invoking the callback function without a parameter indicates a successful
execution, whereas invoking it with a parameter indicates a failure. In the
error case, the passed in object is normally of type `string` or `Error` and
used during reporting of the test execution.

An example of a done callback based fuzz target can be found at
[tests/done_callback/fuzz.js](../tests/done_callback/fuzz.js).

#### Synchronous execution

Asynchronous code needs careful synchronization between the
[Node.js Event Loop](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/)
and the fuzzing thread, hence, provides a lower throughput compared to
synchronous fuzzing. Despite that, asynchronous fuzzing is the default mode of
Jazzer.js due to its prevalence in the JavaScript ecosystem and because it works
for all fuzz targets.

Solely synchronous code can participate in the enhanced performance of
synchronous fuzzing by setting the `--sync` flag when starting the fuzzer.

### Using TypeScript to write fuzz targets

It is also possible to use [TypeScript](https://www.typescriptlang.org), or in
that matter any other language transpiling to JavaScript, to write fuzz targets,
as long as a module exporting a `fuzz` function is generated.

An example on how to use TypeScript to fuzz a library can be found at
[examples/js-yaml/package.json](../examples/js-yaml/package.json).

### ⚠️ Using Jazzer.js on pure ESM projects ⚠️

ESM brings a couple of challenges to the table, which are currently not fully
solved. Jazzer.js does have general ESM support as in your project should be
loaded properly. If your project internally still relies on calls to
`require()`, all of these dependencies will be hooked. However, _pure_
ECMAScript projects will currently not be instrumented!

One such example that Jazzer.js can handle just fine can be found at
[examples/protobufjs/fuzz.js](../examples/protobufjs/fuzz.js):

```js
import proto from "protobufjs";
import { temporaryWriteSync } from "tempy";

export function fuzz(data: Buffer) {
	try {
		// Fuzz logic
	} catch (e) {
		// Handle expected error logic here
	}
}
```

You also have to adapt your `package.json` accordingly, by adding:

```json
{
	"type": "module"
}
```

## Running the fuzz target

After adding `@jazzer.js/core` as a `dev-dependency` to a project, the fuzzer
can execute a fuzz target using the `jazzer` npm command. To do so, use `npx`:

```shell
npx jazzer <fuzzer parameters>
```

Or add a new script to your `package.json`:

```json
"scripts": {
"fuzz": "jazzer <fuzzer parameters>"
}
```

Inputs triggering issues, like uncaught exceptions, timeouts, etc., are stored
in the current working directory with an auto-generated name.

The general command format is:

```text
jazzer <fuzzTarget> <fuzzerFlags> [corpus...] [-- <fuzzingEngineFlags>]
```

Detailed documentation and some example calls are available using the `--help`
flag, so that only the most important parameters are discussed here.

| Parameter                                                               | Description                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<fuzzTarget>`                                                          | Import path to the fuzz target module.                                                                                                                                                                                                                                                                   |
| `[corpus...]`                                                           | Paths to the corpus directories. If not given, no initial seeds are used nor interesting inputs saved.                                                                                                                                                                                                   |
| `-- <fuzzingEngineFlags>`                                               | Parameters after `--` are forwarded to the internal fuzzing engine (`libFuzzer`). Available settings can be found in its [options documentation](https://www.llvm.org/docs/LibFuzzer.html#options).                                                                                                      |
| `-i`, `--instrumentation_includes` / `-e`, `--instrumentation_excludes` | Part of filepath names to include/exclude in the instrumentation. A tailing `/` should be used to include directories and prevent confusion with filenames. `*` can be used to include all files. Can be specified multiple times. Default will include everything outside the `node_modules` directory. |
| `--sync`                                                                | Enables synchronous fuzzing. **May only be used for entirely synchronous code**.                                                                                                                                                                                                                         |
| `-h`, `--custom_hooks`                                                  | Filenames with custom hooks. Several hooks per file are possible. See further details in [docs/fuzz-settings.md](docs/fuzz-settings.md).                                                                                                                                                                 |
| `--help`                                                                | Detailed help message containing all flags.                                                                                                                                                                                                                                                              |
