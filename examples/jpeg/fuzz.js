// The code in this file is based on the examples available in JSFuzz:
// https://gitlab.com/gitlab-org/security-products/analyzers/fuzzers/jsfuzz/-/blob/34a694a8c73bfe0895c4e24784ba5b6dfe964b94/examples/jpeg/fuzz.js
// The original code is available under the Apache License 2.0.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jpeg = require("jpeg-js");

function fuzz(buf) {
	try {
		jpeg.decode(buf);
	} catch (error) {
		// Those are "valid" exceptions. we can't catch them in one line as
		// jpeg-js doesn't export/inherit from one exception class/style.
		if (!expectedError(error)) throw error;
	}
}

function expectedError(error) {
	return !!expected.find((message) => error.message.indexOf(message) !== -1);
}

const expected = [
	"JPEG",
	"length octect",
	"Failed to",
	"DecoderBuffer",
	"invalid table spec",
	"SOI not found",
];

module.exports = {
	fuzz,
};
