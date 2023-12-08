/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
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
