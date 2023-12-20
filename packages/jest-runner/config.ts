/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
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
