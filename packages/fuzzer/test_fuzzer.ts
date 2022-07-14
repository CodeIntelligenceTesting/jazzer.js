import { Fuzzer } from "./fuzzer";

Fuzzer.printVersion();

// Our fake fuzz target.
export function fuzz(data: Uint8Array) {
	const s = data.toString();
	// console.log("Fuzz target called with", s);
	// Fake a string comparison to make sure that libfuzzer hooks work.
	if (s.length > 3) {
		if (s.slice(0, 3) === "bar") {
			throw Error('Found "bar"!');
		}
	}
}
