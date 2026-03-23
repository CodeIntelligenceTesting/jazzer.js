/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
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

export type StartFuzzingSyncFn = (
	fuzzFn: FuzzTarget,
	fuzzOpts: FuzzOpts,
	jsStopCallback: (signal: number) => void,
) => Promise<void>;
export type StartFuzzingAsyncFn = (
	fuzzFn: FuzzTarget,
	fuzzOpts: FuzzOpts,
) => Promise<void>;

type NativeAddon = {
	registerCoverageMap: (buffer: Buffer) => void;
	registerNewCounters: (oldNumCounters: number, newNumCounters: number) => void;

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

export const addon: NativeAddon = require(addonFilename());
