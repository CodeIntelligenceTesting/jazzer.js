# Fuzzing Settings

## Configuration options

Jazzer.js can be configured in multiple ways depending on the concrete use case.
There are three ways to configure Jazzer.js:

1. **CLI** - when a fuzz function is executed directly from the command line
   using `npx jazzer ...`, Jazzer.js can be configured by providing arguments
   directly on the command line,
2. **Jest** - when Jazzer.js is used to run Jest tests, it can be
   [configured](./jest-integration.md#setting-up-the-jazzerjs-jest-integration)
   using `.jazzerjsrc.json`,
3. **ENV** - when Jazzer.js runs in either CLI or Jest mode, most options can be
   specified by an environment variable.

The following preferences apply with increasing priority:

- Default values from the [`defaultOptions`](../packages/core/options.ts) object
- Configuration file values (e.g. `.jazzerjsrc.json` or Jest
  [configuration files](./jest-integration.md#setting-up-the-jazzerjs-jest-integration))
- Environment variables (names in upper snake case format with `JAZZER_` prefix,
  e.g. `JAZZER_INCLUDES=foo`)
- CLI arguments

All options configurable in Jazzer.js are described below. To see the current
values of every option in use, it might be helpful to run Jazzer.js in
[verbose mode](#verbose--boolean).

_Note:_ The CLI provides abbreviations for common arguments, e.g. `--includes`
can be abbreviated to `-i`. Run with `--help` to show all possible
abbreviations:

```shell
npx jazzer --help
```

### `corpus` : [array\<string\>]

Default: depends on the fuzz test runner (CLI/Jest)

Set the corpus directories or the individual corpus files to use for fuzzing
(mixing directories and files is not allowed).

Jazzer.js generates meaningful inputs to a fuzz target based on coverage and
comparison feedback. If a new input can reach new code paths, it is saved in a
dedicated directory, called _corpus directory_, and used for further mutations
to the guide the fuzzer during the following iterations. Existing inputs in the
corpus directory, called _seeds_, are executed on startup, so that new fuzzing
runs can start off where previous ones stopped.

One or more corpus directories can be specified as the last entry/entries in the
parameter list. The first corpus directory will be used to save interesting new
inputs, whereas seeds from all directories are executed during startup.

If the corpus points to files instead of directories, Jazzer.js will run the
fuzz target with each file as input once and exit. This can be used to manually
reproduce previously found issues.

**CLI:** Default: `[]`

This is a positional argument that should be specified without a flag as the
last argument. Here is an example how to specify two corpus directories
`corpus_dir` and `only_on_startup_corpus` in CLI mode.

```shell
npx jazzer fuzz-file corpus_dir only_on_startup_corpus
```

It is also possible to provide inputs directly. In that case, Jazzer.js will run
them once and exit. To run the fuzz target with inputs `crash-abcdef0123456789`
and `my-test.txt` in CLI can be done as follows:

```shell
npx jazzer fuzz-file crash-abcdef0123456789 my-test.txt
```

If no corpus directory is provided, Jazzer.js will start fuzzing from scratch
and will not save any inputs other than crashes on exit.

**Jest:** In Jest runner mode, Jazzer.js automatically chooses the corpus
directories based on the name of the fuzz test and the
[mode](#mode--fuzzingregression) ("fuzzing" or "regression").

In _regression mode_, the main corpus directory is the directory where the test
file resides. Each fuzz test has a dedicated corpus subdirectory in it derived
from its name and the names of the enclosing describe-blocks.

For example, suppose that we have a project with following structure:

```text
.
├── package.json
├── package-lock.json
├── src
│   └── ...
└── tests
    └── tests.fuzz.js
```

and two fuzz tests in `./tests/tests.fuzz.js`:

```javascript
describe("Target", () => {
	test.fuzz("fuzz test 1", (data) => {});
	test.fuzz("fuzz test 2", (data) => {});
});
```

The first time when our example fuzz tests are executed by Jazzer.js by e.g.
running `npx jest tests/tests.fuzz.js` from the command line, Jazzer.js will
create the directories `./tests/tests.fuzz/Target/fuzz_test_1` and
`./tests/tests.fuzz/Target/fuzz_test_2` that the two fuzz tests will use in
regression mode.

In _fuzzing mode_, the main corpus directory is in the `.cifuzz-corpus/`
directory. Each fuzz test has a dedicated corpus subdirectory in it derived from
its path within the project, its name, and the names of the enclosing
describe-blocks. The regression corpus directory is also used in fuzzing mode:
on startup to load all contained inputs; and to save all crashing inputs the
fuzzer finds while fuzzing.

In the example above, the folder structure after running Jazzer.js in fuzzing
mode will look as follows:

```shell
.
├── .cifuzz-corpus  # main corpus directory for fuzz tests
│   └── tests
│       └── tests.fuzz
│           └── Target
│               ├── fuzz_test_1  # corpus directory for "fuzz test 1"
│               └── fuzz_test_2
├── package.json
├── package-lock.json
├── src
│   └── ...
└── tests
    └── tests.fuzz.js
    └── tests.fuzz  # main regression corpus directory for tests.fuzz.js
        └── Target
            ├── fuzz_test_1   # regression corpus directory for "fuzz test 1" test
            │   └── regression_test_1   # a regression input
            │   └── regression_test_2   # another regression input
            └── fuzz_test_2   # regression corpus directory for "fuzz test 2" test
                └── ...   # regression inputs for "fuzz test 2" test
```

**ENV:** It is currently not possible to set corpus directories via an
environmental variable.

### `coverage` : [boolean]

Default: false

Generate a code coverage report upon exit.

The report is generated in the directory specified by the
[`coverageDirectory`](#coveragedirectory--string) option using the reporters
specified by the [`coverageReporters`](#coveragereporters--arraystring) option.

If the fuzzer does not finish, no report will be generated. Pressing CTRL-C to
manually stop the fuzzer might result in incomplete coverage reports. To
reliably generate coverage reports, it makes sense to run the fuzzer on each
input in the corpus only once. This can be accomplished by adding the following
to the option [fuzzerOptions](#fuzzeroptions--arraystring): `-runs=1` (run each
input once and quit); or `-max_total_time=N` (fuzz for N seconds and quit); or
by running the fuzzer in [regression mode](#mode--fuzzingregression) using the
option `--mode=regression`. While it's possible to generate coverage reports by
running Jazzer.js in fuzzing mode, instrumentation for code coverage makes
fuzzing less efficient.

**CLI:** To run the fuzz function `buzz` in file `my-fuzz-file.js` for 10
seconds from the command line and generate a code coverage report, add the
`--coverage` option without arguments:

```bash
npx jazzer my-fuzz-file --fuzzEntryPoint=buzz --coverage -- -max_total_time=10
```

**Jest:** Call Jest with `--coverage` flag:

```bash
npx jest --coverage
```

Or add the following to the
[Jest configuration file](https://jestjs.io/docs/configuration) (e.g.
`jest.config.js`):

```javascript
module.exports = {
	coverage: true,
};
```

_Note:_ This option **cannot** be set in `.jazzerjsrc.json`.

**ENV:** Prepend the environment variable `JAZZER_COVERAGE=true` to the command
in order to generate a code coverage report when fuzzing on the command line:

```bash
JAZZER_COVERAGE=true npx jazzer fuzz
```

In Jest mode it is not possible to set this option using an environment
variable. Use the method described in the "Jest" section above instead.

### `coverageDirectory` : [string]

Default: "coverage"

Set the output directory for the coverage reports.

**CLI:** This example sets the output directory for the coverage reports to
`./my_coverage_directory`:

```example
npx jazzer my-fuzz-file --mode=regression --coverage --coverageDirectory=./my_coverage_directory
```

**Jest:** This example sets the output directory for the coverage reports to
`./my_coverage_directory`:

```bash
npx jest --coverageDirectory=./my_coverage_directory --coverage
```

Alternatively, use a
[Jest configuration file](https://jestjs.io/docs/configuration). For example
`jest.config.js`:

```javascript
module.exports = {
	coverageDirectory: "./my_coverage_directory",
};
```

_Note:_ This option **cannot** be set in `.jazzerjsrc.json` and has to be
provided to Jest directly.

**ENV:** To set the output directory to `./my_coverage_directory` when fuzzing
on the command line, prepend the environment variable to the command as follows:

```bash
JAZZER_COVERAGE_DIRECTORY=./my_coverage_directory npx jazzer my-fuzz-file --coverage
```

_Note:_ In Jest mode it is not possible to set this option using an environment
variable.

### `coverageReporters` : [array\<string\>]

Default: ["json", "lcov", "text", "clover"]

Select the format of the coverage reports.

A comprehensive list of supported coverage reporters can be found in the
[istanbul documentation](https://github.com/istanbuljs/istanbuljs/tree/master/packages/istanbul-reports/lib).

_Note:_ The [`coverage`](#coverage--boolean) option must be set, otherwise no
coverage reports will be generated.

**CLI:** To generate code coverage reports in only `json` and `lcov` formats in
CLI mode:

```bash
npx jazzer my-fuzz-file --coverage --coverageReporters=json --coverageReporters=lcov
```

**Jest:** To generate code coverage reports in only `json` and `text` format in
Jest mode, add the following option to the call to Jest:

```bash
npx jest --coverageReporters=json --coverageReporters=text --coverage
```

The coverage reporters can also be set in the Jest configuration file
`jest.config.js`:

```javascript
module.exports = {
	coverageReporters: ["json", "text"],
	coverage: true,
};
```

_Note:_ This option **cannot** be set in `.jazzerjsrc.json` and has to be
configured for Jest.

**ENV:** To only get coverage reports in `json` and `lcov` formats in CLI mode,
add the following environment variable to the command:

```bash
JAZZER_COVERAGE='["json","lcov"]' npx jazzer my-fuzz-file --coverage
```

_Note:_ Setting this environmental variable in Jest mode has no effect.
Configure Jest using the methods described above.

### `customHooks` : [array\<string\>]

Default: []

Add files containing custom hooks.

Custom hooks allow users to hook functions in built-in libraries, libraries
loaded at runtime, or functions in global scope. Custom hooks are useful for
writing bug detectors, removing fuzzing blockers, and improving the fuzzing
process by providing additional feedback to the fuzzer.

See the sections [below](#defining-custom-hooks) on how write custom hook
functions in Jazzer.js.

**CLI:** To add a custom hooks file `./my_custom_hooks.js` in command line mode,
use the flag `--customHooks=./my_custom_hooks.js` (or
`-h ./my_custom_hooks.js`):

```bash
npx jazzer my-fuzz-file --customHooks=./my_custom_hooks.js
```

Or in the `package.json` file:

```json
"scripts": {
    "fuzz": "jazzer my-fuzz-file --customHooks=./my_custom_hooks.js"
}
```

Several files with custom hooks can be added like this:
`--customHooks=file1.js --customHooks=file2.js`. Each of these files can contain
multiple hook definitions.

**Jest:** To add the custom hooks files `./myCustomHooks-1.js` and
`./myCustomHooks-2.js` in Jest mode, add the following to the Jazzer.js
configuration file `.jazzerjsrc.json`:

```json
{
	"customHooks": ["./myCustomHooks-1.js", "./myCustomHooks-2.js"]
}
```

**ENV:** To add a custom hooks files `./myCustomHooks-1.js` and
`./myCustomHooks-2.js` to fuzz tests in CLI or Jest mode, add the following
environment variable to the command:

```bash
JAZZER_CUSTOM_HOOKS='["./myCustomHooks-1.js","./myCustomHooks-2.js"]' npm run fuzz
```

#### Defining custom hooks

Import the functions `registerBeforeHook`, `registerReplaceHook`,
`registerAfterHook` from Jazzer.js:

```javascript
const {
	registerBeforeHook,
	registerReplaceHook,
	registerAfterHook,
} = require("@jazzer.js/hooking");
```

All three functions have the same interface and can be used to register a custom
hook function:

```typescript
function register<Before|Replace|After>Hook(
 target: string, // target function name that we want to hook
 pkg: string,    // the name of the target library
 async: boolean, // the hook function will be run in async (true) or sync (false) mode?
 hookFn: HookFn  // custom hook function
);
```

Nested functions can be hooked by concatenating all parent functions and classes
with a dot. Consider the following example:

```javascript
function a(arg1, arg2) {
	function foo() {
		return arg1 + arg2;
	}
	return foo();
}
```

To hook function `foo` defined inside function `a`, the `target` string of the
hook registering function should be `"a.foo"`. Here is an example:
`registerReplaceHook("a.foo", "target-lib-js", false, () => {})`.

The custom hook function `hookFn` will be called either before, after, or
replace the original target function. Its interface depends on the hook
registering function:

- for `registerBeforeHook`, the custom hook function will be called before the
  original function like this: `hookFn(thisPtr, params, hookId)`
- for `registerReplaceHook`, the custom hook function will replace the original
  function and will be called like this:
  `hookFn(thisPtr, params, hookId, originalFn)`
- for `registerAfterHook`, the custom hook function will be called after the
  original function like this:
  `hookFn(thisPtr, params, hookId, originalFnResult)`

The parameters of the `hookFn` are as follows:

- `thisPtr` - points to the object in which the original function was defined,
- `params` - the parameters of the original function,
- `hookId` - a (probabilistically) unique identifier for this particular compare
  hint; this value can be passed to the functions `guideTowardsEquality`,
  `guideTowardsContainment`, `exploreState` to help guide the fuzzer,
- `originalFn` - the original function can be called inside the `hookFn` when
  registering a hook with `registerReplaceHook`,
- `originalFnResult` - the results of calling the original function can be used
  inside the `hookFn` when registering a hook with `registerAfterHook`.

#### Examples

Several examples showcasing the custom hooks can be found in
[../examples/custom-hooks/custom-hooks.js](../examples/custom-hooks/custom-hooks.js).

#### Debugging hooks

Enable the [`verbose`](#verbose--boolean) option and Jazzer.js will print (among
other things) which hooks were applied, which hook functions are available in
general, and which hooks could not be applied.

### `disableBugDetectors` : [array\<RegExp\>]

Default: []

Disable bug detectors (aka sanitizers) that match the provided regular
expressions.

For example, to disable all bug detectors use `".*"`. See
[the list of all bug detectors](#bug-detectors) available in Jazzer.js.

**CLI:** To disable the _prototype pollution_ and _path traversal_ bug detectors
on the command line use:

```bash
npx jazzer my-fuzz-file --disableBugDetectors=prototype-pollution --disableBugDetectors=path-traversal
```

**Jest:** To disable the _prototype pollution_ and _path traversal_ bug
detectors in Jest mode, add the following option to the Jazzer.js configuration
file `.jazzerjsrc.json`:

```json
{
	"disableBugDetectors": ["prototype-pollution", "path-traversal"]
}
```

**ENV:** To disable the _prototype pollution_ and _path traversal_ bug detectors
in CLI run mode, add the following environment variable to the command:

```bash
JAZZER_DISABLE_BUG_DETECTORS='["prototype-pollution", "path-traversal"]' npx jazzer my-fuzz-file
```

And identically in Jest mode:

```bash
JAZZER_DISABLE_BUG_DETECTORS='["prototype-pollution", "path-traversal"]' npx jest
```

### `dryRun` : [boolean]

Default: false

Disable code instrumentation for fuzzing.

The option might be useful in several cases:

1. When debugging the fuzz target and making sure that the instrumentation does
   not interfere with target code;
2. When running the fuzzer in [regression mode](#mode--fuzzingregression) where
   instrumentation is not required, the tests run faster if not instrumented.

**CLI:** To enable dry run mode on the command line, use:

```bash
npx jazzer my-fuzz-file --dryRun
```

**Jest:** To enable dry run mode in Jest mode, add the following option to the
Jazzer.js configuration file `.jazzerjsrc.json`:

```json
{
	"dryRun": true
}
```

**ENV:** To enable dry run mode in CLI or Jest mode, add the following
environment variable to the command:

```bash
JAZZER_DRY_RUN=true npx jazzer my-fuzz-file
```

### `excludes` : [array\<string\>]

Default: ["node_modules"]

Exclude files from code instrumentation for fuzzing.

If any of the provided strings matches the file path, the file will not be
instrumented. This option supports only one pattern: `*` that matches all files.
Should the [`includes`](#includes--arraystring) option be set to a non-default
value, the default value of `excludes` will be automatically changed to `[]` to
enable fuzzing of libraries in the `node_modules` directory.

**CLI:** To exclude all files from instrumentation, use:

```bash
npx jazzer my-fuzz-file --excludes="*"
```

To exclude the files whose paths contain "unrelated" and "foo" from
instrumentation, use:

```bash
npx jazzer fuzz --excludes="unrelated" --excludes="foo"
```

**Jest:** To exclude files whose paths contain "unrelated" and "foo" from
instrumentation in Jest mode, add the following option to the Jazzer.js
configuration file `.jazzerjsrc.json`:

```json
{
	"excludes": ["unrelated", "foo"]
}
```

**ENV:** To exclude files whose paths contain "unrelated" and "foo" from
instrumentation in CLI or Jest mode, add the following environment variable to
the command:

```bash
JAZZER_EXCLUDES='["unrelated", "foo"]' npx jazzer fuzz
```

Or in Jest mode:

```bash
JAZZER_EXCLUDES='["unrelated", "foo"]' npx jest
```

### `expectedErrors` : [array\<string\>]

Default: []

Set the list of expected errors.

If Jazzer.js stops because an error was encountered, the error name will be
compared to the list of expected errors provided with this option. If the error
name matches any of them, the fuzzer will return exit code 0, and a non-zero
exit code otherwise. Upon error, the fuzzer will **not** keep on fuzzing.

Possible values for expected errors are:

- `"Error"` - any Error object. E.g. `throw new Error("my finding")`, or
  `throw new TypeError("hello")`.
- value of a primitive type - e.g. 1, "foo", true, etc.
- "unknown" - any other type

_Note: This option is intended for internal use only, to test if the fuzzer is
working as expected._

**CLI:** To expect any thrown value of type Error and/or a thrown "1" on the
command line, use:

```bash
npx jazzer my-fuzz-file --expectedErrors=Error --expectedErrors=1
```

**Jest:** This option does not work Jest mode.

**ENV:** To expect any value of type Error and/or a thrown "1" in CLI mode, add
the following environment variable to the command:

```bash
JAZZER_EXPECTED_ERRORS='["Error","1"]' npx jazzer my-fuzz-file
```

### `fuzzEntryPoint` : [string]

Default: "fuzz"

Name of the function to fuzz.

**CLI:** The function must be exported from the file specified by the
non-optional argument [fuzzTarget](#fuzztarget--string). To fuzz the function
`buzz` in the file `my-fuzz-file.js` on the command line, use:

```bash
npx jazzer my-fuzz-file --fuzzEntryPoint=buzz
```

Where the file `my-fuzz-file.js` contains:

```js
module.exports.buzz = function (data) {
	// fuzz this function
};
```

**Jest:** This flag is ignored in Jest mode. Instead use the native Jest flag
`--testNamePattern` to specify the Jest fuzz tests to run. For example, to fuzz
the Jest test `"buzz"` in the test file `tests.fuzz.js`, use:

```bash
npx jest tests.fuzz.js --testNamePattern=buzz
```

With `tests.fuzz.js` containing:

```js
test("fuzz", () => {
	// this function will not be fuzzed
});

test("buzz", () => {
	// this function will be fuzzed
});
```

See the Jest guide for more information about
[`--testNamePattern`](https://jestjs.io/docs/cli#--testnamepatternregex).

**ENV:** To fuzz the function `buzz` in the file `my-fuzz-file.js` in CLI mode,
add the environment variable to the command as follows:

```bash
JAZZER_FUZZ_ENTRY_POINT=buzz npx jazzer my-fuzz-file
```

_Note:_ In Jest mode, this option cannot be set via environment variable.
Instead use the native Jest flag `--testNamePattern` as described above.

### `fuzzerOptions` : [array\<string\>]

Default: []

Pass options to native fuzzing engine (Jazzer.js uses libFuzzer).

For a list of available options, see the
[libFuzzer documentation](https://llvm.org/docs/LibFuzzer.html#options). To get
a quick overview of all available options, call Jazzer.js with the libFuzzer
argument `-help`. Here is an example for the CLI mode:

```bash
npx jazzer my-fuzz-file -- -help=1
```

_Note:_ the libFuzzer option `-timeout` (notice the single dash) is natively
supported in Jazzer.js with the option [`timeout`](#timeout--number) and will be
ignored if passed via `fuzzerOptions`.

**CLI:** It is not possible to use this flag directly on the command line.
Instead, the options can be passed to libFuzzer after a double-dash `--`. For
example, libFuzzer's flags `-use_value_profile=1` and `-dict=xml.txt` can be set
as follows:

```bash
npx jazzer my-fuzz-file -- -use_value_profile=1 -dict=xml.txt
```

**Jest:** To pass the options `-use_value_profile=1` and `-dict=xml.txt` to
libFuzzer in Jest mode, add the following to the `.jazzerjsrc.json` file:

```json
{
	"fuzzerOptions": ["-use_value_profile=1", "-dict=xml.txt"]
}
```

**ENV:** It is not possible to set this flag via an environment variable.

#### Value profile

Jazzer.js provides coverage and comparison feedback to the internally used
libFuzzer instance. By setting the libFuzzer flag `-use_value_profile=1`, new
values in intercepted compares are treated as new coverage. This has the
potential to discover many additional inputs, which would not be detected
otherwise, but may reduce runtime performance significantly.

An example of using value profiling can be found at
[tests/value_profiling/fuzz.js](../tests/value_profiling/fuzz.js).

### `fuzzTarget` : [string]

Default: ""

Specify the file to fuzz.

**CLI:** In command line mode, this option is expected as the first argument to
the `jazzer` command and cannot be specified via flag. To fuzz the function
`fuzz` (default value of the [`fuzzEntryPoint`](#fuzzentrypoint--string) option)
in file `my-fuzz-file.js` on the command line, use:

```bash
npx jazzer my-fuzz-file
```

**Jest:** This option is ignored in Jest mode, where you can either specify the
file with Jest fuzz tests directly as the
[first argument](https://jestjs.io/docs/cli#jest-regexfortestfiles) to Jest, or
via the Jest flag
[`--testPathPattern`](https://jestjs.io/docs/cli#--testpathpatternregex). For
example, to run all fuzz tests in regression mode (default mode for the Jest
runner) in file `tests.fuzz.js`, use:

```bash
npx jest tests.fuzz.js
```

**ENV:** The fuzz target cannot be specified via an environment variable.

### `idSyncFile` : [string]

Default: ""

Specify a file to synchronize edge IDs used during fuzzing by multiple processes
(e.g. in fork mode by adding `-fork=1` to the option
[`fuzzerOption`](#fuzzeroptions--arraystring)).

_Note: This option is intended for internal use only when fuzzing in
multi-process mode. It is not possible to set this option on command-line or
otherwise, because it will be overwritten internally._

### `includes` : [array\<string\>]

Default: ["*"]

Include files that should be instrumented for fuzzing.

This option supports one pattern: `"*"` that includes all files. Otherwise, only
the files whose paths match the provided string(s) will be instrumented, unless
the path matches one of the strings in the [`excludes`](#excludes--arraystring)
option.

As soon as `--includes` is set to a non-default value, the default value of the
`--excludes` is changed from `["node_modules"]` to `[]`, to enable fuzzing of
projects in the `node_modules` directory.

**CLI:** To instrument all files that have "foo" and "boo" in their path, use:

```bash
npx jazzer my-fuzz-file --includes="foo" --includes="boo"
```

**Jest:** To instrument all files that have "foo" and "boo" in their path, add
the following to the `.jazzerjsrc.json` file:

```json
{
	"includes": ["foo", "boo"]
}
```

**ENV:** To instrument all files that have "foo" and "boo" in their path in CLI
mode, use:

```bash
JAZZER_INCLUDES='["foo","boo"]' npx jazzer my-fuzz-file
```

Or in Jest mode:

```bash
JAZZER_INCLUDES='["foo","boo"]' npx jest
```

### `JAZZER_FUZZ` : [boolean]

Default: false

Run Jest fuzz tests in fuzzing mode.

This option is similar to the [`mode`](#mode--fuzzingregression) option.

**ENV:** This option can only be set via an environment variable. To run Jest in
fuzzing mode:

```bash
JAZZER_FUZZ=1 npx jest tests.fuzz.js
```

### `JAZZER_LIST_FUZZTEST_NAMES` : [boolean]

Default: false

Print the fuzz test names on the command line.

_Note:_ this option can only be set using an environment variable.

The fuzz test names are derived from the describe blocks and the test names by
concatenating them with a space to each other. Internally, Jazzer.js uses these
names to derive the corpus directories for each test.

**ENV:** Set the environment variable `JAZZER_LIST_FUZZTEST_NAMES` to print the
names of the fuzz tests in Jest mode:

```bash
JAZZER_LIST_FUZZTEST_NAMES=1 npx jest tests.fuzz.js
...
My test fuzz
My test buzz
...
```

where `tests.fuzz.js` contains the following:

```javascript
describe("My test", () => {
	test("fuzz", () => {...});
	test("buzz", () => {...});
});
```

### `mode` : ["fuzzing"|"regression"]

Default: depends on the fuzz test runner (CLI/Jest)

In [_fuzzing_](./jest-integration.md#fuzzing-mode) mode, Jazzer.js will run
indefinitely, trying out new inputs until it either finds a crash, reaches a
user-defined stop condition, or is interrupted by the user.

In [_regression_](./jest-integration.md#regression-mode) mode, Jazzer.js only
runs the fuzz tests with inputs in their corresponding regression directories
once.

**CLI:** Default: `"fuzzing"`.

In _fuzzing_ mode on command line, Jazzer.js uses both the main seed corpus and
regression corpus directories to initialize the fuzzer. Inputs that reach new
coverage will be stored in the seed directory. Inputs that trigger a crash will
be stored in the regression directory.

In _regression_ mode on command line, Jazzer.js runs each input from the seed
and regression corpus directories on the fuzz target once, and then stops. Under
the hood, this option adds `-runs=0` to the option
[`fuzzerOptions`](#fuzzeroptions--arraystring). Setting the fuzzer option to
`-runs=0` (run each input only once) or `-runs=-1` (run each input indefinitely)
can be used to achieve the same behavior.

**Jest:** Default: `"regression"`.

In _regression_ mode, each Jest fuzz test will be run with inputs from the
corresponding regression corpus directories.

In _fuzzing_ mode, only one fuzz test can be run. Jazzer.js will use both the
seed and regression corpus directories to initialize the fuzzer. Inputs that
reach new coverage will be stored in the seed directory. Inputs that cause a
crash or timeout will be saved in the regression directory.

To run Jest fuzz tests in _fuzzing_ mode, add the following to the
`.jazzerjsrc.json` file:

```json
{
	"mode": "fuzzing"
}
```

Choosing which fuzz test will be run can be done by passing the flag
`--testNamePattern` with a fitting value directly to Jest. Alternatively, since
Jazzer.js will run the first test it finds, it is possible to choose which fuzz
test to run in fuzzing mode directly in the test file either using `skip` or
`only`. For example, in the following example, the second test named
`"this test will be fuzzed"` will be fuzzed because we `skip` the first test:

```javascript
it.skip.fuzz("skipped test", (data) => {...});
it.fuzz("this test will be fuzzed", (data) => {...});
```

In this example, the third test named `"fuzzed test"` will be fuzzed because we
use `only`:

```javascript
it.fuzz("skipped test 1", (data) => {...});
it.fuzz("skipped test 2", (data) => {...});
it.only.fuzz("fuzzed test", (data) => {...});
```

**ENV:** To run in the mode other than the default mode in CLI or Jest, set the
environment variable `JAZZER_MODE`. For example, to select the `regression` mode
in CLI:

```bash
JAZZER_MODE=regression npx jazzer my-fuzz-file
```

To select the `fuzzing` mode in Jest:

```bash
JAZZER_MODE=fuzzing npx jest tests.fuzz.js
```

_Note:_ In Jest mode, setting `JAZZER_MODE=fuzzing` is the same as setting
[`JAZZER_FUZZ=1`](#jazzer_fuzz--boolean).

### `sync` : [boolean]

Default: false

Run in synchronous mode.

If the code under test is fully synchronous, fuzzing will be faster in
synchronous mode.

_Note:_ don't use this option if the code under test contains asynchronous
parts.

**CLI:** To run in synchronous mode on command line, append the `--sync` flag to
the command:

```bash
npx jazzer my-fuzz-file --sync
```

**Jest:** To run in synchronous mode in Jest mode, add the following to the
`.jazzerjsrc.json` file:

```json
{
	"sync": true
}
```

**ENV:** To run in synchronous mode in CLI or Jest mode, set the environment
variable `JAZZER_SYNC` to `true`. Here is an example for Jest:

```bash
JAZZER_SYNC=true npx jest tests.fuzz.js
```

### `timeout` : [number]

Default: 5000 (milliseconds)

Set fuzz test timeout in milliseconds.

If a fuzz test takes longer than `timeout` to execute an input, Jazzer.js will
save this input in a crash file.

**CLI:** To set the timeout to 10000 milliseconds on command line, use:

```bash
npx jazzer my-fuzz-file --timeout=10000
```

**Jest:** To set the timeout to 10000 milliseconds in Jest mode, add the
following to the `.jazzerjsrc.json` file:

```json
{
	"timeout": 10000
}
```

**ENV:** To set the timeout to 10000 milliseconds in CLI or Jest mode, set the
environment variable `JAZZER_TIMEOUT`. Here is an example for Jest:

```bash
JAZZER_TIMEOUT=10000 npx jest tests.fuzz.js
```

### `verbose` : [boolean]

Default: false

Print debugging logs including:

- current values for all configuration options set by CLI/Jest flags and
  environment variables
- hooked functions
- functions that could not be hooked
- functions available to hooking

**CLI:** Add `--verbose` flag to the command:

```bash
npx jazzer my-fuzz-file --verbose
```

**Jest:** Add the `verbose` option to the Jazzer.js configuration file
`.jazzerjsrc.json`:

```json
{
	"verbose": true
}
```

**ENV:** To set the flag for CLI and Jest mod, use the environment variable
`JAZZER_VERBOSE`. Here is an example for CLI:

```bash
JAZZER_VERBOSE=1 npx jazzer my-fuzz-file
```

## Bug Detectors

Bug detectors are one of the key features when fuzzing memory-safe languages. In
Jazzer.js, they can detect some of the most common vulnerabilities in JavaScript
code. Built-in bug detectors are enabled by default, but can be disabled by
adding the `--disableBugDetectors=<pattern>` flag to the project configuration.
To disable all built-in bug detectors, add `--disableBugDetectors='.*'` to the
project configuration.

### Command Injection

Hooks all functions of the built-in module `child_process` and reports a finding
if the fuzzer was able to pass a command to any of the functions.

_Disable with:_ `--disableBugDetectors=command-injection`, or when using Jest:

```json
{ "disableBugDetectors": ["command-injection"] }
```

### Path Traversal

Hooks all relevant functions of the built-in modules `fs` and `path` and reports
a finding if the fuzzer could pass a special path to any of the functions.

_Disable with:_ `--disableBugDetectors=path-traversal`, or when using Jest:

```json
{ "disableBugDetectors": ["path-traversal"] }
```

### Prototype Pollution

Detects Prototype Pollution. Prototype Pollution is a vulnerability that allows
attackers to modify the prototype of a JavaScript object, which can lead to
validation bypass, denial of service and arbitrary code execution.

The Prototype Pollution bug detector can be configured in the
[custom hooks](#customhooks--arraystring) file.

- `instrumentAssignmentsAndVariableDeclarations` - if called, the bug detector
  will instrument assignment expressions and variable declarations and report a
  finding if `__proto__` of the declared or assigned variable contains any
  properties or methods. When called in dry run mode, this option will trigger
  an error.
- `addExcludedExactMatch` - if the stringified `__proto__` equals the given
  string, the bug detector will not report a finding. This is useful to exclude
  false positives.

Here is an example configuration in the
[custom hooks](#customhooks--arraystring) file:

```javascript
const { getBugDetectorConfiguration } = require("@jazzer.js/bug-detectors");

getBugDetectorConfiguration("prototype-pollution")
	?.instrumentAssignmentsAndVariableDeclarations()
	?.addExcludedExactMatch('{"methods":{}}');
```

Adding instrumentation to variable declarations and assignment expressions
drastically reduces the fuzzer's performance because the fuzzer will check for
non-empty `__proto__` on every variable declaration and assignment expression.
In addition, this might cause false positives because some libraries (e.g.
`lodash`) use `__proto__` to store methods. Therefore, in the default
configuration these options are disabled.

_Shortcoming:_ The instrumentation of variable declarations and assignment
expressions will not detect if the prototype of the object in question has new,
deleted, or modified functions. But it will detect if a function of a prototype
of an object has become a non-function. The following example illustrates this
issue:

```javascript
class A {}
class B extends A {}
const b = new B();
b.__proto__.polluted = true; // will be detected
b.__proto__.test = [1, 2, 3]; // will be detected
b.__proto__.toString = 10; // will be detected
b.__proto__.toString = () => "polluted"; // will not be detected
delete b.__proto__.toString; // will not be detected
b.__proto__.hello = () => "world"; // will not be detected
```

However, our assumption is that if the fuzzer is able to modify the methods in a
prototype, it will be able also find a way to modify other properties of the
prototype that are not functions. If you find a use case where this assumption
does not hold, feel free to open an issue.

_Disable with:_ `--disableBugDetectors=prototype-pollution`, or when using Jest:

```json
{ "disableBugDetectors": ["prototype-pollution"] }
```

For implementation details see
[../packages/bug-detectors/internal](../packages/bug-detectors/internal).

### Writing Custom Bug Detectors

Users can write their own bug detectors using the
[custom hooks feature](#customhooks--arraystring). Use the function
`reportFinding` to report a finding from your bug detector---it makes sure that
the finding escapes all try/catch blocks along the way and is definitely
reported. Beware that `reportFinding` will only report the first finding from
any of the bug detectors and all subsequent findings will be ignored.
