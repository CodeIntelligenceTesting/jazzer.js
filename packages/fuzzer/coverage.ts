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

export class CoverageTracker {
	private static readonly MAX_NUM_COUNTERS: number = 1 << 20;
	private static readonly INITIAL_NUM_COUNTERS: number = 1 << 9;
	private readonly coverageMap: Buffer;
	private currentNumCounters: number;

	constructor() {
		this.coverageMap = Buffer.alloc(CoverageTracker.MAX_NUM_COUNTERS, 0);
		this.currentNumCounters = CoverageTracker.INITIAL_NUM_COUNTERS;
		addon.registerCoverageMap(this.coverageMap);
		addon.registerNewCounters(0, this.currentNumCounters);
	}

	enlargeCountersBufferIfNeeded(nextEdgeId: number) {
		// Enlarge registered counters if needed
		let newNumCounters = this.currentNumCounters;
		while (nextEdgeId >= newNumCounters) {
			newNumCounters = 2 * newNumCounters;
			if (newNumCounters > CoverageTracker.MAX_NUM_COUNTERS) {
				throw new Error(
					`Maximum number (${CoverageTracker.MAX_NUM_COUNTERS}) of coverage counts exceeded.`
				);
			}
		}

		// Register new counters if enlarged
		if (newNumCounters > this.currentNumCounters) {
			addon.registerNewCounters(this.currentNumCounters, newNumCounters);
			this.currentNumCounters = newNumCounters;
			console.log(
				`INFO: New number of coverage counters ${this.currentNumCounters}`
			);
		}
	}

	/**
	 * Increments the coverage counter for a given ID.
	 * This function implements the NeverZero policy from AFL++.
	 * See https://aflplus.plus//papers/aflpp-woot2020.pdf
	 * @param edgeId the edge ID of the coverage counter to increment
	 */
	incrementCounter(edgeId: number) {
		const counter = this.coverageMap.readUint8(edgeId);
		this.coverageMap.writeUint8(counter == 255 ? 1 : counter + 1, edgeId);
	}

	readCounter(edgeId: number): number {
		return this.coverageMap.readUint8(edgeId);
	}
}
