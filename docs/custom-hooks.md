# Custom Hooks

Custom hooks allow users to hook functions in built-in libraries, libraries
loaded at runtime, or functions in global scope. Custom hooks are useful for
writing bug detectors, removing fuzzing blockers, and improving the fuzzing
process by providing additional feedback to the fuzzer.

## Defining Custom Hooks

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

## Examples

Several examples showcasing the custom hooks can be found in
[../examples/custom-hooks/custom-hooks.js](../examples/custom-hooks/custom-hooks.js).

## Debugging Custom Hooks

Enable the [`verbose`](./fuzz-settings.md#verbose--boolean) option and Jazzer.js
will print (among other things) which hooks were applied, which hook functions
are available in general, and which hooks could not be applied.
