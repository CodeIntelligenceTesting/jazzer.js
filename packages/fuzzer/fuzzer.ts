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

import { addon, StartFuzzingAsyncFn, StartFuzzingSyncFn } from "./addon";
import {
	incrementCounter,
	initializeCounters,
	readCounter,
	enlargeCountersBufferIfNeeded,
} from "./coverage";
import { traceAndReturn, traceNumberCmp, traceStrCmp } from "./trace";

initializeCounters();

export type {
	FuzzTarget,
	FuzzTargetAsyncOrValue,
	FuzzTargetCallback,
} from "./addon";

export { addon } from "./addon";

export interface Fuzzer {
	printVersion: () => void;
	startFuzzing: StartFuzzingSyncFn;
	startFuzzingAsync: StartFuzzingAsyncFn;
	stopFuzzingAsync: (status?: number) => void;
	incrementCounter: typeof incrementCounter;
	readCounter: typeof readCounter;
	traceStrCmp: typeof traceStrCmp;
	traceNumberCmp: typeof traceNumberCmp;
	traceAndReturn: typeof traceAndReturn;
	enlargeCountersBufferIfNeeded: typeof enlargeCountersBufferIfNeeded;
}

export const fuzzer: Fuzzer = {
	printVersion: addon.printVersion,
	startFuzzing: addon.startFuzzing,
	startFuzzingAsync: addon.startFuzzingAsync,
	stopFuzzingAsync: addon.stopFuzzingAsync,
	incrementCounter,
	readCounter,
	traceStrCmp,
	traceNumberCmp,
	traceAndReturn,
	enlargeCountersBufferIfNeeded,
};
