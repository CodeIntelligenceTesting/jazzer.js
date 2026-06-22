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
import * as util from "util";

export const Mode = {
	Fuzzing: "fuzzing",
	Regression: "regression",
} as const;

export type Mode = (typeof Mode)[keyof typeof Mode];

export type LibAflOptions = {
	mode: Mode;
	runs: number;
	runsSet: boolean;
	seed: number;
	maxLen: number;
	timeoutMillis: number;
	maxTotalTimeSeconds: number;
	artifactPrefix: string;
	corpusDirectories: string[];
	dictionaryFiles: string[];
};

/**
 * Jazzer.js options structure expected by the fuzzer.
 *
 * Entry functions, like the CLI or test framework integrations, need to build
 * this structure and should use the same property names for exposing their own
 * options.
 */
export interface Options {
	// Fuzzing backend engine.
	engine: "libfuzzer" | "libafl";
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
	// Fuzzing dictionary files.
	dictionaryFiles: string[];
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
	// Path prefix for crash artifacts.
	artifactPrefix: string;
	// Corpus directories used for seed inputs and generated inputs.
	corpusDirectories: string[];
	// `fuzzTarget` is the name of a module exporting the fuzz function `fuzzEntryPoint`.
	fuzzTarget: string;
	// Internal: File to sync coverage IDs in fork mode.
	idSyncFile: string;
	// Part of filepath names to include in the instrumentation.
	includes: string[];
	// Fuzzing mode.
	mode: Mode;
	// Backend-specific options passed to LibAFL. Currently reserved.
	libAflOptions: string[];
	// Backend-specific options passed to libFuzzer.
	libFuzzerOptions: string[];
	// Maximum fuzz input length in bytes.
	maxLen: number;
	// Maximum total fuzzing time in seconds. 0 means unlimited.
	maxTotalTime: number;
	// Number of fuzz target executions. Explicit 0 is forwarded to the backend.
	runs: number;
	// Fuzzing seed. 0 means Jazzer.js generates a seed.
	seed: number;
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
	"engine",
	"dictionaryEntries",
	"dictionaryFiles",
	"libAflOptions",
	"libFuzzerOptions",
	"maxLen",
	"maxTotalTime",
	"runs",
	"seed",
	"sync",
	"timeout",
] as const;
export type AllowedFuzzTestOptions = (typeof allowedFuzzTestOptions)[number];

export const defaultCLIOptions: Options = Object.freeze({
	engine: "libfuzzer",
	coverage: false,
	coverageDirectory: "coverage",
	coverageReporters: ["json", "text", "lcov", "clover"],
	customHooks: [],
	dictionaryEntries: [],
	dictionaryFiles: [],
	disableBugDetectors: [],
	dryRun: false,
	excludes: ["node_modules"],
	expectedErrors: [],
	artifactPrefix: "",
	corpusDirectories: [],
	fuzzEntryPoint: "fuzz",
	fuzzTarget: "",
	idSyncFile: "",
	includes: ["*"],
	libAflOptions: [],
	libFuzzerOptions: [],
	maxLen: 4096,
	maxTotalTime: 0,
	mode: Mode.Fuzzing,
	runs: 0,
	seed: 0,
	sync: false,
	timeout: 5000,
	verbose: false,
});

export const defaultJestOptions: Options = Object.freeze({
	...defaultCLIOptions,
	engine: "libfuzzer",
	mode: Mode.Regression,
});

export type KeyFormatSource = (key: string) => string;
export const fromCamelCase: KeyFormatSource = (key: string): string => key;

function replaceAll(
	text: string,
	pattern: RegExp,
	replacer: string | ((substring: string) => string),
): string {
	let previous = text;
	let current = previous;
	do {
		previous = current;
		current = previous.replace(pattern, replacer as string);
	} while (current !== previous);
	return current;
}

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
	InternalFuzzTestOptions,
	GeneratedSeed,
}

export type FuzzingEngine = Options["engine"];

export function resolveEngine(engine: string): FuzzingEngine {
	switch (engine) {
		case "libfuzzer":
			return "libfuzzer";
		case "libafl":
		case "afl":
			return "libafl";
		default:
			throw new Error(
				`Unknown fuzzing engine '${engine}'. Supported engines are 'libfuzzer' and 'libafl' (alias 'afl').`,
			);
	}
}

function isOneOf<T extends Record<string, string>>(
	obj: T,
	value: string,
): value is T[keyof T] {
	return Object.values(obj).includes(value as T[keyof T]);
}

