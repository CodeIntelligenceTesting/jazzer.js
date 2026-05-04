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

import { fileSync } from "tmp";

import {
	logInfoAboutFuzzerOptions,
	type OptionsManager,
	printOptions,
} from "@jazzer.js/options";

import { useDictionaryByParams } from "./dictionary";

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
	if (!spawnsSubprocess(fuzzerOptions)) {
		return "unused_arg0_report_a_bug_if_you_see_this";
	} else {
		return createWrapperScript(fuzzerOptions);
	}
}

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
		const idSyncFile = fileSync({
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

	const scriptTempFile = fileSync({
		mode: 0o700,
		prefix: "jazzer.js",
		postfix: "libfuzzer" + (isWindows ? ".bat" : ".sh"),
	});
	fs.writeFileSync(scriptTempFile.name, scriptContent);
	fs.closeSync(scriptTempFile.fd);

	return scriptTempFile.name;
}
