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

import { coverageTracker, CoverageTracker } from "./coverage";
import { tracer, Tracer } from "./trace";
import { addon } from "./addon";

export type {
	FuzzTarget,
	FuzzTargetAsyncOrValue,
	FuzzTargetCallback,
} from "./addon";

export interface Fuzzer {
	coverageTracker: CoverageTracker;
	tracer: Tracer;
	startFuzzing: typeof addon.startFuzzing;
	startFuzzingAsync: typeof addon.startFuzzingAsync;
	stopFuzzingAsync: typeof addon.stopFuzzingAsync;
	stopFuzzing: typeof addon.stopFuzzing;
}

export const fuzzer: Fuzzer = {
	coverageTracker: coverageTracker,
	tracer: tracer,
	startFuzzing: addon.startFuzzing,
	startFuzzingAsync: addon.startFuzzingAsync,
	stopFuzzingAsync: addon.stopFuzzingAsync,
	stopFuzzing: addon.stopFuzzing,
};

export type { CoverageTracker } from "./coverage";
export type { Tracer } from "./trace";
