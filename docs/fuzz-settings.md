# Advanced Fuzzing Settings

This page describes advanced fuzzing settings.

## Configuration options

Jazzer.js can be configured in multiple ways depending on the concrete use case.

The `Options` interface in the [options.ts](../packages/core/options.ts) file
describes all available settings. These can be set via CLI argument, environment
variable or in integration specific ways, e.g. Jest configuration files.

In general the following preference applies with increasing priority:

- Default values from the [`defaultOptions`](../packages/core/options.ts) object
  (names in camel case format, e.g. `fuzzTarget`)
- Environment variables (names in upper snake case format with `JAZZER_` prefix,
  e.g. `JAZZER_FUZZ_TARGET=Foo`)
- CLI arguments (names in lower snake case format, e.g. `--fuzz_target=Foo`)
- Integration specific configuration (e.g. `jazzerjsrc` or Jest configuration
  files)

**Note**: The CLI provides abbreviations for common arguments, e.g. `--includes`
can be abbreviated to `-i`. Only the main argument name is supported in other
configuration approaches, though.

## Corpus

Jazzer.js generates meaningful inputs to a fuzz target based on coverage and
comparison feedback. If a new input can reach new code paths, it is saved in a
dedicated directory, called corpus, and used for further mutations to the guide
the fuzzer during the following iterations.

Also, existing inputs in the corpus directory, called seeds, are executed on
startup, so that new fuzzing runs can start off where previous ones stopped.

One or more corpus directories can be specified as the last entry/entries in the
CLI parameter list, as described in the `--help` command. The first corpus
directory will be used to save interesting new inputs, whereas seeds from all
directories are executed during startup.

**Example invocation:**

```shell
npx jazzer target corpus_dir other_corpus
```

## Reproducing errors

Once Jazzer.js finds a problematic input, it stores it in the current working
directory using a problem prefix like `crash-`, `mem-`, `timeout-` or the like.

This input can then be used to reproduce the issue by specifying it as last
parameter in the CLI call:

```shell
npx jazzer target crash-abcdef0123456789
```

## Value profile

Jazzer.js provides coverage and comparison feedback to the internally used
libFuzzer instance. By setting the libFuzzer flag `-use_value_profile=1` via the
CLI, new values in intercepted compares are treated as new coverage. This has
the potential to discover many additional inputs, which would not be detected
otherwise, but may reduce runtime performance significantly.

An example of using value profiling can be found at
[tests/value_profiling/fuzz.js](../tests/value_profiling/fuzz.js).

**Example invocation:**

```shell
npx jazzer target -- -use_value_profile=1
```

## Timeout

Invocations of fuzz targets, which take longer than the configured timeout, will
cause fuzzing to stop and a timeout finding to be reported. A default timeout of
5000 milliseconds is preconfigured, but can be changed using the `--timeout`
fuzzer flag.

Timeouts work in the sync- and asynchronous fuzzing mode.

**Example invocation:**

```shell
npx jazzer target --timeout=10000
```

**Example output:**

```text
ALARM: working on the last Unit for 10 seconds
       and the timeout value is 10 (use -timeout=N to change)
MS: 2 ShuffleBytes-InsertRepeatedBytes-; base unit: adc83b19e793491b1c6ea0fd8b46cd9f32e592fc
0xe3,0xe3,0xe3,0xe3,0xe3,0xe3,0xe3,0xe3,0xe3,0xe3,0xa,
\343\343\343\343\343\343\343\343\343\343\012
artifact_prefix='./'; Test unit written to ./timeout-d593b924e138abd8ec4c97afe40c408136ecabd4
Base64: 4+Pj4+Pj4+Pj4wo=
==96284== ERROR: libFuzzer: timeout after 10 seconds
SUMMARY: libFuzzer: timeout
```

## Custom Hooks

Custom hooks are useful for writing bug detectors, removing fuzzing blockers,
and improving the fuzzing process by providing feedback to the fuzzer. At low
level, custom hooks in Jazzer.js allow the user to

