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

import fs from "fs";

import * as tmp from "tmp";

import { useDictionaryByParams } from "./dictionary";
import { replaceAll } from "./utils";

/**
 * Jazzer.js options structure expected by the fuzzer.
 *
 * Entry functions, like the CLI or test framework integrations, need to build
 * this structure and should use the same property names for exposing their own
 * options.
 */
export interface Options {
	// Enable source code coverage report generation.
	coverage: boolean;
	// Directory to write coverage reports to.
	coverageDirectory: string;
	// Coverage reporters to use during report generation.
	coverageReporters: string[];
	// Files to load that contain custom hooks.
	customHooks: string[];
	// Disable bug detectors by name.
	disableBugDetectors: string[];
	// Whether to add fuzzing instrumentation or not.
	dryRun: boolean;
	// Part of filepath names to exclude in the instrumentation.
	excludes: string[];
	// Expected error name that won't trigger the fuzzer to stop with an error exit code.
	expectedErrors: string[];
	// Name of the function that is called by the fuzzer exported by `fuzzTarget`.
	fuzzEntryPoint: string;
	// Options to pass on to the underlying fuzzing engine.
	fuzzerOptions: string[];
	// `fuzzTarget` is the name of a module exporting the fuzz function `fuzzEntryPoint`.
	fuzzTarget: string;
	// Internal: File to sync coverage IDs in fork mode.
	idSyncFile?: string;
	// Part of filepath names to include in the instrumentation.
	includes: string[];
	// Fuzzing mode.
	mode: "fuzzing" | "regression";
	// Whether to run the fuzzer in sync mode or not.
	sync: boolean;
	// Timeout for one fuzzing iteration in milliseconds.
	timeout: number;
	// Verbose logging.
	verbose?: boolean;
}

export const defaultOptions: Options = Object.freeze({
	coverage: false,
	coverageDirectory: "coverage",
	coverageReporters: ["json", "text", "lcov", "clover"], // default Jest reporters
	customHooks: [],
	disableBugDetectors: [],
	dryRun: false,
	excludes: ["node_modules"],
	expectedErrors: [],
	fuzzEntryPoint: "fuzz",
	fuzzerOptions: [],
	fuzzTarget: "",
	idSyncFile: "",
	includes: ["*"],
	mode: "fuzzing",
	sync: false,
	timeout: 5000, // default Jest timeout
	verbose: false,
});

export type KeyFormatSource = (key: string) => string;
export const fromCamelCase: KeyFormatSource = (key: string): string => key;

export const fromSnakeCase: KeyFormatSource = (key: string): string => {
	return replaceAll(key.toLowerCase(), /(_[a-z0-9])/g, (group) =>
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

// Parameters can be passed in via environment variables, command line or
// configuration file, and subsequently overwrite the default ones and each other.
// The passed in values have to be set for externally provided parameters, e.g.
// CLI parameters, before resolving the final options object.
// Higher index means higher priority.
export enum ParameterResolverIndex {
	DefaultOptions = 1,
	ConfigurationFile,
	EnvironmentVariables,
	CommandLineArguments,
}
type ParameterResolver = {
	name: string;
	transformKey: KeyFormatSource;
	failOnUnknown: boolean;
	parameters: object;
};
type ParameterResolvers = Record<ParameterResolverIndex, ParameterResolver>;
const defaultResolvers: ParameterResolvers = {
	[ParameterResolverIndex.DefaultOptions]: {
		name: "Default options",
		transformKey: fromCamelCase,
		failOnUnknown: true,
		parameters: defaultOptions,
	},
	[ParameterResolverIndex.ConfigurationFile]: {
		name: "Configuration file",
		transformKey: fromCamelCase,
		failOnUnknown: true,
		parameters: {},
	},
	[ParameterResolverIndex.EnvironmentVariables]: {
		name: "Environment variables",
		transformKey: fromSnakeCaseWithPrefix("JAZZER"),
		failOnUnknown: false,
		parameters: process.env as object,
	},
	[ParameterResolverIndex.CommandLineArguments]: {
		name: "Command line arguments",
		transformKey: fromSnakeCase,
		failOnUnknown: true,
		parameters: {},
	},
};

/**
 * Set the value object of a parameter resolver. Every resolver expects value
 * object parameter names in a specific format, e.g. camel case or snake case,
 * see the resolver definitions for details.
 */
export function setParameterResolverValue(
	index: ParameterResolverIndex,
	inputs: Partial<Options>,
) {
	// Includes and excludes must be set together.
	if (inputs && inputs.includes && !inputs.excludes) {
		inputs.excludes = [];
	} else if (inputs && inputs.excludes && !inputs.includes) {
		inputs.includes = [];
	}
	defaultResolvers[index].parameters = inputs;
}

/**
 * Build a complete `Option` object based on the parameter resolver chain.
 * Add externally passed in values via the `setParameterResolverValue` function,
 * before calling `buildOptions`.
 */
export function buildOptions(): Options {
	const options = Object.keys(defaultResolvers)
		.sort() // Don't presume an ordered object, this could be implementation specific.
		.reduce<Options>((accumulator, currentValue) => {
			const resolver =
				defaultResolvers[parseInt(currentValue) as ParameterResolverIndex];
			return mergeOptions(
				resolver.parameters,
				accumulator,
				resolver.transformKey,
				resolver.failOnUnknown,
			);
		}, defaultResolvers[ParameterResolverIndex.DefaultOptions].parameters as Options);

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
	if (!options || !input || typeof input !== "object") {
		return options;
	}
	Object.keys(input as object).forEach((key) => {
		const transformedKey = transformKey(key);
		// Use hasOwnProperty to still support node v14.
		// eslint-disable-next-line no-prototype-builtins
		if (!(options as object).hasOwnProperty(transformedKey)) {
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
	if (!spawnsSubprocess(fuzzerOptions)) {
		// Return a fake argv[0] to start the fuzzer if libFuzzer does not spawn new processes.
		return "unused_arg0_report_a_bug_if_you_see_this";
	} else {
		// Create a wrapper script and return its path.
		return createWrapperScript(fuzzerOptions);
	}
}

// These flags cause libFuzzer to spawn subprocesses.
const SUBPROCESS_FLAGS = ["fork", "jobs", "merge", "minimize_crash"];

export function spawnsSubprocess(fuzzerOptions: string[]): boolean {
	return fuzzerOptions.some((option) =>
		SUBPROCESS_FLAGS.some((flag) => {
			const name = `-${flag}=`;
			return option.startsWith(name) && !option.startsWith("0", name.length);
		}),
	);
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
