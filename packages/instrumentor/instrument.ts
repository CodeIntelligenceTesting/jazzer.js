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
import { MessageChannel, type MessagePort } from "worker_threads";

import {
	BabelFileResult,
	PluginItem,
	TransformOptions,
	transformSync,
} from "@babel/core";
import { hookRequire, TransformerOptions } from "istanbul-lib-hook";

import { fuzzer } from "@jazzer.js/fuzzer";
import { hookManager, HookType } from "@jazzer.js/hooking";

import { EdgeIdStrategy, MemorySyncIdStrategy } from "./edgeIdStrategy";
import { instrumentationPlugins } from "./plugin";
import { cjsCoverage, CjsCoverageResult } from "./plugins/codeCoverage";
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

/**
 * Serializable hook descriptor sent from the main thread to the ESM
 * loader thread.  The hook function itself stays on the main thread;
 * only the metadata needed for the Babel transform crosses the boundary.
 */
export interface SerializedHook {
	id: number;
	type: HookType;
	target: string;
	pkg: string;
	async: boolean;
}

const PROJECT_ROOT_PREFIX = (() => {
	const cwd = path.resolve(process.cwd());
	return cwd.endsWith(path.sep) ? cwd : `${cwd}${path.sep}`;
})();

function stripProjectRootPrefix(filename: string): string {
	return filename.startsWith(PROJECT_ROOT_PREFIX)
		? filename.slice(PROJECT_ROOT_PREFIX.length)
		: filename;
}

export class Instrumentor {
	private loaderPort: MessagePort | null = null;
	private readonly cjsCoverage: CjsCoverageResult;

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
		this.cjsCoverage = cjsCoverage(this.idStrategy);
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
			this.cjsCoverage.clear();
			transformations.push(
				...instrumentationPlugins.plugins,
				this.cjsCoverage.plugin,
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
			this.registerCjsPCLocations(filename);
			this.idStrategy.commitIdCount(filename);
		}
		return result;
	}

	private registerCjsPCLocations(filename: string): void {
		const entries = this.cjsCoverage.edgeEntries();
		if (entries.length === 0) return;

		const flat = new Int32Array(entries.length * 4);
		for (let i = 0; i < entries.length; i++) {
			const e = entries[i];
			flat[i * 4] = e[0];
			flat[i * 4 + 1] = e[1];
			flat[i * 4 + 2] = e[2];
			flat[i * 4 + 3] = e[3];
		}
		fuzzer.coverageTracker.registerPCLocations(
			stripProjectRootPrefix(filename),
			this.cjsCoverage.funcNames(),
			flat,
			0,
		);
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

	/** Connect the main-thread side of the loader MessagePort. */
	setLoaderPort(port: MessagePort): void {
		this.loaderPort = port;
	}

	/**
	 * Send the current hook definitions to the ESM loader thread so it
	 * can apply function-hook transformations.  Must be called after all
	 * hooks are registered and finalized, but before user modules are
	 * loaded.
	 */
	sendHooksToLoader(): void {
		if (!this.loaderPort) return;

		const hooks: SerializedHook[] = hookManager.hooks.map((hook, index) => ({
			id: index,
			type: hook.type,
			target: hook.target,
			pkg: hook.pkg,
			async: hook.async,
		}));

		this.loaderPort.postMessage({ hooks });
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
 *
 * On Node >= 20.11 (where module.register supports transferList) we
 * also establish a MessagePort to the loader thread.  This lets us
 * send function-hook definitions after bug detectors are loaded —
 * well before user modules are imported.
 */
function registerEsmHooks(instrumentor: Instrumentor): void {
	if (instrumentor.dryRun) {
		return;
	}

	const [major, minor] = process.versions.node.split(".").map(Number);
	if (major < 20 || (major === 20 && minor < 6)) {
		return;
	}

	// transferList (needed for MessagePort) requires Node >= 20.11.
	// On older 20.x builds, ESM gets coverage and compare-hooks but
	// not function hooks — a MessagePort in `data` without transferList
	// would throw DataCloneError, so we simply omit it.
	const supportsTransferList = major > 20 || (major === 20 && minor >= 11);

	try {
		const { register } = require("node:module") as {
			register: (
				specifier: string,
				options: {
					parentURL: string;
					data: unknown;
					transferList?: unknown[];
				},
			) => void;
		};

		const loaderUrl = pathToFileURL(
			path.join(__dirname, "esm-loader.mjs"),
		).href;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data: Record<string, any> = {
			includes: instrumentor.includePatterns,
			excludes: instrumentor.excludePatterns,
			coverage: instrumentor.coverageEnabled,
		};

		const options: {
			parentURL: string;
			data: unknown;
			transferList?: unknown[];
		} = { parentURL: pathToFileURL(__filename).href, data };

		if (supportsTransferList) {
			const { port1, port2 } = new MessageChannel();
			data.port = port2;
			options.transferList = [port2];
			instrumentor.setLoaderPort(port1);
		}

		register(loaderUrl, options);
	} catch {
		// Silently fall back to CJS-only instrumentation.
	}
}
