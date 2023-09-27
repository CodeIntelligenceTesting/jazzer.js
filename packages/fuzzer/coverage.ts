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
    private static readonly MAX_NUM_COUNTERS: number = 1048576; // 1 << 20
    private static readonly INITIAL_NUM_COUNTERS: number = 512; // 1 << 9
    private readonly coverageMap: number[]; // Using an array instead of a Buffer
    private currentNumCounters: number;

    constructor() {
        this.coverageMap = new Array(CoverageTracker.MAX_NUM_COUNTERS).fill(0);
        this.currentNumCounters = CoverageTracker.INITIAL_NUM_COUNTERS;
        this.registerCoverageMap();
        this.registerNewCounters(0, this.currentNumCounters);
    }

    private registerCoverageMap() {
        // Simulating addon.registerCoverageMap(this.coverageMap);
        console.log('Coverage map registered.');
    }

    private registerNewCounters(start: number, end: number) {
        // Simulating addon.registerNewCounters(start, end);
        console.log(`New counters registered from ${start} to ${end}.`);
    }

    enlargeCountersBufferIfNeeded(nextEdgeId: number) {
        let newNumCounters = this.currentNumCounters;
        while (nextEdgeId >= newNumCounters) {
            newNumCounters *= 2;
            if (newNumCounters > CoverageTracker.MAX_NUM_COUNTERS) {
                throw new Error(
                    `Maximum number (${CoverageTracker.MAX_NUM_COUNTERS}) of coverage counts exceeded.`,
                );
            }
        }

        if (newNumCounters > this.currentNumCounters) {
            this.registerNewCounters(this.currentNumCounters, newNumCounters);
            this.currentNumCounters = newNumCounters;
            console.log(`INFO: New number of coverage counters ${this.currentNumCounters}`);
        }
    }

    incrementCounter(edgeId: number) {
        const counter = this.coverageMap[edgeId];
        this.coverageMap[edgeId] = counter === 255 ? 1 : counter + 1;
    }

    readCounter(edgeId: number): number {
        return this.coverageMap[edgeId];
    }
}

export const coverageTracker = new CoverageTracker();
