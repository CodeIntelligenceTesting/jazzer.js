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

import sms from "source-map-support";
import { RawSourceMap } from "source-map";
import {
	BabelFileResult,
	PluginItem,
	TransformOptions,
	transformSync,
} from "@babel/core";
import { hookRequire, TransformerOptions } from "istanbul-lib-hook";
import { codeCoverage } from "./plugins/codeCoverage";
import { sourceCodeCoverage } from "./plugins/sourceCodeCoverage";
import { compareHooks } from "./plugins/compareHooks";
import { functionHooks } from "./plugins/functionHooks";
import { hookManager } from "@jazzer.js/hooking";
import { EdgeIdStrategy, MemorySyncIdStrategy } from "./edgeIdStrategy";

interface SourceMaps {
	[file: string]: RawSourceMap;
}

const sourceMaps: SourceMaps = {};

export {
	EdgeIdStrategy,
	FileSyncIdStrategy,
	MemorySyncIdStrategy,
} from "./edgeIdStrategy";

export class Instrumentor {
	constructor(
		private readonly includes: string[] = [],
		private readonly excludes: string[] = [],
		private readonly customHooks: string[] = [],
		private readonly shouldCollectSourceCodeCoverage = false,
		private readonly isDryRun = false,
		private readonly idStrategy: EdgeIdStrategy = new MemorySyncIdStrategy()
	) {
		// This is our default case where we want to include everthing and exclude the "node_modules" folder.
		if (includes.length === 0 && excludes.length === 0) {
			includes.push("*");
			excludes.push("node_modules");
		}
		this.includes = Instrumentor.cleanup(includes);
		this.excludes = Instrumentor.cleanup(excludes);
	}

	init(): () => void {
		if (this.includes.includes("jazzer.js")) {
			this.unloadInternalModules();
		}
		return Instrumentor.installSourceMapSupport();
	}

	instrument(code: string, filename: string): string {
		const transformations: PluginItem[] = [];

		const shouldInstrumentFile = this.shouldInstrumentForFuzzing(filename);

		if (shouldInstrumentFile) {
			transformations.push(codeCoverage(this.idStrategy), compareHooks);
		}

		if (hookManager.hasFunctionsToHook(filename)) {
			transformations.push(functionHooks(filename));
		}

		if (this.shouldCollectCodeCoverage(filename)) {
			transformations.push(sourceCodeCoverage(filename));
		}

		if (shouldInstrumentFile) {
			this.idStrategy.startForSourceFile(filename);
		}

		const transformedCode =
			this.transform(filename, code, transformations)?.code || code;

		if (shouldInstrumentFile) {
			this.idStrategy.commitIdCount(filename);
		}

		return transformedCode;
	}

	transform(
		filename: string,
		code: string,
		plugins: PluginItem[],
		options: TransformOptions = {}
	): BabelFileResult | null {
		if (plugins.length === 0) {
			return null;
		}
		const result = transformSync(code, {
			filename: filename,
			sourceFileName: filename,
			sourceMaps: true,
			plugins: plugins,
			...options,
		});
		if (result?.map) {
			const sourceMap = result.map;
			sourceMaps[filename] = {
				version: sourceMap.version.toString(),
				sources: sourceMap.sources ?? [],
				names: sourceMap.names,
				sourcesContent: sourceMap.sourcesContent,
				mappings: sourceMap.mappings,
			};
		}
		return result;
	}

	/* Installs source-map-support handlers and returns a reset function */
	static installSourceMapSupport(): () => void {
		// Use the source-map-support library to enable in-memory source maps of
		// transformed code and error stack rewrites.
		// As there is no way to populate the source map cache of source-map-support,
		// an additional buffer is used to pass on the source maps from babel to the
		// library. This could be memory intensive and should be replaced by
		// tmp source map files, if it really becomes a problem.
		sms.install({
			hookRequire: true,
			retrieveSourceMap: (source) => {
				if (sourceMaps[source]) {
					return {
						map: sourceMaps[source],
						url: source,
					};
				}
				return null;
			},
		});
		return sms.resetRetrieveHandlers;
	}

	private unloadInternalModules() {
		console.log(
			"DEBUG: Unloading internal Jazzer.js modules for instrumentation..."
		);
		[
			"@jazzer.js/core",
			"@jazzer.js/fuzzer",
			"@jazzer.js/hooking",
			"@jazzer.js/instrumentor",
			"@jazzer.js/jest-runner",
		].forEach((module) => {
			delete require.cache[require.resolve(module)];
		});
	}

	shouldInstrumentForFuzzing(filepath: string): boolean {
		return (
			!this.isDryRun &&
			Instrumentor.doesMatchFilters(filepath, this.includes, this.excludes)
		);
	}

	private shouldCollectCodeCoverage(filepath: string): boolean {
		return (
			this.shouldCollectSourceCodeCoverage &&
			(Instrumentor.doesMatchFilters(filepath, this.includes, this.excludes) ||
				Instrumentor.doesMatchFilters(filepath, this.customHooks, ["nothing"]))
		);
	}

	private static doesMatchFilters(
		filepath: string,
		includes: string[],
		excludes: string[]
	): boolean {
		const included =
			includes.find((include) => filepath.includes(include)) !== undefined;
		const excluded =
			excludes.find((exclude) => filepath.includes(exclude)) !== undefined;
		return included && !excluded;
	}

	private static cleanup(settings: string[]): string[] {
		return settings
			.filter((setting) => setting)
			.map((setting) => (setting === "*" ? "" : setting)); // empty string matches every file
	}
}

export function registerInstrumentor(instrumentor: Instrumentor) {
	instrumentor.init();

	hookRequire(
		() => true,
		(code: string, opts: TransformerOptions): string => {
			return instrumentor.instrument(code, opts.filename);
		},
		// required to allow jest to run typescript files
		// jest's typescript integration will transform the typescript into javascript before giving it to the
		// instrumentor but the filename will still have a .ts extension
		{ extensions: [".ts", ".js"] }
	);
}