export function resolveMode(mode: string): Mode {
	if (isOneOf(Mode, mode)) {
		return mode;
	}

	throw new Error(
		`Unknown fuzzer mode '${mode}'. Supported modes are ${Object.values(Mode)
			.map((v) => `'${v}'`)
			.join(", ")}.`,
	);
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
	[OptionSource.InternalFuzzTestOptions]: {
		name: "Internal fuzz test options",
		transformKey: fromCamelCase,
		failOnUnknown: true,
	},
	[OptionSource.GeneratedSeed]: {
		name: "Generated seed",
		transformKey: fromCamelCase,
		failOnUnknown: true,
	},
} as const;

export class OptionsManager {
	private readonly _options: OptionsWithSource;

	constructor(obj: OptionSource);
	constructor(obj: OptionsWithSource);
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
			this._options = OptionsManager.copyOptions(sourceOrOptions);
		} else {
			throw new Error("Invalid argument");
		}
	}

	get<K extends keyof Options>(key: K): Options[K] {
		return this._options[key].value;
	}

	getOptions(): Options {
		return OptionsManager.detachSource(this._options);
	}

	getOptionsWithSource(): OptionsWithSource {
		return this._options;
	}

	merge(input: unknown, source: OptionSource) {
		const transformKey = defaultOptions[source].transformKey;
		const errorOnUnknown = defaultOptions[source].failOnUnknown;

		let includes: typeof this._options.includes.value | undefined = undefined;
		let excludes: typeof this._options.excludes.value | undefined = undefined;

		Object.keys(input as object).forEach((k) => {
			const transformedKey = transformKey(k);

			// Avoid Object.hasOwn to keep support for older Node versions.
			if (
				!Object.prototype.hasOwnProperty.call(defaultCLIOptions, transformedKey)
			) {
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

			// @ts-ignore
			let resultValue = input[k];
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
				} catch {
					// Ignore parsing errors and continue with the string value.
				}
			}

			if (typeof resultValue !== keyType) {
				throw new Error(
					`Invalid type for Jazzer.js option '${key}', expected type '${keyType}', got '${typeof resultValue}'`,
				);
			}
			if (key === "engine") {
				resultValue = resolveEngine(resultValue);
			} else if (key === "mode") {
				resultValue = resolveMode(resultValue);
			}
			resultValue = OptionsManager.copyOptionValue(resultValue);
			setProperty(this._options, key, { value: resultValue, source: source });

			if (key === "includes") {
				includes = resultValue;
			} else if (key === "excludes") {
				excludes = resultValue;
			}
		});

		if (input && includes && !excludes) {
			this._options.excludes.value = [];
		} else if (input && excludes && !includes) {
			this._options.includes.value = [];
		}

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
		if (!input || typeof input !== "object") {
			return input;
		}

		if (Array.isArray(input)) {
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

			return input.slice() as T[K];
		}

		throw new Error("copyOptionValue: unsupported type: " + typeof input);
	}

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

export function toOptionsWithPrintableSources(
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

export function printOptions(options: OptionsManager, infix = "") {
	if (process.env.JAZZER_DEBUG) {
		console.error(
			util.formatWithOptions(
				{ maxArrayLength: null, depth: null, colors: false },
				`DEBUG: [core] Jazzer.js options ${infix}: \n%O`,
				toOptionsWithPrintableSources(options),
			),
		);
	}
}

export function validateKeySource(key: keyof Options, source: OptionSource) {
	const sourceName = defaultOptions[source].name;

	if (
		key === "dictionaryEntries" &&
		source !== OptionSource.JestFuzzTestOptions
	) {
		const allowedSource = defaultOptions[OptionSource.JestFuzzTestOptions].name;
		throw new Error(
			`Tried setting option '${key}' from ${sourceName}, but this option is only available in ${allowedSource}`,
		);
	}

	if (
		source === OptionSource.JestFuzzTestOptions &&
		!allowedFuzzTestOptions.includes(key as AllowedFuzzTestOptions)
	) {
		throw new Error(`Option '${key}' is not available from "${sourceName}."`);
	}

	if (source === OptionSource.GeneratedSeed && key !== "seed") {
		throw new Error(`Option '${key}' is not available from "${sourceName}."`);
	}
}

export function validateOptionPermissions(
	key: keyof Options,
	source: OptionSource,
	options: OptionsWithSource,
): boolean {
	validateKeySource(key, source);
	if (source === options[key].source) {
		throw new Error(
			`Option '${key}' already set from ${defaultOptions[source].name}`,
		);
	}
	return source > options[key].source;
}
