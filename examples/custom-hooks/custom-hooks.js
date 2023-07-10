// noinspection JSUnusedLocalSymbols
/* eslint-disable @typescript-eslint/no-var-requires,@typescript-eslint/no-unused-vars */

/*
 * Copyright 2022 Code Intelligence GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Examples showcasing the custom hooks API
 */

const {
	registerBeforeHook,
	registerReplaceHook,
	registerAfterHook,
} = require("@jazzer.js/hooking");

/**
 * An example of a bug detector hook.
 */
registerReplaceHook(
	"JpegImage.jpegImage.constructor.prototype.copyToImageData.copyToImageData",
	"jpeg-js",
	false,
	(thisPtr, params, hookId, origFn) => {
		if (params[0].data[0] === 0) {
			// we are only interested in image frames in which data[0] equals zero
			throw Error(
				"custom hook bug detector: jpeg-js: copyToImageData() is called; image.data[0] equals 0",
			);
		}
	},
);

/**
 * An example of a pass-through hook.
 * Calls the original function and returns the result without modification.
 */
registerReplaceHook(
	"JpegImage.jpegImage.constructor.prototype.parse.parse.readUint16",
	"jpeg-js",
	false,
	(thisPtr, params, hookId, origFn) => {
		return origFn.apply(null, params);
	},
);

/**
 * An example of a fuzzing-enabling hook.
 * The original function is never called.
 * The hook does nothing other than logging.
 * This can be useful for bypassing the fuzzing blockers to achieve
 * coverage of more interesting functions.
 */
registerReplaceHook(
	"JpegImage.jpegImage.buildHuffmanTable",
	"jpeg-js",
	false,
	() => {
		console.log(
			`[jpeg-js] Called custom hook instead of the original function buildHuffmanTable()`,
		);
	},
);

/**
 * Another example of a fuzzing-enabling hook.
 * The hook modifies the input (that is visible in the scope of decode() function),
 * calls the original function on modified input, and modifies it again after the original function returns.
 */
registerReplaceHook(
	"JpegImage.jpegImage.constructor.prototype.parse.parse.prepareComponents",
	"jpeg-js",
	false,
	(thisPtr, params, hookId, origFn) => {
		console.log(
			`[jpeg-js] Called custom hook instead of the original function prepareComponents()`,
		);
		const frame = params[0]; // our hooked function only has one argument: frame
		frame.scanLines = 10; // we modify the frame before calling the original function
		origFn.apply(null, [frame]); // call the original function that mutates the frame and does not return anything
		frame.scanLines = 1000; // modify the frame once again before returning
	},
);

/**
 * An example of registering a hook that is called before the original function.
 * The results of such a hook are ignored.
 */
registerBeforeHook(
	"JpegImage.jpegImage.constructor.prototype.parse.parse.readDataBlock",
	"jpeg-js",
	false,
	(thisPtr, params, hookId) => {
		console.log(
			`[jpeg-js] [before] Called hooked function before calling resetMaxMemoryUsage()`,
		);
	},
);

/**
 * An example of registering a hook that is called after the original function.
 * The return value of the original function is printed on the console by the custom hook function.
 * The return value of the custom hook function is ignored.
 */
registerAfterHook(
	"JpegImage.jpegImage.constructor.prototype.parse.parse.readDataBlock",
	"jpeg-js",
	false,
	(thisPtr, params, hookId, origFnResult) => {
		console.log(
			`[jpeg-js] [after] Called hooked function after calling resetMaxMemoryUsage() with original result ${origFnResult}`,
		);
	},
);

/**
 * An example of a hook that is not registered due to the target function being non-existent
 */
registerReplaceHook(
	"JpegImage.jpegImage.constructor.prototype.parse.parse.NonExistingFunc",
	"jpeg-js",
	false,
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	() => {},
);
