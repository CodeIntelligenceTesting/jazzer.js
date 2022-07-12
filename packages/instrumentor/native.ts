/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */

// TODO When we add out-of-process fuzzing, we need to conditionally require either the libfuzzer module or the native agent, depending on whether we're doing in-process or out-of-process fuzzing.
import { Fuzzer } from "@fuzzy-eagle/fuzzer";

// TODO: Pass request for next counter to native plugin
let counter = 0;
export function nextCounter(): number {
	return counter++;
}

// TODO: incrementCounter applies the never-zero policy
export function incrementCounter(id: number) {}

export function traceStrCmp(s1: string, s2: string, operator: string): boolean {
	let result = false;
	let shouldCallLibfuzzer = false;
	switch (operator) {
		case "==":
			result = s1 == s2;
			shouldCallLibfuzzer = !result;
			break;
		case "===":
			result = s1 === s2;
			shouldCallLibfuzzer = !result;
			break;
		case "!=":
			result = s1 != s2;
			shouldCallLibfuzzer = result;
			break;
		case "!==":
			result = s1 !== s2;
			shouldCallLibfuzzer = result;
			break;
	}
	if (shouldCallLibfuzzer) {
		// TODO Pass a proper site ID.
		Fuzzer.traceUnequalStrings(42, s1, s2);
	}
	return result;
}
