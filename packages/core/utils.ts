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

import path from "path";
import process from "process";
import * as fuzzer from "@jazzer.js/fuzzer";

export interface FuzzModule {
	[fuzzEntryPoint: string]: fuzzer.FuzzTarget;
}

export async function importModule(name: string): Promise<FuzzModule | void> {
	return import(name);
}

export function ensureFilepath(filePath: string): string {
	if (!filePath || filePath.length === 0) {
		throw Error("Empty filepath provided");
	}
	const absolutePath = path.isAbsolute(filePath)
		? filePath
		: path.join(process.cwd(), filePath);
	// file: schema is required on Windows
	const fullPath = "file://" + absolutePath;
	return [".js", ".mjs", ".cjs"].some((suffix) => fullPath.endsWith(suffix))
		? fullPath
		: fullPath + ".js";
}
