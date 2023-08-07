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
import { Options } from "./core";
import { useDictionaryByParams } from "./dictionary";

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
			console.log("INFO: using inputs from:", element);
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
