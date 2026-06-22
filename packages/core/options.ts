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

import fs from "fs";

import * as tmp from "tmp";

import {
	type LibAflOptions,
	Mode,
	type OptionsManager,
	OptionSource,
	printOptions,
} from "@jazzer.js/options";

import { useDictionaryByParams } from "./dictionary";

type CommonEngineOptions = {
	mode: Mode;
	runs?: number;
	seed: number;
	maxLen: number;
	timeoutMillis: number;
	maxTotalTimeSeconds: number;
	artifactPrefix: string;
	corpusDirectories: string[];
	dictionaryFiles: string[];
};

const COMMON_ENGINE_FLAGS = new Map([
	["-runs", "runs"],
	["-seed", "seed"],
	["-max_len", "maxLen"],
	["-timeout", "timeout"],
	["-max_total_time", "maxTotalTime"],
	["-artifact_prefix", "artifactPrefix"],
	["-dict", "dictionaryFiles"],
]);

export function buildLibFuzzerOptions(options: OptionsManager): string[] {
	const common = buildCommonEngineOptions(options);
	const libFuzzerOptions = options.get("libFuzzerOptions");
	if (process.env.JAZZER_INTERNAL_LIBFUZZER_ARGS !== "1") {
		validateBackendOptions("libFuzzerOptions", libFuzzerOptions);
	}

	let params = commonLibFuzzerOptions(common).concat(libFuzzerOptions);
	params = forkedExecutionParams(params);

	// libFuzzer has to ignore these signals, as they interfere with Node.js
	// signal handling and Jazzer.js finding reporting.
	params = params.concat("-handle_int=0", "-handle_term=0", "-handle_segv=0");

	printOptions(options);
	logInfoAboutCorpusDirectories(common.corpusDirectories);
	return params;
}

// Backwards-compatible alias for existing call sites.
export const buildFuzzerOption = buildLibFuzzerOptions;

export function buildLibAflOptions(options: OptionsManager): LibAflOptions {
	if (options.get("libFuzzerOptions").length > 0) {
		throw new Error(
			"libFuzzerOptions can only be used with the libFuzzer backend. Use " +
				"common Jazzer.js options such as --runs, --seed, --maxLen, and --timeout.",
		);
	}

	const backendLibAflOptions = options.get("libAflOptions");
	if (backendLibAflOptions.length > 0) {
		throw new Error(
			"LibAFL backend-specific options are not supported yet. Use common " +
				"Jazzer.js options such as --runs, --seed, --maxLen, and --timeout.",
		);
	}

	const common = buildCommonEngineOptions(options);
	const libAflOptions = {
		...common,
		runs: common.runs ?? 0,
		runsSet: common.runs !== undefined,
	};
	printOptions(options);
	if (process.env.JAZZER_DEBUG) {
		console.error(
			`DEBUG: [core] LibAFL options: ${JSON.stringify(libAflOptions, null, 2)}`,
		);
	}
	return libAflOptions;
}

function buildCommonEngineOptions(
	options: OptionsManager,
): CommonEngineOptions {
	const timeoutMillis = positiveInteger("timeout", options.get("timeout"));
	let runs = nonNegativeInteger("runs", options.get("runs"));
	const runsSet =
		options.getOptionsWithSource().runs.source >
		OptionSource.DefaultJestOptions;
	if (options.get("mode") === Mode.Regression) {
		// Regression mode should replay every available corpus input unless the
		// user asked to stop for some other reason, mirroring libFuzzer's behavior.
		runs = 0;
	}

	return {
		mode: options.get("mode"),
		runs: runsSet || options.get("mode") === Mode.Regression ? runs : undefined,
		seed: nonNegativeInteger("seed", options.get("seed")),
		maxLen: positiveInteger("maxLen", options.get("maxLen")),
		timeoutMillis,
		maxTotalTimeSeconds: nonNegativeInteger(
			"maxTotalTime",
			options.get("maxTotalTime"),
		),
		artifactPrefix: options.get("artifactPrefix"),
		corpusDirectories: options.get("corpusDirectories"),
		dictionaryFiles: mergedDictionaryFiles(options),
	};
}

