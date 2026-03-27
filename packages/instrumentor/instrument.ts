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

import * as path from "path";
import { pathToFileURL } from "url";

import {
	BabelFileResult,
	PluginItem,
	TransformOptions,
	transformSync,
} from "@babel/core";
import { hookRequire, TransformerOptions } from "istanbul-lib-hook";

import { hookManager } from "@jazzer.js/hooking";

import { EdgeIdStrategy, MemorySyncIdStrategy } from "./edgeIdStrategy";
import { instrumentationPlugins } from "./plugin";
import { codeCoverage } from "./plugins/codeCoverage";
import { compareHooks } from "./plugins/compareHooks";
import { functionHooks } from "./plugins/functionHooks";
import { sourceCodeCoverage } from "./plugins/sourceCodeCoverage";
import {
	extractInlineSourceMap,
	SourceMap,
	SourceMapRegistry,
	toRawSourceMap,
} from "./SourceMapRegistry";

export { instrumentationGuard } from "./guard";
export { registerInstrumentationPlugin } from "./plugin";
export {
	EdgeIdStrategy,
	FileSyncIdStrategy,
	MemorySyncIdStrategy,
} from "./edgeIdStrategy";
export { SourceMap } from "./SourceMapRegistry";

export class Instrumentor {
	constructor(
		private readonly includes: string[] = [],
		private readonly excludes: string[] = [],
		private readonly customHooks: string[] = [],
		private readonly shouldCollectSourceCodeCoverage = false,
		private readonly isDryRun = false,
		private readonly idStrategy: EdgeIdStrategy = new MemorySyncIdStrategy(),
		private readonly sourceMapRegistry: SourceMapRegistry = new SourceMapRegistry(),
	) {
		// This is our default case where we want to include everything and exclude the "node_modules" folder.
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

		// Expose a registration function so ESM modules can feed their
		// source maps back to the main-thread registry.  The ESM loader
		// thread cannot access this registry directly, but the preamble
		// code it emits runs on the main thread during module evaluation
		// — before the module body, and therefore before any error could
		// need the map for stack-trace rewriting.
		const registry = this.sourceMapRegistry;
		(globalThis as Record<string, unknown>).__jazzer_registerSourceMap = (
			filename: string,
			map: SourceMap,
		) => registry.registerSourceMap(filename, map);

		return this.sourceMapRegistry.installSourceMapSupport();
	}

	instrument(code: string, filename: string, sourceMap?: SourceMap) {
		// Extract inline source map from code string and use it as input source map
		// in further transformations.
		const inputSourceMap = sourceMap ?? extractInlineSourceMap(code);
		const transformations: PluginItem[] = [];

		const shouldInstrumentFile = this.shouldInstrumentForFuzzing(filename);
		if (shouldInstrumentFile) {
			transformations.push(
				...instrumentationPlugins.plugins,
				codeCoverage(this.idStrategy),
				compareHooks,
			);
		}

		if (hookManager.hasFunctionsToHook(filename)) {
			transformations.push(functionHooks(filename));
		}

		if (this.shouldCollectCodeCoverage(filename)) {
			transformations.push(
				sourceCodeCoverage(
					filename,
					this.asInputSourceOption(toRawSourceMap(inputSourceMap)),
				),
			);
		}

		if (shouldInstrumentFile) {
			this.idStrategy.startForSourceFile(filename);
		}

		let result: BabelFileResult | null = null;

		try {
			result = this.transform(
				filename,
				code,
				transformations,
				this.asInputSourceOption(inputSourceMap),
			);
		} catch (e) {
			if (process.env.JAZZER_DEBUG) {
				const message = e instanceof Error ? e.message : e;
				console.error(
					`Instrumentation error in file ${filename}:\n  ${message}`,
				);
			}
		}
		if (shouldInstrumentFile) {
			this.idStrategy.commitIdCount(filename);
		}
		return result;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private asInputSourceOption(inputSourceMap: any): any {
		// Empty input source maps mess up the coverage report.
		if (inputSourceMap) {
			return {
				inputSourceMap,
			};
		}
		return {};
	}

	transform(
		filename: string,
		code: string,
		plugins: PluginItem[],
		options: TransformOptions = {},
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
			this.sourceMapRegistry.registerSourceMap(filename, result.map);
		}
		return result;
	}

	private unloadInternalModules() {
		console.error(
			"DEBUG: Unloading internal Jazzer.js modules for instrumentation...",
		);
		[
			"@jazzer.js/bug-detectors",
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

	get dryRun(): boolean {
		return this.isDryRun;
	}

	get includePatterns(): string[] {
		return this.includes;
	}

	get excludePatterns(): string[] {
		return this.excludes;
	}

	get coverageEnabled(): boolean {
		return this.shouldCollectSourceCodeCoverage;
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
		excludes: string[],
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
			return instrumentor.instrument(code, opts.filename)?.code || code;
		},
		// required to allow jest to run typescript files
		// jest's typescript integration will transform the typescript into javascript before giving it to the
		// instrumentor but the filename will still have a .ts extension
		{ extensions: [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"] },
	);

	registerEsmHooks(instrumentor);
}

/**
 * On Node.js >= 20.6 register an ESM loader hook so that
 * import() and static imports are instrumented too.
 */
function registerEsmHooks(instrumentor: Instrumentor): void {
	if (instrumentor.dryRun) {
		return;
	}

	const [major, minor] = process.versions.node.split(".").map(Number);
	if (major < 20 || (major === 20 && minor < 6)) {
		return;
	}

	try {
		// Dynamic require — the node:module API may not expose
		// `register` on older versions even if the check above
		// passed (e.g. unusual builds).
		const { register } = require("node:module") as {
			register: (
				specifier: string,
				options: { parentURL: string; data: unknown },
			) => void;
		};

		const loaderUrl = pathToFileURL(
			path.join(__dirname, "esm-loader.mjs"),
		).href;
		register(loaderUrl, {
			parentURL: pathToFileURL(__filename).href,
			data: {
				includes: instrumentor.includePatterns,
				excludes: instrumentor.excludePatterns,
				coverage: instrumentor.coverageEnabled,
			},
		});
	} catch {
		// Silently fall back to CJS-only instrumentation.
	}
}
