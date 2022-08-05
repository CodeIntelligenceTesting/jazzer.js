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
 */

import { default as bind } from "bindings";

const addon = bind("jazzerjs");

const MAX_NUM_COUNTERS: number = 1 << 20;
const INITIAL_NUM_COUNTERS: number = 1 << 9;
const coverageMap = Buffer.alloc(MAX_NUM_COUNTERS, 0);

addon.registerCoverageMap(coverageMap);
addon.registerNewCounters(0, INITIAL_NUM_COUNTERS);

let currentNumCounters = INITIAL_NUM_COUNTERS;
let currentCounter = 0;

// Returns the next counter id to use for edge coverage.
// If needed, the coverage map is enlarged.
function nextCounter(): number {
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

/**
 * Increments the coverage counter for a given ID.
 * This function implements the NeverZero policy from AFL++.
 * See https://aflplus.plus//papers/aflpp-woot2020.pdf
 * @param id the id of the coverage counter to increment
 */
function incrementCounter(id: number) {
	const counter = coverageMap.readUint8(id);
	coverageMap.writeUint8(counter == 255 ? 1 : counter + 1, id);
}

function readCounter(id: number): number {
	return coverageMap.readUint8(id);
}

/**
 * Performs a string comparison between two strings and calls the corresponding native hook if needed.
 * This function replaces the original comparison expression and preserves the semantics by returning
 * the original result after calling the native hook.
 * @param s1 first compared string
 * @param s2 second compared string
 * @param operator the operator used in the comparison
 * @param id an unique identifier to distinguish between the different comparisons
 * @returns result of the comparison
 */
function traceStrCmp(
	s1: string,
	s2: string,
	operator: string,
	id: number
): boolean {
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
	if (shouldCallLibfuzzer && s1 && s2) {
		guideTowardsEquality(s1, s2, id);
	}
	return result;
}

/**
 * Performs an integer comparison between two strings and calls the corresponding native hook if needed.
 * This function replaces the original comparison expression and preserves the semantics by returning
 * the original result after calling the native hook.
 * @param n1 first compared number
 * @param n2 second compared number
 * @param operator the operator used in the comparison
 * @param id an unique identifier to distinguish between the different comparisons
 * @returns result of the comparison
 */
function traceNumberCmp(
	n1: number,
	n2: number,
	operator: string,
	id: number
): boolean {
	if (Number.isInteger(n1) && Number.isInteger(n2)) {
		addon.traceIntegerCompare(id, n1, n2);
	}
	switch (operator) {
		case "==":
			return n1 == n2;
		case "===":
			return n1 === n2;
		case "!=":
			return n1 != n2;
		case "!==":
			return n1 !== n2;
		case ">":
			return n1 > n2;
		case ">=":
			return n1 >= n2;
		case "<":
			return n1 < n2;
		case "<=":
			return n1 <= n2;
		default:
			throw `unexpected number comparison operator ${operator}`;
	}
}

function traceAndReturn(current: unknown, target: unknown, id: number) {
	switch (typeof target) {
		case "number":
			if (typeof current === "number") {
				if (Number.isInteger(current) && Number.isInteger(target)) {
					addon.traceNumberCmp(id, current, target);
				}
			}
			break;
		case "string":
			if (typeof current === "string") {
				guideTowardsEquality(current, target, id);
			}
	}
	return target;
}

/**
 * Instructs the fuzzer to guide its mutations towards making `current` equal to `target`
 *
 * If the relation between the raw fuzzer input and the value of `current` is relatively
 * complex, running the fuzzer with the argument `-use_value_profile=1` may be necessary to
 * achieve equality.
 *
 * @param current a non-constant string observed during fuzz target execution
 * @param target a string that `current` should become equal to, but currently isn't
 * @param id a (probabilistically) unique identifier for this particular compare hint
 */
export function guideTowardsEquality(
	current: string,
	target: string,
	id: number
) {
	addon.traceUnequalStrings(id, current, target);
}

/**
 * Instructs the fuzzer to guide its mutations towards making `haystack` contain `needle` as a substring.
 *
 * If the relation between the raw fuzzer input and the value of `haystack` is relatively
 * complex, running the fuzzer with the argument `-use_value_profile=1` may be necessary to
 * satisfy the substring check.
 *
 * @param haystack a non-constant string observed during fuzz target execution
 * @param needle a string that should be contained in `haystack` as a substring, but
 *     currently isn't
 * @param id a (probabilistically) unique identifier for this particular compare hint
 */
export function guideTowardsContainment(
	needle: string,
	haystack: string,
	id: number
) {
	addon.traceStringContainment(id, needle, haystack);
}

/**
 * Instructs the fuzzer to attain as many possible values for the absolute value of `state`
 * as possible.
 *
 * Call this function from a fuzz target or a hook to help the fuzzer track partial progress
 * (e.g. by passing the length of a common prefix of two lists that should become equal) or
 * explore different values of state that is not directly related to code coverage.
 *
 * Note: This hint only takes effect if the fuzzer is run with the argument
 * `-use_value_profile=1`.
 *
 * @param state a numeric encoding of a state that should be varied by the fuzzer
 * @param id a (probabilistically) unique identifier for this particular state hint
 */
export function exploreState(state: number, id: number) {
	addon.tracePcIndir(id, state);
}

// Re-export everything from the native library.
export type FuzzFn = (data: Uint8Array) => void;
export type FuzzOpts = string[];

export interface Fuzzer {
	printVersion: () => void;
	startFuzzing: (fuzzFn: FuzzFn, fuzzOpts: FuzzOpts) => void;
	nextCounter: typeof nextCounter;
	incrementCounter: typeof incrementCounter;
	readCounter: typeof readCounter;
	traceStrCmp: typeof traceStrCmp;
	traceNumberCmp: typeof traceNumberCmp;
	traceAndReturn: typeof traceAndReturn;
}

export const fuzzer: Fuzzer = {
	printVersion: addon.printVersion as () => void,
	startFuzzing: addon.startFuzzing as (
		fuzzFn: FuzzFn,
		fuzzOpts: FuzzOpts
	) => void,
	nextCounter,
	incrementCounter,
	readCounter,
	traceStrCmp,
	traceNumberCmp,
	traceAndReturn,
};

export interface Jazzer {
	guideTowardsEquality: typeof guideTowardsEquality;
	guideTowardsContainment: typeof guideTowardsContainment;
	exploreState: typeof exploreState;
}

export const jazzer: Jazzer = {
	guideTowardsEquality,
	guideTowardsContainment,
	exploreState,
};
