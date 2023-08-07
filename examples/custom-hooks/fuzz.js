/*
 * Copyright 2023 Code Intelligence GmbH
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
 */

// The code in this file is based on the examples available in JSFuzz:
// https://gitlab.com/gitlab-org/security-products/analyzers/fuzzers/jsfuzz/-/blob/34a694a8c73bfe0895c4e24784ba5b6dfe964b94/examples/jpeg/fuzz.js
// The original code is available under the Apache License 2.0.

const jpeg = require("jpeg-js");

/**
 * @param { Buffer } data
 */
module.exports.fuzz = function (data) {
	try {
		// no changes to the fuzz target are necessary when using custom hooks
		jpeg.decode(data);
	} catch (error) {
		// Those are "valid" exceptions. we can't catch them in one line as
		// jpeg-js doesn't export/inherit from one exception class/style.
		if (!ignoredError(error)) throw error;
	}
};

function ignoredError(error) {
	return !!ignored.find((message) => error.message.indexOf(message) !== -1);
}

const ignored = [
	"JPEG",
	"length octect",
	"Failed to",
	"DecoderBuffer",
	"invalid table spec",
	"SOI not found",
	"maxResolutionInMP limit exceeded by",
	"Invalid sampling factor, expected values above 0",
	"Could not recreate Huffman Table",
	"Cannot read properties of undefined",
	"Cannot set properties of undefined",
	"maxMemoryUsageInMB limit exceeded by at least",
	"unexpected marker",
	"marker was not found",
	"Unsupported color mode",
];
