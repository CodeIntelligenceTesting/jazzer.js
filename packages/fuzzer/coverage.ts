/*
 * Copyright 2026 Code Intelligence GmbH
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

	// Per-module counter buffers registered independently with libFuzzer.
	// We must prevent GC from reclaiming these while libFuzzer still
	// monitors the underlying memory.
	private readonly moduleCounters: Buffer[] = [];

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
					`Maximum number (${CoverageTracker.MAX_NUM_COUNTERS}) of coverage counts exceeded.`,
				);
			}
		}

		// Register new counters if enlarged
		if (newNumCounters > this.currentNumCounters) {
			addon.registerNewCounters(this.currentNumCounters, newNumCounters);
			this.currentNumCounters = newNumCounters;
			console.error(
				`INFO: New number of coverage counters ${this.currentNumCounters}`,
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

	/**
	 * Allocate an independent counter buffer for a single module and
	 * register it with libFuzzer as a new coverage region.  This lets
	 * each ESM module own its own counters without sharing global IDs.
	 */
	/**
	 * Allocate an independent counter buffer for a single ES module and
	 * register it with libFuzzer as a new coverage region.
	 *
	 * Returns `{ counters, pcBase }` — the counter buffer for the module
	 * body and the base PC to pass to `registerPCLocations`.
	 */
	createModuleCounters(size: number): { counters: Buffer; pcBase: number } {
		const buf = Buffer.alloc(size, 0);
		this.moduleCounters.push(buf);
		const pcBase = addon.registerModuleCounters(buf);
		return { counters: buf, pcBase };
	}

	/**
	 * Register edge-to-source mappings for PC symbolization.
	 *
	 * @param filename  Source file path
	 * @param funcNames Deduplicated function name table
	 * @param entries   Flat Int32Array:
	 *                  [edgeId, line, col, funcIdx, isFuncEntry, ...]
	 * @param pcBase    For ESM: the pcBase from createModuleCounters.
	 *                  For CJS: pass 0 (edge IDs are already global PCs).
	 */
	registerPCLocations(
		filename: string,
		funcNames: string[],
		entries: Int32Array,
		pcBase: number,
	): void {
		addon.registerPCLocations(filename, funcNames, entries, pcBase);
	}
}

export const coverageTracker = new CoverageTracker();
