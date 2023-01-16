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

import { addon } from "./addon";

const MAX_NUM_COUNTERS: number = 1 << 20;
const INITIAL_NUM_COUNTERS: number = 1 << 9;
let coverageMap: Buffer;
let currentNumCounters: number;

export function initializeCounters() {
	coverageMap = Buffer.alloc(MAX_NUM_COUNTERS, 0);
	addon.registerCoverageMap(coverageMap);
	addon.registerNewCounters(0, INITIAL_NUM_COUNTERS);
	currentNumCounters = INITIAL_NUM_COUNTERS;
}

export function enlargeCountersBufferIfNeeded(nextEdgeId: number) {
	// Enlarge registered counters if needed
	let newNumCounters = currentNumCounters;
	while (nextEdgeId >= newNumCounters) {
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
}

/**
 * Increments the coverage counter for a given ID.
 * This function implements the NeverZero policy from AFL++.
 * See https://aflplus.plus//papers/aflpp-woot2020.pdf
 * @param edgeId the edge ID of the coverage counter to increment
 */
export function incrementCounter(edgeId: number) {
	const counter = coverageMap.readUint8(edgeId);
	coverageMap.writeUint8(counter == 255 ? 1 : counter + 1, edgeId);
}

export function readCounter(edgeId: number): number {
	return coverageMap.readUint8(edgeId);
}
