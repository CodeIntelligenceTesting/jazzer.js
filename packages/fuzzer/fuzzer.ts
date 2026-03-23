/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import { addon } from "./addon";
import { CoverageTracker, coverageTracker } from "./coverage";
import { Tracer, tracer } from "./trace";

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
	printAndDumpCrashingInput: typeof addon.printAndDumpCrashingInput;
	printReturnInfo: typeof addon.printReturnInfo;
}

export const fuzzer: Fuzzer = {
	coverageTracker: coverageTracker,
	tracer: tracer,
	startFuzzing: addon.startFuzzing,
	startFuzzingAsync: addon.startFuzzingAsync,
	printAndDumpCrashingInput: addon.printAndDumpCrashingInput,
	printReturnInfo: addon.printReturnInfo,
};

export type { CoverageTracker } from "./coverage";
export type { Tracer } from "./trace";
