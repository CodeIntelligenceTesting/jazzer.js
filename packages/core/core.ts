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
import { registerInstrumentor } from "@jazzer.js/instrumentor";

export interface Options {
	fuzzTarget: string;
	fuzzFunction: string;
	includes: string[];
	excludes: string[];
	dryRun: boolean;
	fuzzerOptions: string[];
}

declare global {
	// eslint-disable-next-line no-var
	var Fuzzer: fuzzer.Fuzzer;
}

export function startFuzzing(options: Options) {
	globalThis.Fuzzer = fuzzer.fuzzer;
	if (options.dryRun) {
		options.fuzzerOptions.push("-runs=0");
	} else {
		registerInstrumentor(options.includes, options.excludes);
	}

	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const fuzzFn = require(options.fuzzTarget)[options.fuzzFunction];
	if (typeof fuzzFn !== "function") {
		throw new Error(
			`${options.fuzzTarget} does not export function "${options.fuzzFunction}"`
		);
	}
	Fuzzer.startFuzzing(fuzzFn, options.fuzzerOptions);
}

export { jazzer } from "./jazzer";
export type { Jazzer } from "./jazzer";
