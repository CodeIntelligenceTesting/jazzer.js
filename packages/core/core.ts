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

declare global {
	// eslint-disable-next-line no-var
	var Fuzzer: fuzzer.Fuzzer;
	// eslint-disable-next-line no-var
	var HookManager: hooking.HookManager;
}

function initFuzzing(options: Options): fuzzer.FuzzFn {
	globalThis.Fuzzer = fuzzer.fuzzer;
	//TODO make sure that all sanitizers are registered at this point
	globalThis.HookManager = hooking.hookManager;
	// load each custom hook file
	options.customHooks.forEach((customHook) => {
		importModule(customHook);
	});

	if (options.dryRun) {
		options.fuzzerOptions.push("-runs=0");
	} else {
		registerInstrumentor(options.includes, options.excludes);
	}

	const fuzzFn = importModule(options.fuzzTarget)[options.fuzzFunction];
	if (typeof fuzzFn !== "function") {
		throw new Error(
			`${options.fuzzTarget} does not export function "${options.fuzzFunction}"`
		);
	}
	return fuzzFn;
}
export function startFuzzing(options: Options) {
	const fuzzFn = initFuzzing(options);
	Fuzzer.startFuzzing(fuzzFn, options.fuzzerOptions);
}

export async function startFuzzingAsync(options: Options) {
	const fuzzFn = initFuzzing(options);
	return Fuzzer.startFuzzingAsync(fuzzFn, options.fuzzerOptions);
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

function importModule(name: string) {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	return require(name);
}

export { jazzer } from "./jazzer";
export type { Jazzer } from "./jazzer";
export { FuzzedDataProvider } from "./FuzzedDataProvider";
