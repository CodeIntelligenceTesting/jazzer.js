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

function incrementCounter(id: number) {
	const counter = coverageMap.readUint8(id);
	coverageMap.writeUint8(counter == 255 ? 1 : counter + 1, id);
}

function readCounter(id: number): number {
	return coverageMap.readUint8(id);
}

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
		addon.traceUnequalStrings(id, s1, s2);
	}
	return result;
}

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
};
