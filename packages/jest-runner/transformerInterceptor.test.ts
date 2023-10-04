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

import fs from "fs";

import { TransformResult } from "@jest/transform";
import Runtime from "jest-runtime";
import tmp from "tmp";

import { Instrumentor } from "@jazzer.js/instrumentor";
import { SourceMap } from "@jazzer.js/instrumentor/dist/SourceMapRegistry";

import { interceptScriptTransformerCalls } from "./transformerInterceptor";

tmp.setGracefulCleanup();

describe("TransformerInterceptor", () => {
	describe("_buildTransformResult", () => {
		it("instrument sources", () => {
			const instrumentedReturn = {
				code: "instrumented code",
				map: "instrumented map",
			};
			const { instrumentor, runtime, scriptTransformer } =
				mockInstrumentorAndRuntime(instrumentedReturn);

			const originalResult = {
				code: "original code",
				sourceMapPath: "filename",
				originalCode: "original code",
			};
			const originalBuildTransformResult =
				scriptTransformer._buildTransformResult;
			originalBuildTransformResult.mockImplementationOnce(() => originalResult);

			const filename = "filename";
			const processed = {
				code: "some code",
				map: buildSourceMap({ file: filename }),
			};

			interceptScriptTransformerCalls(runtime, instrumentor);
			const result = scriptTransformer._buildTransformResult(
				filename,
				"cacheFilePath",
				"content",
				undefined,
				false,
				{},
				processed,
				null,
			);

			expect(result.code).toBe(instrumentedReturn.code);
			expect(result.originalCode).toBe(originalResult.originalCode);
			expect(result.sourceMapPath).toBeDefined();
			const sourceMapContent = JSON.parse(
				fs.readFileSync(result.sourceMapPath, "utf8"),
			);
			expect(sourceMapContent).toBe(instrumentedReturn.map);

			expect(instrumentor.instrument).toHaveBeenCalledWith(
				originalResult.code,
				filename,
				undefined,
			);
		});

		it("does not intercepts sources if already instrumented", () => {
			const { instrumentor, runtime, scriptTransformer } =
				mockInstrumentorAndRuntime();
			const originalResult = {
				code: "some code; Fuzzer.coverageTracker.incrementCounter(); some other code;",
				sourceMapPath: "filename",
				originalCode: "original code",
			};
			const originalBuildTransformResult =
				scriptTransformer._buildTransformResult;
			originalBuildTransformResult.mockImplementationOnce(() => originalResult);

			const filename = "filename";
			const processed = {
				code: "some code",
				map: buildSourceMap({ file: filename }),
			};

			interceptScriptTransformerCalls(runtime, instrumentor);
			const result = scriptTransformer._buildTransformResult(
				filename,
				"cacheFilePath",
				"content",
				undefined,
				false,
				{},
				processed,
				null,
			);

			expect(result).toBe(originalResult);
			expect(instrumentor.instrument).not.toHaveBeenCalled();
		});
	});

	describe("_transformAndBuildScript", () => {
		it("does not instrument result if already instrumented", () => {
			const { instrumentor, runtime, scriptTransformer } =
				mockInstrumentorAndRuntime();
			const originalResult: TransformResult = {
				code: "some code; Fuzzer.coverageTracker.incrementCounter(); some other code;",
				originalCode: "originalCode",
				sourceMapPath: "sourceMapPath",
			};
			const originalTransformAndBuildScript =
				scriptTransformer._transformAndBuildScript;
			originalTransformAndBuildScript.mockImplementationOnce(
				() => originalResult,
			);

			interceptScriptTransformerCalls(runtime, instrumentor);
			const result = scriptTransformer._transformAndBuildScript(
				"filename",
				{},
				{},
				"fileSource",
			);

			expect(result).toBe(originalResult);
			expect(originalTransformAndBuildScript).toHaveBeenCalledWith(
				"filename",
				{},
				{},
				"fileSource",
			);
			expect(instrumentor.instrument).not.toHaveBeenCalled();
		});

		it("writes source map file if instrumented", () => {
			const { instrumentor, runtime, scriptTransformer } =
				mockInstrumentorAndRuntime({
					code: "instrumentedCode",
					map: { fakeSourceMap: "fakeSourceMap" },
				});

			const originalTransformAndBuildScript =
				scriptTransformer._transformAndBuildScript;
			originalTransformAndBuildScript.mockImplementationOnce(() => ({
				code: "some code",
				originalCode: "originalCode",
				sourceMapPath: null,
			}));

			interceptScriptTransformerCalls(runtime, instrumentor);
			const result = scriptTransformer._transformAndBuildScript(
				"filename",
				{},
				{},
				"fileSource",
			);

			expect(originalTransformAndBuildScript).toHaveBeenCalledWith(
				"filename",
				{},
				{},
				"fileSource",
			);
			expect(result.code).toBe("instrumentedCode");
			expect(result.originalCode).toBe("originalCode");
			expect(result.sourceMapPath).toBeDefined();
			const sourceMapContent = fs.readFileSync(
				result.sourceMapPath as string,
				"utf8",
			);
			expect(sourceMapContent).toBe('{"fakeSourceMap":"fakeSourceMap"}');
		});

		it("applies existing source map in instrumentation", () => {
			const { instrumentor, runtime, scriptTransformer } =
				mockInstrumentorAndRuntime({
					code: "instrumentedCode",
					map: { fakeSourceMap: "fakeSourceMap" },
				});

			const sourceMap = buildSourceMap();
			const sourceMapFile = tmp.fileSync({ prefix: "jazzerjs-test" });
			fs.writeFileSync(sourceMapFile.name, JSON.stringify(sourceMap));

			const originalTransformAndBuildScript =
				scriptTransformer._transformAndBuildScript;
			originalTransformAndBuildScript.mockImplementationOnce(() => ({
				code: "some code",
				originalCode: "originalCode",
				sourceMapPath: sourceMapFile.name,
			}));

			interceptScriptTransformerCalls(runtime, instrumentor);
			scriptTransformer._transformAndBuildScript(
				"filename",
				{},
				{},
				"fileSource",
			);

			expect(instrumentor.instrument).toHaveBeenCalledWith(
				"some code",
				"filename",
				sourceMap,
			);
		});
	});
});

function mockInstrumentorAndRuntime(instrumentorReturnValue?: unknown): {
	instrumentor: Instrumentor;
	runtime: Runtime;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	scriptTransformer: any;
} {
	const instrumentor = new Instrumentor();
	instrumentor.instrument = jest.fn().mockReturnValue(instrumentorReturnValue);

	// Mocking runtime and its deeply nested structures
	// turns out to be quite complex. Using any for now.
	const runtime = {
		_scriptTransformer: {
			_buildTransformResult: jest.fn(),
			_transformAndBuildScript: jest.fn(),
			_transformAndBuildScriptAsync: jest.fn(),
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
	return {
		instrumentor,
		runtime,
		scriptTransformer: runtime["_scriptTransformer"],
	};
}

function buildSourceMap(map?: Partial<SourceMap>) {
	return {
		version: 3,
		sources: ["source1", "source2"],
		names: ["name1", "name2"],
		sourceRoot: "",
		sourcesContent: ["sourceContent1", "sourceContent2"],
		mappings: "mappings",
		file: "filename",
		...map,
	};
}
