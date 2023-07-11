const { registerReplaceHook } = require("@jazzer.js/hooking");

registerReplaceHook("foo", "lib", false, () => {
	console.log("CUSTOM HOOKS CALLED!");
});
