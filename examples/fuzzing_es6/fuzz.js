// The code in this file is based on the examples available in JSFuzz:
// https://gitlab.com/gitlab-org/security-products/analyzers/fuzzers/jsfuzz/-/blob/34a694a8c73bfe0895c4e24784ba5b6dfe964b94/examples/jpeg/fuzz.js
// The original code is available under the Apache License 2.0.

import { FuzzedDataProvider } from "@jazzer.js/core";

/**
 * @param { Buffer } data
 */
export function fuzz(data) {
	const provider = new FuzzedDataProvider(data);
	const n1 = provider.consumeIntegral(4);
	const n2 = provider.consumeIntegral(4);

	if (n1 !== 0xdeadbeef) return;

	if (n2 !== 0xfeebdaed) return;

	const s = provider.consumeRemainingAsString();
	if (s.length !== 16) {
		return;
	}
	if (
		s.slice(0, 8) === "Awesome " &&
		s.slice(8, 15) === "Fuzzing" &&
		s[15] === "!"
	) {
		throw Error("Welcome to Awesome Fuzzing!");
	}
}
