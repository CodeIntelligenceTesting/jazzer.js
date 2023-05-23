<div align="center">
  <h1>Jazzer.js</h1>
  <div style="text-align: center">
    <img
      src="https://7466322.fs1.hubspotusercontent-na1.net/hubfs/7466322/Logos/CI%20Logos/Jazzer.js%20logo.png"
      height="150px"
      alt="Jazzer.js logo"
    />
  </div>
  <hr />
  <a href="https://img.shields.io/npm/v/@jazzer.js/core">
    <img src="https://img.shields.io/npm/v/@jazzer.js/core"/>
  </a>
  <a href="https://github.com/CodeIntelligenceTesting/jazzer.js/actions/workflows/run-all-tests.yaml">
    <img src="https://github.com/CodeIntelligenceTesting/jazzer.js/actions/workflows/run-all-tests.yaml/badge.svg?branch=main"/>
  </a>
  <a href="https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/CodeIntelligenceTesting/jazzer.js"/>
  </a>
 <a href="https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome" />
  </a>
  <br />

<a href="https://www.code-intelligence.com/" target="_blank">Website</a> |
<a href="https://www.code-intelligence.com/blog" target="_blank">Blog</a> |
<a href="https://twitter.com/CI_Fuzz" target="_blank">Twitter</a>

</div>

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

1. Add the `@jazzer.js/core` `dev-dependency`

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

Jazzer.js can be used in two ways: Creating dedicated fuzz targets, as shown in
the [`Quickstart`](#quickstart) section, or integrated into the
[Jest test framework](https://jestjs.io/).

### Using test framework integration

**Note**: Using the test framework integration is the easiest and most
convenient way to fuzz your code, hence, it is recommended to use this approach
whenever possible.

To use fuzzing in your normal development workflow, a tight integration with the
[Jest test framework](https://jestjs.io/) is provided. This coupling allows the
execution of fuzz tests alongside your normal unit tests and seamlessly detect
problems on your local machine or in your CI, enabling you to check that found
bugs stay resolved forever.

Furthermore, the Jest integration enables great IDE support, so that individual
inputs can be run or even debugged, similar to what you would expect from normal
Jest tests.

**Note**: Detailed explanation on how to use the Jest integration can be found
at [docs/jest-integration.md](docs/jest-integration.md).

A Jest fuzz test, in this case written in TypeScript, looks similar to the
following example:

```typescript
// file: "Target.fuzz.ts"
import * as target from "./target";

describe("Target", () => {
	it.fuzz("executes a method", (data: Buffer) => {
		target.fuzzMe(data);
	});
});
```

**Note**: Please take a look at
[Enabling TypeScript in Jest tests](docs/jest-integration.md#enabling-typescript-jest-tests)
for further information on how to set up Jest fuzz tests written in TypeScript.

### Using fuzz targets

Creating fuzz targets and executing those via CLI commands is straightforward
and similar to what you would expect from other fuzzers. This approach offers
the most control and can easily be integrated in your CI pipelines via
`npm`/`npx` commands.

**Note**: Detailed explanation on how to create and use fuzz targets can be
found at [docs/fuzz-targets.md](docs/fuzz-targets.md).

A fuzz target can look as simple as this example:

```js
// file "FuzzTarget.js"
module.exports.fuzz = function (data /*: Buffer */) {
	const fuzzerData = data.toString();
	myAwesomeCode(fuzzerData);
};
```

## Documentation

Further documentation is available at [docs/readme.md](docs/README.md).

### Demo Video - Introduction to Jazzer.js

We recorded a live demo which shows how to get Jazzer.js up and running for your
own projects. If you are just getting started, this might be helpful.

You can watch the recording [here](https://youtu.be/KyIhxEiNnfc).

## Credit

Jazzer.js is inspired by its namesake
[Jazzer](https://github.com/CodeIntelligenceTesting/jazzer), also developed by
[Code Intelligence](https://www.code-intelligence.com).

<p align="center">
<a href="https://www.code-intelligence.com"><img src="https://www.code-intelligence.com/hubfs/Logos/CI%20Logos/CI_Header_GitHub_quer.jpeg" height=50px alt="Code Intelligence logo"></a>
</p>
