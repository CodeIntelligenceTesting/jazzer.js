# Bug Detector Development API

Jazzer.js provides several tools for writing bug detectors.

## Hooking library functions

```typescript
const {
    registerAfterHook,
    registerBeforeHook,
    registerReplaceHook
} = require("@jazzer.js/core");
registerBeforeHook(target: string, pkg: string, async: boolean, hookFn: HookFn)
registerReplaceHook(target: string, pkg: string, async: boolean, hookFn: HookFn)
registerAfterHook(target: string, pkg: string, async: boolean, hookFn: HookFn)
```

## Adding before/after callbacks to the fuzz function

```typescript
import { registerAfterEachCallback,registerBeforeEachCallback } from "@jazzer.js/core";
registerAfterEachCallback(callback: () => void)
registerBeforeEachCallback(callback: () => void)
```

These functions can be used to add callback functions that will always be
executed before/after each fuzz test.

## Adding instrumentation plugins

```typescript
import { registerInstrumentationPlugin } from "@jazzer.js/core";
registerInstrumentationPlugin(plugin: () => PluginTarget)
```

This function allows addition of instrumentation plugins to Jazzer.js. It
expects a function that returns a `PluginTarget` from `"@babel/core"`. For an
example of how to write an instrumentation plugin, see the
[Prototype Pollution](internal/prototype-pollution.ts) bug detector and the
[Jazzer.js instrumentation plugins](../instrumentor/plugins/).

### Instrumentation guard

To prevent endless loops because of instrumentation plugins adding statements
and expressions to the code and reinstrumenting them again, use the
`instrumentationGuard` to add values that should not be instrumented again:

```typescript
import { instrumentationGuard } from "@jazzer.js/core";
instrumentationGuard.add(tag: string, value: NodePath);
instrumentationGuard.has(tag: string, value: NodePath);
```

The `tag` is a string that identifies the type of the value. For example, the
prototype pollution bug detector uses the tags `'AssignmentExpression'` and
`'VariableDeclaration'` to avoid endless loops introduced by the visotors of
`AssignmentExpression` and `VariableDeclaration`, since both visitors introduce
a new variable declarations each that should not be instrumented by the other
visitor.

Here are some examples of how the instrumentation guard is used in the prototype
pollution bug detector:

```typescript
import { instrumentationGuard } from "@jazzer.js/core";

// Don't instrument if the node has been added to the guard before.
if (instrumentationGuard.has("AssignmentExpression", path.node)) {
	return;
}

// Add the node to the guard to prevent endless loops.
instrumentationGuard.add("AssignmentExpression", path.node);

// Generate a new variable declaration.
const resultDeclarator = types.variableDeclarator(
	result,
	JSON.parse(JSON.stringify(path.node)),
);

// Make sure the added variable declaration is not instrumented again.
instrumentationGuard.add("VariableDeclaration", resultDeclarator);
```

## Guiding the fuzzing process

Import the guiding functions from the `@jazzer.js/core` package:

```typescript
import {
	guideTowardsEquality,
	guideTowardsContainment,
	exploreState,
} from "@jazzer.js/core";
```

There are several ways to guide the fuzzing process:

- ```typescript
  guideTowardsEquality(current: string, target: string, id: number)
  ```

  Instructs the fuzzer to guide its mutations towards making `current` equal to
  `target`.

- ```typescript
    guideTowardsContainment(needle: string, haystack: string, id: number)
  ```

  Instructs the fuzzer to guide its mutations towards making `haystack` contain
  `needle` as a substring.

- ```typescript
    exploreState(state: number, id: number)
  ```

  Instructs the fuzzer to attain as many possible values for the absolute value
  of `state` as possible.

## Dictionary based mutations

Whenever adding the above guiding functions is not feasible, add values specific
to your bug detector to a dictionary. The dictionary is used by the fuzzer just
like any other mutator, which means that the fuzzer will occasionally take
values from the dictionary and replace parts of the whole input with it. The
syntax used by the dictionary is documented
[here](https://llvm.org/docs/LibFuzzer.html#dictionaries).

- ```typescript
      addDictionary(...libFuzzerDictionary: string[])
  ```

## Report findings

To report a finding, use the `reportFinding` function from `@jazzer.js/core`:

```typescript
import { reportFinding } from "@jazzer.js/core";
reportFinding(findingMessage: string)
```

This function escapes the try/catch blocks and makes sure that the finding will
be reported by the fuzzer.

## Allow users to configure bug detectors

A bug detector can be made configurable by adding a configuration class to the
configuration map `bugDetectorConfigurations` in
`@jazzer.js/bug-detectors/configurations.ts`:

```typescript
import { bugDetectorConfigurations } from "@jazzer.js/bug-detectors";
// alternatively:
// import { bugDetectorConfigurations } from "../configurations";
// if your bug detector is in the `internal` subfolder of the `bug-detectors` package
const config: <MyBugDetectorConfig> = new <MyBugDetectorConfig>();
bugDetectorConfigurations.set("<your bug detector name>", config);
```

See the `PrototypePollutionConfig` in
[Prototype Pollution](internal/prototype-pollution.ts) bug detector for an
example.

## Accessing the global context in Jest tests

If the bug detectors need to access objects in the global context, they have to
take special care for Jest tests. Internally Jest runs the tests using
`vm.runInContext()`. Thus, the global objects (e.g. `Object`, `Array`,
`Function`, etc.) used in that context are not the same (as in "by reference")
as the ones used by the bug detectors. To deal with this, the bug detectors can
access the `vmContext` object, from which global objects can be accessed as
follows:

```typescript
import * as vm from "vm";
const vmContext = getJazzerJsGlobal("vmContext") as vm.Context;
```

Objects from the VM context can be extracted as follows:

```typescript
BASIC_OBJECTS = vm.runInContext('[{},[],"",42,true,()=>{}]', vmContext);
```
