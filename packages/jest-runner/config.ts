import { cosmiconfigSync } from "cosmiconfig";
import { Options } from "@jazzer.js/core";

const defaultOptions: Options = {
	dryRun: true,
	includes: ["*"],
	excludes: ["node_modules"],
	fuzzFunction: "",
	fuzzTarget: "",
	customHooks: [],
	fuzzerOptions: [],
	sync: false,
};

export function loadConfig(): Options {
	const result = cosmiconfigSync("jazzer-runner").search();
	if (result === null) {
		return defaultOptions;
	}

	const config = Object.keys(defaultOptions).reduce(
		(config: Options, key: string) => {
			if (key in result.config) {
				config = { ...config, [key]: result.config[key] };
			}
			return config;
		},
		defaultOptions
	);

	if (process.env.JAZZER_FUZZ) {
		config.dryRun = false;
	}

	return config;
}