function commonLibFuzzerOptions(options: CommonEngineOptions): string[] {
	const params = [
		`-seed=${options.seed}`,
		`-max_len=${options.maxLen}`,
		`-timeout=${Math.ceil(options.timeoutMillis / 1000)}`,
	];
	if (options.mode === Mode.Regression) {
		params.push("-runs=0");
	} else if (options.runs !== undefined) {
		params.push(`-runs=${options.runs}`);
	}
	if (options.maxTotalTimeSeconds > 0) {
		params.push(`-max_total_time=${options.maxTotalTimeSeconds}`);
	}
	if (options.artifactPrefix) {
		params.push(`-artifact_prefix=${options.artifactPrefix}`);
	}
	params.push(...options.dictionaryFiles.map((file) => `-dict=${file}`));
	params.push(...options.corpusDirectories);
	return params;
}

function mergedDictionaryFiles(options: OptionsManager): string[] {
	const dictionaryOptions = useDictionaryByParams(
		options.get("dictionaryFiles").map((file) => `-dict=${file}`),
		options.get("dictionaryEntries"),
	).filter((option) => option.startsWith("-dict="));
	const mergedDictionary = dictionaryOptions[dictionaryOptions.length - 1];
	return mergedDictionary ? [mergedDictionary.substring(6)] : [];
}

function validateBackendOptions(name: string, options: string[]): void {
	for (const option of options) {
		if (!option.startsWith("-")) {
			throw new Error(
				`Backend option '${option}' in '${name}' is not a flag. ` +
					"Use corpusDirectories for corpus paths.",
			);
		}

		const flag = option.split("=", 1)[0];
		const commonName = COMMON_ENGINE_FLAGS.get(flag);
		if (commonName) {
			throw new Error(
				`'${flag}' is a Jazzer.js common option. Use '--${commonName}' ` +
					"instead of passing it as a backend-specific option.",
			);
		}
	}
}

function positiveInteger(name: string, value: number): number {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(
			`Option '${name}' must be a positive integer, got '${value}'`,
		);
	}
	return value;
}

function nonNegativeInteger(name: string, value: number): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(
			`Option '${name}' must be a non-negative integer, got '${value}'`,
		);
	}
	return value;
}

function logInfoAboutCorpusDirectories(corpusDirectories: string[]) {
	corpusDirectories.forEach((directory) => {
		console.error("INFO: using inputs from:", directory);
	});
}

function forkedExecutionParams(params: string[]): string[] {
	return [prepareLibFuzzerArg0(params), ...params];
}

function prepareLibFuzzerArg0(libFuzzerArgv: string[]): string {
	if (!spawnsSubprocess(libFuzzerArgv)) {
		return "unused_arg0_report_a_bug_if_you_see_this";
	} else {
		return createWrapperScript(libFuzzerArgv);
	}
}

const SUBPROCESS_FLAGS = ["fork", "jobs", "merge", "minimize_crash"];

export function spawnsSubprocess(libFuzzerArgv: string[]): boolean {
	return libFuzzerArgv.some((option) =>
		SUBPROCESS_FLAGS.some((flag) => {
			const name = `-${flag}=`;
			return option.startsWith(name) && !option.startsWith("0", name.length);
		}),
	);
}

function createWrapperScript(libFuzzerArgv: string[]) {
	const jazzerArgs = filterLibFuzzerOptions(process.argv).filter(
		(arg) => arg !== "--" && !libFuzzerArgv.includes(arg),
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
	const envPrefix = isWindows
		? "set JAZZER_INTERNAL_LIBFUZZER_ARGS=1\n"
		: "JAZZER_INTERNAL_LIBFUZZER_ARGS=1 ";

	const scriptContent = `${isWindows ? "@echo off\n" : "#!/usr/bin/env sh\n"}
cd "${process.cwd()}"
${envPrefix}${jazzerArgs.map((s) => '"' + s + '"').join(" ")} -- ${isWindows ? "%*" : '"$@"'}
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

function filterLibFuzzerOptions(args: string[]): string[] {
	const result: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (
			arg === "--libFuzzerOptions" ||
			arg === "--lib_fuzzer_options" ||
			arg === "--lib-fuzzer-options"
		) {
			i++;
			continue;
		}
		if (
			arg.startsWith("--libFuzzerOptions=") ||
			arg.startsWith("--lib_fuzzer_options=") ||
			arg.startsWith("--lib-fuzzer-options=")
		) {
			continue;
		}
		result.push(arg);
	}
	return result;
}