- replace named functions with their own (hooking nameless functions is not
  supported),
- call the original function when needed,
- read from and write to the original function's arguments,
- replace the return value of the original function.

### Enabling Custom Hooks

To enable custom hooks in Jazzer.js, add either
`-h <path_to_file_with_custom_hooks>.js` or
`--custom_hooks <path_to_file_with_custom_hooks>.js` to the project
configuration in `package.json`:

```json
"scripts": {
 "fuzz": "jazzer fuzz ... -h <path_to_file_with_custom_hooks>.js"
}
```

Several files with custom hooks can be added like this:
`-h file1.js -h file2.js`. Each of these files can contain multiple hook
definitions.

### Defining Custom Hooks

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

### Examples

Several examples showcasing the custom hooks can be found
[here](../examples/custom-hooks/custom-hooks.js).

### Debugging hooks

Debugging custom hooks can be tedious, hence the verbose logging option in
Jazzer.js allows an insight into which hooks were applied, which hooking options
are available in general, and which hooks could not be applied (e.g. due to the
hooking point not being available). Check the section
[Verbose logging](#verbose-logging) for information on how to enable this
option.

## Bug Detectors

Bug detectors are one of the key features when fuzzing memory-safe languages. In
Jazzer.js, they can detect some of the most common vulnerabilities in JavaScript
code. Built-in bug detectors are enabled by default, but can be disabled by
adding the `--disable_bug_detectors=<pattern>` flag to the project
configuration. To disable all built-in bug detectors, add
`--disable_bug_detectors='.*'` to the project configuration.

### Command Injection

Hooks all functions of the built-in module `child_process` and reports a finding
if the fuzzer was able to pass a command to any of the functions.

_Disable with:_ `--disable_bug_detectors=command-injection`, or when using Jest:

```json
{ "disableBugDetectors": ["command-injection"] }
```

### Path Traversal

Hooks all relevant functions of the built-in modules `fs` and `path` and reports
a finding if the fuzzer could pass a special path to any of the functions.

_Disable with:_ `--disable_bug_detectors=path-traversal`, or when using Jest:

```json
{ "disableBugDetectors": ["path-traversal"] }
```

### Prototype Pollution

Detects Prototype Pollution. Prototype Pollution is a vulnerability that allows
attackers to modify the prototype of a JavaScript object, which can lead to
validation bypass, denial of service and arbitrary code execution.

The Prototype Pollution bug detector can be configured in the
[custom hooks](#custom-hooks) file.

- `instrumentAssignmentsAndVariableDeclarations` - if called, the bug detector
  will instrument assignment expressions and variable declarations and report a
  finding if `__proto__` of the declared or assigned variable contains any
  properties or methods. When called in dry run mode, this option will trigger
  an error.
- `addExcludedExactMatch` - if the stringified `__proto__` equals the given
  string, the bug detector will not report a finding. This is useful to exclude
  false positives.

Here is an example configuration in the [custom hooks](#custom-hooks) file:

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

_Disable with:_ `--disable_bug_detectors=prototype-pollution`, or when using
Jest:

```json
{ "disableBugDetectors": ["prototype-pollution"] }
```

For implementation details see
[../packages/bug-detectors/internal](../packages/bug-detectors/internal).

### Writing Custom Bug Detectors

Users can write their own bug detectors using the
[custom hooks feature](#custom-hooks). Use the function `reportFinding` to
report a finding from your bug detector---it makes sure that the finding escapes
all try/catch blocks along the way and is definitely reported. Beware that
`reportFinding` will only report the first finding from any of the bug detectors
and all subsequent findings will be ignored.

## Verbose logging

To enable verbose logging in Jazzer.js, add either `-v`, or `--verbose` to the
project configuration in the respective `package.json`. Currently, this only
prints extra debug information on custom hooks (if provided).
