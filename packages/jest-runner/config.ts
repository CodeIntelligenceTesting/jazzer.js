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

import { cosmiconfigSync } from "cosmiconfig";

import {
	buildOptions,
	Options,
	ParameterResolverIndex,
	setParameterResolverValue,
} from "@jazzer.js/core";

export const TIMEOUT_PLACEHOLDER = Number.MIN_SAFE_INTEGER;

// Lookup `Options` via the `.jazzerjsrc` configuration files.
export function loadConfig(
	options: Partial<Options> = {},
	optionsKey = "jazzerjs",
): Options {
	const result = cosmiconfigSync(optionsKey).search();
	const config = result?.config ?? {};
	// If no timeout is specified, use a placeholder value so that no
	// default timeout is used. Afterwards remove the placeholder value,
	// if not already overwritten by the user.
	if (config.timeout === undefined) {
		config.timeout = TIMEOUT_PLACEHOLDER;
	}
	// Jazzer.js normally runs in "fuzzing" mode, but,
	// if not specified otherwise, Jest uses "regression" mode.
	if (!config.mode) {
		config.mode = "regression";
	}
	// Switch to fuzzing mode if environment variable `JAZZER_FUZZ` is set.
	if (process.env.JAZZER_FUZZ) {
		config.mode = "fuzzing";
	}
	// Merge explicitly passed in options, e.g. coverage settings from Jest.
	Object.assign(config, options);
	setParameterResolverValue(ParameterResolverIndex.ConfigurationFile, config);
	return buildOptions();
}
