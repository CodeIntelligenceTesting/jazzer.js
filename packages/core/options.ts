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

import * as tmp from "tmp";
import fs from "fs";
import { useDictionaryByParams } from "./dictionary";

/**
 * Jazzer.js options structure expected by the fuzzer.
 *
 * Entry functions, like the CLI or test framework integrations, need to build
 * this structure and should use the same property names for exposing their own
 * options.
 */
export interface Options {
	// `fuzzTarget` is the name of a module exporting the fuzz function `fuzzEntryPoint`.
	fuzzTarget: string;
	// Name of the function that is called by the fuzzer exported by `fuzzTarget`.
	fuzzEntryPoint: string;
	// Part of filepath names to include in the instrumentation.
	includes: string[];
	// Part of filepath names to exclude in the instrumentation.
	excludes: string[];
	// Whether to add fuzzing instrumentation or not.
	dryRun: boolean;
	// Whether to run the fuzzer in sync mode or not.
	sync: boolean;
	// Options to pass on to the underlying fuzzing engine.
	fuzzerOptions: string[];
	// Files to load that contain custom hooks.
	customHooks: string[];
	// Expected error name that won't trigger the fuzzer to stop with an error exit code.
	expectedErrors: string[];
	// Timeout for one fuzzing iteration in milliseconds.
	timeout: number;
	// Internal: File to sync coverage IDs in fork mode.
	idSyncFile?: string;
	// Enable source code coverage report generation.
	coverage: boolean;
	// Directory to write coverage reports to.
	coverageDirectory: string;
	// Coverage reporters to use during report generation.
	coverageReporters: string[];
	// Disable bug detectors by name.
	disableBugDetectors: string[];
	// Fuzzing mode.
	mode: "fuzzing" | "regression";
	// Verbose logging.
	verbose?: boolean;
}

export const defaultOptions: Options = {
	fuzzTarget: "",
	fuzzEntryPoint: "fuzz",
	includes: ["*"],
	excludes: ["node_modules"],
	dryRun: false,
	sync: false,
	fuzzerOptions: [],
	customHooks: [],
	expectedErrors: [],
	timeout: 5000, // default Jest timeout
	idSyncFile: "",
	coverage: false,
	coverageDirectory: "coverage",
	coverageReporters: ["json", "text", "lcov", "clover"], // default Jest reporters
	disableBugDetectors: [],
	mode: "fuzzing",
	verbose: false,
};

export type KeyFormatSource = (key: string) => string;
export const fromCamelCase: KeyFormatSource = (key: string): string => key;
export const fromSnakeCase: KeyFormatSource = (key: string): string => {
	return key
		.toLowerCase()
		.replaceAll(/(_[a-z0-9])/g, (group) =>
			group.toUpperCase().replace("_", ""),
		);
};
export const fromSnakeCaseWithPrefix: (prefix: string) => KeyFormatSource = (
	prefix: string,
): KeyFormatSource => {
	const prefixKey = prefix.toLowerCase() + "_";
	return (key: string): string => {
		return key.toLowerCase().startsWith(prefixKey)
			? fromSnakeCase(key.substring(prefixKey.length))
			: key;
	};
};

/**
 * Builds a complete `Option` object based on default options, environment variables and
 * the partially given input options.
 * Keys in the given option object can be transformed by the `transformKey` function.
 * Environment variables need to be set in snake case with the prefix`JAZZER_`.
 */
export function processOptions(
	inputs: Partial<Options> = {},
	transformKey: KeyFormatSource = fromCamelCase,
	defaults: Options = defaultOptions,
): Options {
	// Includes and excludes must be set together.
	if (inputs && inputs.includes && !inputs.excludes) {
		inputs.excludes = [];
	} else if (inputs && inputs.excludes && !inputs.includes) {
		inputs.includes = [];
	}

	const defaultsWithEnv = mergeOptions(
		process.env,
		defaults,
		fromSnakeCaseWithPrefix("JAZZER"),
		false,
	);
	const options = mergeOptions(inputs, defaultsWithEnv, transformKey);
	// Set verbose mode environment variable via option or node DEBUG environment variable.
	if (options.verbose || process.env.DEBUG) {
		process.env.JAZZER_DEBUG = "1";
	}
	return options;
}

