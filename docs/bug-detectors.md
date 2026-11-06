# Bug Detectors

Bug detectors (sometimes also called sanitizers) are one of the key features
when fuzzing memory-safe languages. In Jazzer.js, they can detect some of the
most common vulnerabilities in JavaScript code. Built-in bug detectors are
enabled by default, but can be disabled by adding the
`--disableBugDetectors=<pattern>` flag to the project configuration. To disable
all built-in bug detectors, add `--disableBugDetectors='.*'` to the project
configuration.

## Command Injection

Hooks all functions of the built-in module `child_process` and reports a finding
if the fuzzer was able to pass a command to any of the functions.

_Disable with:_ `--disableBugDetectors=command-injection` in CLI mode; or when
using Jest in `.jazzerjsrc.json`:

```json
{ "disableBugDetectors": ["command-injection"] }
```

## Path Traversal

Hooks all relevant functions of the built-in modules `fs`, `fs/promises`, and
`path` and reports a finding if the fuzzer could pass a special path to any of
the functions.

The Path Traversal bug detector can be configured in the
[custom hooks](./fuzz-settings.md#customhooks--arraystring) file.

- `ignore(rule)` - suppresses findings from callsites matching the shown stack
  excerpt.
- `stackPattern` accepts either a string or a `RegExp` and is matched against
  the shown stack excerpt after removing the leading `Error` line and Jazzer.js
  frames. The remaining stack text is matched as shown, including path
  separators and column numbers.

Here is an example configuration in the
[custom hooks](./fuzz-settings.md#customhooks--arraystring) file:

```javascript
const { getBugDetectorConfiguration } = require("@jazzer.js/bug-detectors");

getBugDetectorConfiguration("path-traversal")?.ignore({
	stackPattern: "safe-path-wrapper.js:41",
});
```

Findings also print a generic example suppression snippet. Copy/paste it and
adapt `stackPattern` to the shown stack excerpt.

_Disable with:_ `--disableBugDetectors=path-traversal` in CLI mode; or when
using Jest in `.jazzerjsrc.json`:

```json
{ "disableBugDetectors": ["path-traversal"] }
```

## Prototype Pollution

Detects Prototype Pollution. Prototype Pollution is a vulnerability that allows
attackers to modify the prototype of a JavaScript object, which can lead to
validation bypass, denial of service and arbitrary code execution.

The Prototype Pollution bug detector can be configured in the
[custom hooks](./fuzz-settings.md#customhooks--arraystring) file.

- `instrumentAssignmentsAndVariableDeclarations` - if called, the bug detector
  will instrument assignment expressions and variable declarations and report a
  finding if `__proto__` of the declared or assigned variable contains any
  properties or methods. When called in dry run mode, this option will trigger
  an error.
- `addExcludedExactMatch` - if the stringified `__proto__` equals the given
  string, the bug detector will not report a finding. This is useful to exclude
  false positives.

Here is an example configuration in the
[custom hooks](./fuzz-settings.md#customhooks--arraystring) file:

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

_Disable with:_ `--disableBugDetectors=prototype-pollution` in CLI mode; or when
using Jest in `.jazzerjsrc.json`:

```json
{ "disableBugDetectors": ["prototype-pollution"] }
```

## Code Injection

Installs a canary on the active global object and hooks the `eval` and
`Function` functions. The before-hooks guide the fuzzer toward injecting the
active canary identifier into code strings. The detector reports two fatal
stages by default:

- `Potential Code Injection (Canary Accessed)` - some code resolved the canary.
  This high-recall heuristic catches cases where dynamically produced code reads
  or stores the canary before executing it later.
- `Confirmed Code Injection (Canary Invoked)` - the callable canary returned by
  the getter was invoked.

The detector can be configured in the
[custom hooks](./fuzz-settings.md#customhooks--arraystring) file.

- `disableAccessReporting` - disables the stage-1 access finding while keeping
  invocation reporting active.
- `disableInvocationReporting` - disables the stage-2 invocation finding.
- `ignoreAccess(rule)` - suppresses stage-1 findings matching the shown stack
  excerpt.
- `ignoreInvocation(rule)` - suppresses stage-2 findings matching the shown
  stack excerpt.
- `stackPattern` accepts either a string or a `RegExp` and is matched against
  the shown stack excerpt after removing the leading `Error` line and Jazzer.js
  frames. The remaining stack text is matched as shown, including path
  separators and column numbers.

The detector must be able to install a canary on at least one active global
object. Locked-down environments that forbid this should disable the detector
explicitly.

Here is an example configuration in the
[custom hooks](./fuzz-settings.md#customhooks--arraystring) file:

```javascript
const { getBugDetectorConfiguration } = require("@jazzer.js/bug-detectors");

getBugDetectorConfiguration("code-injection")
	?.ignoreAccess({
		stackPattern: "handlebars/runtime.js:87",
	})
	?.disableInvocationReporting();
```

Findings print a generic example suppression snippet. Copy/paste it and adapt
`stackPattern` to a stable substring or `RegExp` from the shown stack.

_Disable with:_ `--disableBugDetectors=code-injection` in CLI mode; or when
using Jest in `.jazzerjsrc.json`:

```json
{ "disableBugDetectors": ["code-injection"] }
```

## Server-Side Request Forgery (SSRF)

Reports a finding upon detection of outgoing communication that originates from
the built-in libraries `net`, `tls`, `http`, `http/2`, `https`, and `dgram`.

_Configuration:_ Permitted TCP and UDP connections can be configured in the
[custom hooks](./fuzz-settings.md#customhooks--arraystring) file.

```javascript
const { getBugDetectorConfiguration } = require("@jazzer.js/bug-detectors");

getBugDetectorConfiguration("ssrf")
	?.addPermittedTCPConnection("localhost", 8080)
	.addPermittedUDPConnection("localhost", 9090);
```

_Disable with:_ `--disableBugDetectors=ssrf` in CLI mode; or when using Jest in
`.jazzerjsrc.json`:

```json
{ "disableBugDetectors": ["ssrf"] }
```

For implementation details see
[../packages/bug-detectors/internal](../packages/bug-detectors/internal).

## Writing Custom Bug Detectors

Users can write their own bug detectors using the
[custom hooks feature](./fuzz-settings.md#customhooks--arraystring). Use the
function `reportFinding` to report a finding from your bug detector---it makes
sure that the finding escapes all try/catch blocks along the way and is
definitely reported. Beware that `reportFinding` will only report the first
finding from any of the bug detectors and all subsequent findings will be
ignored.
