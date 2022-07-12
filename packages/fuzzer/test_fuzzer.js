/* eslint @typescript-eslint/no-var-requires: "off" */
const fuzzer = require("./fuzzer");

fuzzer.printVersion();

// Our fake fuzz target.
const fuzz = (data) => {
	console.log("Fuzz target called with", data);
	// Fake a string comparison to make sure that libfuzzer hooks work.
	fuzzer.traceUnequalStrings(42, "foo", "bar");
};

fuzzer.startFuzzing(fuzz, ["-runs=0"]);
