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

import path from "path";
import * as fuzzer from "@jazzer.js/fuzzer";
import * as hooking from "@jazzer.js/hooking";
import { registerInstrumentor } from "@jazzer.js/instrumentor";
import { trackedHooks } from "@jazzer.js/hooking";
import * as process from "process";
import * as tmp from "tmp";
import * as fs from "fs";

// Remove temporary files on exit
tmp.setGracefulCleanup();

// libFuzzer uses exit code 77 in case of a crash, so use a similar one for
// failed error expectations.
const ERROR_EXPECTED_CODE = 0;
const ERROR_UNEXPECTED_CODE = 78;

export interface Options {
	// `fuzzTarget` is the name of an external module containing a `fuzzer.FuzzTarget`
	// that is resolved by `fuzzEntryPoint`.
	fuzzTarget: string;
	fuzzEntryPoint: string;
	includes: string[];
	excludes: string[];
	dryRun: boolean;
	sync: boolean;
	fuzzerOptions: string[];
	customHooks: string[];
	expectedErrors: string[];
	timeout?: number;
	idSyncFile?: string;
}

interface FuzzModule {
	[fuzzEntryPoint: string]: fuzzer.FuzzTarget;
}

/* eslint no-var: 0 */
declare global {
	var Fuzzer: fuzzer.Fuzzer;
	var HookManager: hooking.HookManager;
}

export async function initFuzzing(options: Options) {
	registerGlobals();
	await Promise.all(options.customHooks.map(importModule));
	if (!options.dryRun) {
		registerInstrumentor(
			options.includes,
			options.excludes,
			options.idSyncFile
		);
	}
}

export function registerGlobals() {
	globalThis.Fuzzer = fuzzer.fuzzer;
	//TODO make sure that all sanitizers are registered at this point
	globalThis.HookManager = hooking.hookManager;
}

export async function startFuzzing(options: Options) {
	await initFuzzing(options);
	const fuzzFn = await loadFuzzFunction(options);
	await startFuzzingNoInit(fuzzFn, options).then(
		() => {
			stopFuzzing(undefined, options.expectedErrors);
		},
		(err: unknown) => {
			stopFuzzing(err, options.expectedErrors);
		}
	);
}

export async function startFuzzingNoInit(
	fuzzFn: fuzzer.FuzzTarget,
	options: Options
) {
	const fuzzerOptions = buildFuzzerOptions(options);
	const fuzzerFn = options.sync
		? Fuzzer.nativeAddon.startFuzzing
		: Fuzzer.nativeAddon.startFuzzingAsync;
	// Wrap the potentially sync fuzzer call, so that resolve and exception
	// handlers are always executed.
	return Promise.resolve().then(() => fuzzerFn(fuzzFn, fuzzerOptions));
}

function prepareLibFuzzerArg0(fuzzerOptions: string[]): string {
	// When we run in a libFuzzer mode that spawns subprocesses, we create a wrapper script
	// that can be used as libFuzzer's argv[0]. In the fork mode, the main libFuzzer process
	// uses argv[0] to spawn further processes that perform the actual fuzzing.
	const libFuzzerSpawnsProcess = fuzzerOptions.some(
		(flag) =>
			flag.startsWith("-fork=") ||
			flag.startsWith("-jobs=") ||
			flag.startsWith("-merge=")
	);

	if (!libFuzzerSpawnsProcess) {
		// Return a fake argv[0] to start the fuzzer if libFuzzer does not spawn new processes.
		return "unused_arg0_report_a_bug_if_you_see_this";
	} else {
		// Create a wrapper script and return its path.
		return createWrapperScript(fuzzerOptions);
	}
}

