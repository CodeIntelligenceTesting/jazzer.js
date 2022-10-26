// This example showcases the custom hooks API
//
// buildHuffmanTable() gets called quite often and only logs to console from time to time,
// skipping the call to the original function.
// copyToImageData() gets called eventually and causes an error.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerHook, HookType } = require("@jazzer.js/hooking");

registerHook(
	HookType.Replace,
	"JpegImage.jpegImage.buildHuffmanTable",
	"jpeg-js",
	false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	(thisPtr, params, hookId, origFn) => {
		let n_executions = 0;
		return () => {
			if (n_executions % 100 === 0) {
				console.log(
					`[jpeg-js] Called custom hook instead of the original function buildHuffmanTable() (${n_executions} executions so far)`
				);
				// the original function arguments "codeLengths" and "values" are available
			}
			n_executions++;
		};
	}
);

registerHook(
	HookType.Replace,
	"JpegImage.jpegImage.constructor.prototype.copyToImageData.copyToImageData",
	"jpeg-js",
	false,
	() => {
		console.log(
			"[jpeg-js] Called hooked function instead of the original function copyToImageData()"
		);
		// the arguments "codeLengths" and "values" can be accessed to further
		throw Error("jpeg-js: copyToImageData() is called");
	}
);
