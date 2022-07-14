import { default as bind } from "bindings";

const addon = bind("fuzzy-eagle");

const MAX_NUM_COUNTERS: number = 1 << 20;
const INITIAL_NUM_COUNTERS: number = 1 << 9;
const coverageMap = Buffer.alloc(MAX_NUM_COUNTERS, 0);

addon.registerCoverageMap(coverageMap);
addon.registerNewCounters(0, INITIAL_NUM_COUNTERS);

let currentNumCounters = INITIAL_NUM_COUNTERS;
let currentCounter = 0;

export function nextCounter(): number {
	currentCounter++;

	// Enlarge registered counters if needed
	let newNumCounters = currentNumCounters;
	while (currentCounter >= newNumCounters) {
		newNumCounters = 2 * newNumCounters;
		if (newNumCounters > MAX_NUM_COUNTERS) {
			throw new Error(
				`Maximum number (${MAX_NUM_COUNTERS}) of coverage counts exceeded.`
			);
		}
	}

	// Register new counters if enlarged
	if (newNumCounters > currentNumCounters) {
		addon.registerNewCounters(currentNumCounters, newNumCounters);
		currentNumCounters = newNumCounters;
		console.log(`INFO: New number of coverage counters ${currentNumCounters}`);
	}
	return currentCounter;
}

export function incrementCounter(id: number) {
	const counter = coverageMap.readUint8(id);
	coverageMap.writeUint8(counter == 255 ? 1 : counter + 1, id);
}

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
		addon.traceUnequalStrings(42, s1, s2);
	}
	return result;
}

// Re-export everything from the native library.
export type FuzzFn = (data: Uint8Array) => void;
export type FuzzOpts = string[];

export const Fuzzer = {
	printVersion: addon.printVersion as () => void,
	startFuzzing: addon.startFuzzing as (
		fuzzFn: FuzzFn,
		fuzzOpts: FuzzOpts
	) => void,
	nextCounter,
	traceStrCmp,
	incrementCounter,
};