function createWrapperScript(fuzzerOptions: string[]) {
	const jazzerArgs = process.argv.filter(
		(arg) => arg !== "--" && fuzzerOptions.indexOf(arg) === -1
	);

	if (jazzerArgs.indexOf("--id_sync_file") === -1) {
		const idSyncFile = tmp.fileSync({
			mode: 0o600,
			prefix: "jazzer.js",
			postfix: "idSync",
		});
		jazzerArgs.push("--id_sync_file", idSyncFile.name);
		fs.closeSync(idSyncFile.fd);
	}

	const isWindows = process.platform === "win32";

	const scriptContent = `${isWindows ? "@echo off" : "#!/usr/bin/env sh"}
cd "${process.cwd()}"
${jazzerArgs.map((s) => '"' + s + '"').join(" ")} -- ${isWindows ? "%*" : "$@"}
`;

	const scriptTempFile = tmp.fileSync({
		mode: 0o700,
		prefix: "jazzer.js",
		postfix: "libfuzzer" + (isWindows ? ".bat" : ".sh"),
	});
	fs.writeFileSync(scriptTempFile.name, scriptContent);
	fs.closeSync(scriptTempFile.fd);

	return scriptTempFile.name;
}

function stopFuzzing(err: unknown, expectedErrors: string[]) {
	if (process.env.JAZZER_DEBUG) {
		trackedHooks.categorizeUnknown(HookManager.hooks).print();
	}

	// No error found, check if one is expected.
	if (!err) {
		if (expectedErrors.length) {
			console.error(
				`ERROR: Received no error, but expected one of [${expectedErrors}].`
			);
			Fuzzer.nativeAddon.stopFuzzingAsync(ERROR_UNEXPECTED_CODE);
		}
		return;
	}

	// Error found and expected, check if it's one of the expected ones.
	if (expectedErrors.length) {
		const name = errorName(err);
		if (expectedErrors.includes(name)) {
			console.error(`INFO: Received expected error "${name}".`);
			Fuzzer.nativeAddon.stopFuzzingAsync(ERROR_EXPECTED_CODE);
		} else {
			printError(err);
			console.error(
				`ERROR: Received error "${name}" is not in expected errors [${expectedErrors}].`
			);
			Fuzzer.nativeAddon.stopFuzzingAsync(ERROR_UNEXPECTED_CODE);
		}
		return;
	}

	// Error found, but no specific one expected. This case is used for normal
	// fuzzing runs, so no dedicated exit code is given to the stop fuzzing function.
	printError(err);
	Fuzzer.nativeAddon.stopFuzzingAsync();
}

function errorName(error: unknown): string {
	if (error instanceof Error) {
		// error objects
		return error.name;
	} else if (typeof error !== "object") {
		// primitive types
		return String(error);
	} else {
		// Arrays and objects can not be converted to a proper name and so
		// not be stated as expected error.
		return "unknown";
	}
}

function printError(error: unknown) {
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

function buildFuzzerOptions(options: Options): string[] {
	if (!options || !options.fuzzerOptions) {
		return [];
	}
	// Last occurrence of a parameter is used.
	let opts = options.fuzzerOptions;
	if (options.dryRun) {
		opts = opts.concat("-runs=0");
	}
	if (options.timeout != undefined) {
		const inSeconds = options.timeout / 1000;
		opts = opts.concat(`-timeout=${inSeconds}`);
	}

	return [prepareLibFuzzerArg0(opts), ...opts];
}

async function loadFuzzFunction(options: Options): Promise<fuzzer.FuzzTarget> {
	const fuzzTarget = await importModule(options.fuzzTarget);
	if (!fuzzTarget) {
		throw new Error(
			`${options.fuzzTarget} could not be imported successfully"`
		);
	}
	const fuzzFn: fuzzer.FuzzTarget = fuzzTarget[options.fuzzEntryPoint];
	if (typeof fuzzFn !== "function") {
		throw new Error(
			`${options.fuzzTarget} does not export function "${options.fuzzEntryPoint}"`
		);
	}
	return fuzzFn;
}

async function importModule(name: string): Promise<FuzzModule | void> {
	return import(name);
}

export function ensureFilepath(filePath: string): string {
	if (!filePath) {
		throw Error("Empty filepath provided");
	}
	// file: schema is required on Windows
	const fullPath = "file://" + path.join(process.cwd(), filePath);
	return [".js", ".mjs", ".cjs"].some((suffix) => fullPath.endsWith(suffix))
		? fullPath
		: fullPath + ".js";
}

export type { Jazzer } from "./jazzer";
export { jazzer } from "./jazzer";
export { FuzzedDataProvider } from "./FuzzedDataProvider";
