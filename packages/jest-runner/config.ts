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

import { cosmiconfigSync } from "cosmiconfig";

import { Options, OptionsManager, OptionSource } from "@jazzer.js/core";

export const TIMEOUT_PLACEHOLDER = Number.MIN_SAFE_INTEGER;

// Load Jazzer.js `Options` from the `.jazzerjsrc` configuration files and environment variables.
export function loadConfig(
	options: Partial<Options> = {},
	optionsKey = "jazzerjs",
): OptionsManager {
	const config = cosmiconfigSync(optionsKey).search()?.config ?? {};

	// Switch to fuzzing mode if environment variable `JAZZER_FUZZ` is set.
	if (process.env.JAZZER_FUZZ) {
		config.mode = "fuzzing";
	}
	// Merge explicitly passed in options, e.g. coverage settings from Jest.
	Object.assign(config, options);

	return new OptionsManager(OptionSource.DefaultJestOptions).merge(
		config,
		OptionSource.ConfigurationFile,
	);
}
