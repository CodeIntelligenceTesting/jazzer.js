/*
 * Copyright 2023 Code Intelligence GmbH
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

const MAX_NUM_COUNTERS: number = 1 << 20;
const INITIAL_NUM_COUNTERS: number = 1 << 9;
let coverageMap: Buffer;
let currentNumCounters: number;
let nextEdgeID = 0;

type NativeAddon = {
	registerCoverageMap: (buffer: Buffer) => void;
	registerNewCounters: (oldNumCounters: number, newNumCounters: number) => void;
};

let nativeAddon: NativeAddon;

export function initializeCounters(addon: NativeAddon) {
	coverageMap = Buffer.alloc(MAX_NUM_COUNTERS, 0);
	addon.registerCoverageMap(coverageMap);
	addon.registerNewCounters(0, INITIAL_NUM_COUNTERS);
	currentNumCounters = INITIAL_NUM_COUNTERS;
	nativeAddon = addon;
}

export function enlargeCountersBufferIfNeeded(nextEdgeID: number) {
	// Enlarge registered counters if needed
	let newNumCounters = currentNumCounters;
	while (nextEdgeID >= newNumCounters) {
		newNumCounters = 2 * newNumCounters;
		if (newNumCounters > MAX_NUM_COUNTERS) {
			throw new Error(
				`Maximum number (${MAX_NUM_COUNTERS}) of coverage counts exceeded.`
			);
		}
	}

	// Register new counters if enlarged
	if (newNumCounters > currentNumCounters) {
		nativeAddon.registerNewCounters(currentNumCounters, newNumCounters);
		currentNumCounters = newNumCounters;
		console.log(`INFO: New number of coverage counters ${currentNumCounters}`);
	}
}

// Returns the next counter id to use for edge coverage.
// If needed, the coverage map is enlarged.
export function nextCounter(): number {
	enlargeCountersBufferIfNeeded(nextEdgeID);
	return nextEdgeID++;
}

/**
 * Increments the coverage counter for a given ID.
 * This function implements the NeverZero policy from AFL++.
 * See https://aflplus.plus//papers/aflpp-woot2020.pdf
 * @param id the id of the coverage counter to increment
 */
export function incrementCounter(id: number) {
	const counter = coverageMap.readUint8(id);
	coverageMap.writeUint8(counter == 255 ? 1 : counter + 1, id);
}

export function readCounter(id: number): number {
	return coverageMap.readUint8(id);
}
