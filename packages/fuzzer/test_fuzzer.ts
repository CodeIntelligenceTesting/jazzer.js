import { Fuzzer } from "./fuzzer";

Fuzzer.printVersion();

// Our fake fuzz target.
const fuzz = (data: Uint8Array) => {
	console.log("Fuzz target called with", data);
};

Fuzzer.startFuzzing(fuzz, ["-runs=0"]);
