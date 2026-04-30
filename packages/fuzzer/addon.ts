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

import * as fs from "fs";
import * as path from "path";

export type FuzzTargetAsyncOrValue = (
	data: Buffer,
) => unknown | Promise<unknown>;
export type FuzzTargetCallback = (
	data: Buffer,
	done: (e?: Error) => void,
) => unknown;
export type FuzzTarget = FuzzTargetAsyncOrValue | FuzzTargetCallback;
export type FuzzOpts = string[];

export type LibAflOptions = {
	mode: "fuzzing" | "regression";
	runs: number;
	seed: number;
	maxLen: number;
	timeoutMillis: number;
	maxTotalTimeSeconds: number;
	artifactPrefix: string;
	corpusDirectories: string[];
	dictionaryFiles: string[];
};

export type StartFuzzingSyncFn = (
	fuzzFn: FuzzTarget,
	fuzzOpts: FuzzOpts,
	jsStopCallback: (signal: number) => void,
) => Promise<void>;
export type StartFuzzingAsyncFn = (
	fuzzFn: FuzzTarget,
	fuzzOpts: FuzzOpts,
) => Promise<void>;
export type StartLibAflSyncFn = (
	fuzzFn: FuzzTarget,
	options: LibAflOptions,
	jsStopCallback: (signal: number) => void,
) => Promise<void>;
export type StartLibAflAsyncFn = (
	fuzzFn: FuzzTarget,
	options: LibAflOptions,
) => Promise<void>;

type NativeAddon = {
	registerCoverageMap: (buffer: Buffer) => void;
	registerNewCounters: (oldNumCounters: number, newNumCounters: number) => void;
	registerModuleCounters: (buffer: Buffer) => void;

	traceUnequalStrings: (
		hookId: number,
		current: string,
		target: string,
	) => void;

	traceStringContainment: (
		hookId: number,
		needle: string,
		haystack: string,
	) => void;
	traceIntegerCompare: (
		hookId: number,
		current: number,
		target: number,
	) => void;

	tracePcIndir: (hookId: number, state: number) => void;

	printAndDumpCrashingInput: () => void;
	printReturnInfo: (sync: boolean) => void;
	printVersion: () => void;

	startFuzzing: StartFuzzingSyncFn;
	startFuzzingAsync: StartFuzzingAsyncFn;
	startLibAfl?: StartLibAflSyncFn;
	startLibAflAsync?: StartLibAflAsyncFn;
	clearCompareFeedbackMap: () => void;
	countNonZeroCompareFeedbackSlots: () => number;
};

type LoadedAddon = NativeAddon & {
	startLibAfl: StartLibAflSyncFn;
	startLibAflAsync: StartLibAflAsyncFn;
};

function addonFilename(): string {
	let dirName: string;
	if (fs.existsSync(path.join(__dirname, "prebuilds"))) {
		dirName = path.join(__dirname, "prebuilds");
	} else if (fs.existsSync(path.join(__dirname, "..", "prebuilds"))) {
		dirName = path.join(__dirname, "..", "prebuilds");
	} else {
		throw new Error("Could not find prebuilds directory");
	}
	return path.join(dirName, `fuzzer-${process.platform}-${process.arch}.node`);
}

const loadedAddon = require(addonFilename()) as NativeAddon;

if (!loadedAddon.startLibAfl || !loadedAddon.startLibAflAsync) {
	throw new Error(
		"The native addon does not export startLibAfl/startLibAflAsync",
	);
}

export const addon: LoadedAddon = loadedAddon as LoadedAddon;
