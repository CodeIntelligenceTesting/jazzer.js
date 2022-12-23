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

import * as fuzzer from "@jazzer.js/fuzzer";
import * as hooking from "@jazzer.js/hooking";
import { registerInstrumentor } from "@jazzer.js/instrumentor";

export interface Options {
	fuzzTarget: string;
	fuzzFunction: string;
	includes: string[];
	excludes: string[];
	dryRun: boolean;
	sync: boolean;
	fuzzerOptions: string[];
	customHooks: string[];
}

interface FuzzTarget {
	[fuzzFunction: string]: fuzzer.FuzzFn;
}

/* eslint no-var: 0 */
declare global {
	var Fuzzer: fuzzer.Fuzzer;
	var HookManager: hooking.HookManager;
}

export function registerGlobals() {
	globalThis.Fuzzer = fuzzer.fuzzer;
	//TODO make sure that all sanitizers are registered at this point
	globalThis.HookManager = hooking.hookManager;
}

export async function initFuzzing(options: Options) {
	registerGlobals();

	await Promise.all(options.customHooks.map(importModule));

	if (!options.dryRun) {
		registerInstrumentor(options.includes, options.excludes);
	}
}

async function loadFuzzFunction(options: Options): Promise<fuzzer.FuzzFn> {
	const fuzzTarget: FuzzTarget = await importModule(options.fuzzTarget);
	const fuzzFn: fuzzer.FuzzFn = fuzzTarget[options.fuzzFunction];
	if (typeof fuzzFn !== "function") {
		throw new Error(
			`${options.fuzzTarget} does not export function "${options.fuzzFunction}"`
		);
	}
	return fuzzFn;
}

export async function startFuzzing(options: Options) {
	await initFuzzing(options);
	const fuzzFn: fuzzer.FuzzFn = await loadFuzzFunction(options);
	startFuzzingNoInit(
		fuzzFn,
		addFuzzerOptionsForDryRun(options.fuzzerOptions, options.dryRun)
	);
}

export function addFuzzerOptionsForDryRun(
	opts: string[],
	shouldDoDryRun: boolean,
	timeout = 5000
): string[] {
	const containsParameter = (params: string[], param: string): boolean => {
		return params.some((curr) => curr.startsWith(param));
	};
	// Last occurrence of a parameter is used.
	if (shouldDoDryRun) {
		opts = opts.concat("-runs=0");
	}
	if (!containsParameter(opts, "-timeout")) {
		const inSeconds = timeout / 1000;
		opts = opts.concat(`-timeout=${inSeconds}`);
	}
	return opts;
}

export function startFuzzingNoInit(
	fuzzFn: fuzzer.FuzzFn,
	fuzzerOptions: string[]
) {
	Fuzzer.startFuzzing(fuzzFn, fuzzerOptions);
}

export async function startFuzzingAsync(options: Options) {
	await initFuzzing(options);
	const fuzzFn: fuzzer.FuzzFn = await loadFuzzFunction(options);
	return startFuzzingAsyncNoInit(
		fuzzFn,
		addFuzzerOptionsForDryRun(options.fuzzerOptions, options.dryRun)
	);
}

export function startFuzzingAsyncNoInit(
	fuzzFn: fuzzer.FuzzFn,
	fuzzerOptions: string[]
) {
	return Fuzzer.startFuzzingAsync(fuzzFn, fuzzerOptions);
}

export function stopFuzzingAsync() {
	Fuzzer.stopFuzzingAsync();
}

export function printError(error: unknown) {
	let errorMessage = `==${process.pid}== Uncaught Exception: Jazzer.js: `;
	if (error instanceof Error) {
		errorMessage += error.message;
		console.log(errorMessage);
		if (error.stack) {
			console.log(cleanStack(error.stack));
		}
	} else if (typeof error === "string" || error instanceof String) {
		errorMessage += error;
		console.log(errorMessage);
	} else {
		errorMessage += "unknown";
		console.log(errorMessage);
	}
}

function cleanStack(stack: string): string {
	const result: string[] = [];
	for (const line of stack.split("\n")) {
		if (line.includes("startFuzzing") && line.includes("jazzer.js")) {
			break;
		}
		result.push(line);
	}
	return result.join("\n");
}

async function importModule(name: string): Promise<FuzzTarget> {
	return import(name);
}

export { jazzer } from "./jazzer";
export type { Jazzer } from "./jazzer";
export { FuzzedDataProvider } from "./FuzzedDataProvider";
