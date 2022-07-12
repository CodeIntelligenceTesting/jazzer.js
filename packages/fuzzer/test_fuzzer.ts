import { Fuzzer } from "./fuzzer";

Fuzzer.printVersion();

// Our fake fuzz target.
const fuzz = (data: Uint8Array) => {
	console.log("Fuzz target called with", data);
	// Fake a string comparison to make sure that libfuzzer hooks work.
	Fuzzer.traceUnequalStrings(42, "foo", "bar");
};

Fuzzer.startFuzzing(fuzz, ["-runs=0"]);
