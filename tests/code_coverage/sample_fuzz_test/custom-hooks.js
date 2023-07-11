const { registerReplaceHook } = require("@jazzer.js/hooking");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
registerReplaceHook("foo", "lib", false, (thisPtr, params, hookId, origFn) => {
	console.log("CUSTOM HOOKS CALLED!");
});
