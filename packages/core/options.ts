/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import fs from "fs";
import * as util from "util";

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
	// Fuzzing dictionaries
	dictionaryEntries: (string | Uint8Array | Int8Array)[];
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
	idSyncFile: string;
	// Part of filepath names to include in the instrumentation.
	includes: string[];
	// Fuzzing mode.
	mode: "fuzzing" | "regression";
	// Whether to run the fuzzer in sync mode or not.
	sync: boolean;
	// Timeout for one fuzzing iteration in milliseconds.
	timeout: number;
	// Verbose logging.
	verbose: boolean;
}

export type OptionWithSource<K extends keyof Options> = {
	value: Options[K];
	source: OptionSource;
};
export type OptionsWithSource = { [P in keyof Options]: OptionWithSource<P> };

type OptionWithPrintableSource<K extends keyof Options> = {
	value: Options[K];
	source: string;
};

export type OptionsWithPrintableSource = {
	[P in keyof Options]: OptionWithPrintableSource<P>;
};

// These options can be set from the Jest fuzz test.
const allowedFuzzTestOptions = [
	"dictionaryEntries",
	"fuzzerOptions",
	"sync",
	"timeout",
] as const;
export type AllowedFuzzTestOptions = (typeof allowedFuzzTestOptions)[number];

export const defaultCLIOptions: Options = Object.freeze({
	coverage: false,
	coverageDirectory: "coverage",
	coverageReporters: ["json", "text", "lcov", "clover"], // default Jest reporters
	customHooks: [],
	dictionaryEntries: [],
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

export const defaultJestOptions: Options = Object.freeze({
	...defaultCLIOptions,
	mode: "regression",
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

// Source of an option is considered when merging options.
// Higher index means higher priority.
export enum OptionSource {
	DefaultCLIOptions,
	DefaultJestOptions,
	InternalJestTimeout,
	ConfigurationFile,
	EnvironmentVariables,
	CommandLineArguments,
	JestFuzzTestOptions,
}

type DefaultSourceInfo = {
	name: string;
	transformKey: KeyFormatSource;
	failOnUnknown: boolean;
	parameters?: Options | object;
};
const defaultOptions: Record<OptionSource, DefaultSourceInfo> = {
	[OptionSource.DefaultCLIOptions]: {
		name: "Default CLI options",
		transformKey: fromCamelCase,
		failOnUnknown: true,
		parameters: defaultCLIOptions,
	},
	[OptionSource.DefaultJestOptions]: {
		name: "Default Jest options",
		transformKey: fromCamelCase,
		failOnUnknown: true,
		parameters: defaultJestOptions,
	},
	[OptionSource.InternalJestTimeout]: {
		name: "Internal Jest timeout",
		transformKey: fromCamelCase,
		failOnUnknown: true,
	},
	[OptionSource.ConfigurationFile]: {
		name: "Configuration file",
		transformKey: fromCamelCase,
		failOnUnknown: true,
	},
	[OptionSource.EnvironmentVariables]: {
		name: "Environment variables",
		transformKey: fromSnakeCaseWithPrefix("JAZZER"),
		failOnUnknown: false,
		parameters: process.env as object,
	},
	[OptionSource.CommandLineArguments]: {
		name: "Command line arguments",
		transformKey: fromCamelCase,
		failOnUnknown: true,
	},
	[OptionSource.JestFuzzTestOptions]: {
		name: "Jest fuzz test options",
		transformKey: fromCamelCase,
		failOnUnknown: true,
	},
} as const;

export class OptionsManager {
	private readonly _options: OptionsWithSource;

	constructor(obj: OptionSource);
	constructor(obj: OptionsWithSource);
	/**
	 * Manages merging of options from different sources.
	 * WARNING: each fuzz test needs a copy (use the `clone()` function) of the OptionsManager, otherwise the fuzz tests will overwrite each other's options.
	 * @param sourceOrOptions - build options given the `OptionSource`; or use provided options as is.
	 */
	constructor(sourceOrOptions: OptionSource | OptionsWithSource) {
		if (typeof sourceOrOptions === "number") {
			const source = sourceOrOptions;
			const initialOptions = defaultOptions[source].parameters as Options;
			if (!initialOptions) {
				throw new Error(
					`Default options for ${source} do not exist. Consider adding them or use a different source.`,
				);
			}
			this._options = OptionsManager.copyOptions(
				OptionsManager.attachSource(initialOptions, source),
			);
			this.merge(process.env, OptionSource.EnvironmentVariables);
		} else if (typeof sourceOrOptions === "object") {
			// only used by clone()
			this._options = OptionsManager.copyOptions(sourceOrOptions);
		} else {
			throw new Error("Invalid argument");
		}
	}

	/**
	 * Get the value of an option.
	 * @param key
	 */
	get<K extends keyof Options>(key: K): Options[K] {
		return this._options[key].value;
	}

	/**
	 * Get raw options without the source information.
	 * @returns a copy of the options without source information
	 */
	getOptions(): Options {
		return OptionsManager.detachSource(this._options);
	}

	getOptionsWithSource(): OptionsWithSource {
		return this._options;
	}

	/**
	 * Merge new options from `input` given the `source` (aka priority). Same `source` options will result in an error---accumulate the options before writing.
	 * `input` gets deep cloned to avoid reference keeping and unintended mutations.
	 * @param input - new options to merge
	 * @param source - priority of all the options in `input`
	 */
	merge(input: unknown, source: OptionSource) {
		const transformKey = defaultOptions[source].transformKey;
		const errorOnUnknown = defaultOptions[source].failOnUnknown;

		let includes: typeof this._options.includes.value | undefined = undefined;
		let excludes: typeof this._options.excludes.value | undefined = undefined;

		Object.keys(input as object).forEach((k) => {
			const transformedKey = transformKey(k);

			// Use hasOwnProperty to still support node v14.
			// eslint-disable-next-line no-prototype-builtins
			if (!defaultCLIOptions.hasOwnProperty(transformedKey)) {
				if (errorOnUnknown) {
					throw new Error(`Unknown Jazzer.js option '${k}'`);
				}
				return;
			}
			const key = transformedKey as keyof Options;
			if (!validateOptionPermissions(key, source, this._options)) {
				return;
			}

			const keyType = typeof defaultCLIOptions[key];

			// No way to dynamically resolve the types here, use (implicit) any for now.
			// @ts-ignore
			let resultValue = input[k];
			// Try to parse strings as JSON values to support setting arrays and
			// objects via environment variables and command line arguments.
			if (
				[
					OptionSource.CommandLineArguments,
					OptionSource.EnvironmentVariables,
				].includes(source) &&
				keyType !== "string" &&
				(typeof resultValue === "string" || resultValue instanceof String)
			) {
				try {
					resultValue = JSON.parse(resultValue.toString());
				} catch (ignore) {
					// Ignore parsing errors and continue with the string value.
				}
			}

			if (typeof resultValue !== keyType) {
				throw new Error(
					`Invalid type for Jazzer.js option '${key}', expected type '${keyType}', got '${typeof resultValue}'`,
				);
			}
			// Deep copy the new value to avoid reference keeping and unintended mutations.
			resultValue = OptionsManager.copyOptionValue(resultValue);
			setProperty(this._options, key, { value: resultValue, source: source });

			if (key === "includes") {
				includes = resultValue;
			} else if (key === "excludes") {
				excludes = resultValue;
			}
		});

		// Includes and excludes must be set together.
		if (input && includes && !excludes) {
			this._options.excludes.value = [];
		} else if (input && excludes && !includes) {
			this._options.includes.value = [];
		}

		// Set verbose mode environment variable via option or node DEBUG environment variable.
		// Subsequent changes to the `verbose` option will be ignored.
		if (this.get("verbose") || process.env.DEBUG) {
			process.env.JAZZER_DEBUG = "1";
		}
		return this;
	}

	clone(): OptionsManager {
		return new OptionsManager(this._options);
	}

	static copyOptions(newOptions: OptionsWithSource): OptionsWithSource {
		const result: OptionsWithSource = Object.create(null);
		Object.entries(newOptions).forEach(([k]) => {
			const key = k as keyof Options;
			const option = newOptions[key];
			const value = OptionsManager.copyOptionValue(option.value);
			const source = option.source;
			setProperty<OptionsWithSource, keyof Options>(result, key, {
				value,
				source,
			});
		});
		return result;
	}

	static copyOptionValue<T extends Options, K extends keyof T>(
		input: T[K],
	): T[K] {
		// simple types
		if (!input || typeof input !== "object") {
			return input;
		}

		if (Array.isArray(input)) {
			// (Uint8Array | Int8Array)[] - each sub-array gets copied
			if (
				input.some(
					(element) =>
						element instanceof Uint8Array || element instanceof Int8Array,
				)
			) {
				return input.map((element) => {
					if (element instanceof Uint8Array || element instanceof Int8Array) {
						return element.slice();
					}
					return element;
				}) as T[K];
			}

			// string[] - the array can be copied directly
			return input.slice() as T[K];
		}

		throw new Error("copyOptionValue: unsupported type: " + typeof input);
	}

	/**
	 * Build options with source information attached.
	 *
	 * @param options
	 * @returns a copy of the options with source information
	 */
	static attachSource(
		options: Options,
		source: OptionSource,
	): OptionsWithSource {
		const result: OptionsWithSource = Object.create(null);
		Object.entries(options).forEach(([k]) => {
			const key = k as keyof Options;
			setProperty(result, key, {
				value: options[key],
				source: source,
			});
		});
		return result;
	}

	/**
	 * Remove source information from options.
	 *
	 * @param options
	 * @returns a copy of the options without source information
	 */
	static detachSource(options: OptionsWithSource): Options {
		const result: Options = Object.create(null);
		Object.entries(options).forEach(([k]) => {
			const key = k as keyof Options;
			const value = options[key]?.value;
			setProperty(result, key, value);
		});
		return result;
	}
}

function setProperty<T, K extends keyof T>(obj: T, key: K, value: T[K]) {
	obj[key] = value;
}

export function buildFuzzerOption(options: OptionsManager) {
	let params: string[] = [];
	params = optionDependentParams(options, params);
	params = forkedExecutionParams(params);
	params = useDictionaryByParams(params, options.get("dictionaryEntries"));

	// libFuzzer has to ignore SIGINT and SIGTERM, as it interferes
	// with the Node.js signal handling.
	params = params.concat("-handle_int=0", "-handle_term=0", "-handle_segv=0");

	printOptions(options);
	logInfoAboutFuzzerOptions(params);
	return params;
}

export function printOptions(options: OptionsManager, infix = "") {
	if (process.env.JAZZER_DEBUG) {
		console.error(
			util.formatWithOptions(
				// Print everything in the options object.
				{ maxArrayLength: null, depth: null, colors: false },
				`DEBUG: [core] Jazzer.js options ${infix}: \n%O`,
				toOptionsWithPrintableSources(options),
			),
		);
	}
}

function toOptionsWithPrintableSources(
	options: OptionsManager,
): OptionsWithPrintableSource {
	const result: OptionsWithPrintableSource = Object.create(null);
	const opts = options.getOptionsWithSource();
	Object.entries(opts).forEach(([k]) => {
		const key = k as keyof Options;
		const value = opts[key]?.value;
		const sourceIndex = opts[key]?.source;
		if (sourceIndex !== undefined) {
			const source = defaultOptions[sourceIndex].name;
			setProperty(result, key, { value, source });
		}
	});
	return result;
}

function logInfoAboutFuzzerOptions(fuzzerOptions: string[]) {
	fuzzerOptions.slice(1).forEach((element) => {
		if (element.length > 0 && element[0] != "-") {
			console.error("INFO: using inputs from:", element);
		}
	});
}

function optionDependentParams(
	options: OptionsManager,
	params: string[],
): string[] {
	if (!options || !options.get("fuzzerOptions")) {
		return params;
	}

	let opts = options.get("fuzzerOptions");
	if (options.get("mode") === "regression") {
		// The last provided option takes precedence
		opts = opts.concat("-runs=0");
	}

	if (options.get("timeout") <= 0) {
		throw new Error("timeout must be > 0");
	}
	const inSeconds = Math.ceil(options.get("timeout") / 1000);
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

// Check two things:
// 1) `dictionaryEntries` can only be set from "Jest fuzz test" source;
// 2) only few approved options can be set from "Jest fuzz test" source.
export function validateKeySource(key: keyof Options, source: OptionSource) {
	const sourceName = defaultOptions[source].name;

	// Only "Jest fuzz test" is allowed to set `dictionaryEntries` option.
	if (
		key === "dictionaryEntries" &&
		source !== OptionSource.JestFuzzTestOptions
	) {
		const allowedSource = defaultOptions[OptionSource.JestFuzzTestOptions].name;
		throw new Error(
			`Tried setting option '${key}' from ${sourceName}, but this option is only available in ${allowedSource}`,
		);
	}

	// Only selected options can be set from the Jest fuzz test
	if (
		source === OptionSource.JestFuzzTestOptions &&
		!allowedFuzzTestOptions.includes(key as AllowedFuzzTestOptions)
	) {
		throw new Error(`Option '${key}' is not available from "${sourceName}."`);
	}
}

// Check if the key can be set from the new source.
//
function validateOptionPermissions(
	key: keyof Options,
	source: OptionSource,
	options: OptionsWithSource,
): boolean {
	validateKeySource(key, source);
	// Overwriting options from the same source is not allowed---accumulate the options before writing.
	if (source === options[key].source) {
		throw new Error(
			`Option '${key}' already set from ${defaultOptions[source].name}`,
		);
	}
	return source > options[key].source;
}