function mergeOptions(
	input: unknown,
	defaults: Options,
	transformKey: (key: string) => string,
	errorOnUnknown = true,
): Options {
	// Deep close the default options to avoid mutation.
	const options: Options = JSON.parse(JSON.stringify(defaults));
	if (!input || typeof input !== "object") {
		return options;
	}
	Object.keys(input as object).forEach((key) => {
		const transformedKey = transformKey(key);
		if (!Object.hasOwn(options, transformedKey)) {
			if (errorOnUnknown) {
				throw new Error(`Unknown Jazzer.js option '${key}'`);
			}
			return;
		}
		// No way to dynamically resolve the types here, use (implicit) any for now.
		// @ts-ignore
		let resultValue = input[key];
		// Try to parse strings as JSON values to support setting arrays and
		// objects via environment variables.
		if (typeof resultValue === "string" || resultValue instanceof String) {
			try {
				resultValue = JSON.parse(resultValue.toString());
			} catch (ignore) {
				// Ignore parsing errors and continue with the string value.
			}
		}
		//@ts-ignore
		const keyType = typeof options[transformedKey];
		if (typeof resultValue !== keyType) {
			// @ts-ignore
			throw new Error(
				`Invalid type for Jazzer.js option '${key}', expected type '${keyType}'`,
			);
		}
		// Deep clone value to avoid reference keeping and unintended mutations.
		// @ts-ignore
		options[transformedKey] = JSON.parse(JSON.stringify(resultValue));
	});
	return options;
}

export function buildFuzzerOption(options: Options) {
	if (process.env.JAZZER_DEBUG) {
		console.debug("DEBUG: [core] Jazzer.js initial fuzzer arguments: ");
		console.debug(options);
	}

	let params: string[] = [];
	params = optionDependentParams(options, params);
	params = forkedExecutionParams(params);
	params = useDictionaryByParams(params);

	// libFuzzer has to ignore SIGINT and SIGTERM, as it interferes
	// with the Node.js signal handling.
	params = params.concat("-handle_int=0", "-handle_term=0", "-handle_segv=0");

	if (process.env.JAZZER_DEBUG) {
		console.debug("DEBUG: [core] Jazzer.js actually used fuzzer arguments: ");
		console.debug(params);
	}
	logInfoAboutFuzzerOptions(params);
	return params;
}

function logInfoAboutFuzzerOptions(fuzzerOptions: string[]) {
	fuzzerOptions.slice(1).forEach((element) => {
		if (element.length > 0 && element[0] != "-") {
			console.error("INFO: using inputs from:", element);
		}
	});
}

function optionDependentParams(options: Options, params: string[]): string[] {
	if (!options || !options.fuzzerOptions) {
		return params;
	}

	let opts = options.fuzzerOptions;
	if (options.mode === "regression") {
		// The last provided option takes precedence
		opts = opts.concat("-runs=0");
	}

	if (options.timeout <= 0) {
		throw new Error("timeout must be > 0");
	}
	const inSeconds = Math.ceil(options.timeout / 1000);
	opts = opts.concat(`-timeout=${inSeconds}`);

	return opts;
}

function forkedExecutionParams(params: string[]): string[] {
	return [prepareLibFuzzerArg0(params), ...params];
}

function prepareLibFuzzerArg0(fuzzerOptions: string[]): string {
	// When we run in a libFuzzer mode that spawns subprocesses, we create a wrapper script
	// that can be used as libFuzzer's argv[0]. In the fork mode, the main libFuzzer process
	// uses argv[0] to spawn further processes that perform the actual fuzzing.
	const libFuzzerSpawnsProcess = fuzzerOptions.some(
		(flag) =>
			(flag.startsWith("-fork=") && !flag.startsWith("-fork=0")) ||
			(flag.startsWith("-jobs=") && !flag.startsWith("-jobs=0")) ||
			(flag.startsWith("-merge=") && !flag.startsWith("-merge=0")),
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
		(arg) => arg !== "--" && fuzzerOptions.indexOf(arg) === -1,
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
