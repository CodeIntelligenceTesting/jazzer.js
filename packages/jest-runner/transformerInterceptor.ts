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

// Disable ban-types to use Function as type in interceptions.
/* eslint-disable @typescript-eslint/ban-types */

import fs from "fs";
import tmp from "tmp";
import {
	CallerTransformOptions,
	TransformedSource,
	TransformResult,
} from "@jest/transform";
import Runtime from "jest-runtime";
import { Instrumentor, SourceMap } from "@jazzer.js/instrumentor";

tmp.setGracefulCleanup();

// Code containing coverage instrumentation calls is considered to be instrumented.
const INSTRUMENTATION_MARKER = "Fuzzer.coverageTracker.incrementCounter";

export function interceptScriptTransformerCalls(
	runtime: Runtime,
	instrumentor: Instrumentor,
) {
	const scriptTransformer = runtime["_scriptTransformer"];

	// _buildTransformResult is used in transformSource and transformSourceAsync
	// and creates a cache file for the transformed code. We instrument and hence change
	// the result, so that the cache file does not match anymore and transformation happens
	// every time. This prevents loading wrongly (not) instrumented versions from previous
	// runs with different configurations.
	intercept(
		scriptTransformer,
		"_buildTransformResult",
		(original: Function) =>
			(
				filename: string,
				cacheFilePath: string,
				content: string,
				transformer: Transformer | undefined,
				shouldCallTransform: boolean,
				options: CallerTransformOptions,
				processed: TransformedSource | null,
				sourceMapPath: string | null,
			): TransformResult => {
				const result: TransformResult = original(
					filename,
					cacheFilePath,
					content,
					transformer,
					shouldCallTransform,
					options,
					processed,
					sourceMapPath,
				);
				if (!result || isInstrumented(result.code)) {
					return result;
				}
				const instrumented = instrumentor.instrument(
					result.code,
					filename,
					sourceMapContent(sourceMapPath),
				);
				if (instrumented?.map) {
					sourceMapPath = writeSourceMap(instrumented.map);
				}
				return {
					code: instrumented?.code ?? result.code,
					originalCode: result.originalCode,
					sourceMapPath: sourceMapPath,
				};
			},
	);

	// _transformAndBuildScript can call transformSource, which requires checks to
	// prevent double instrumentation.
	// As the original result could already apply transformations the result includes
	// a source map path, which the instrumentor needs to take into account for its
	// instrumentation. The result is not saved in a cache file and can be changed
	// directly to point to a dumped source map file.
	intercept(
		scriptTransformer,
		"_transformAndBuildScript",
		(original: Function) =>
			(
				filename: string,
				options: unknown,
				transformOptions: unknown,
				fileSource?: string,
			): TransformResult => {
				const originalResult: TransformResult = original(
					filename,
					options,
					transformOptions,
					fileSource,
				);
				return processTransformResult(originalResult, filename, instrumentor);
			},
	);

	// Similar to _transformAndBuildScript, but async. Is used to load ESM modules.
	intercept(
		scriptTransformer,
		"_transformAndBuildScriptAsync",
		(original: Function) =>
			async (
				filename: string,
				options: unknown,
				transformOptions: unknown,
				fileSource?: string,
			): Promise<TransformResult> => {
				const originalResult: TransformResult = await original(
					filename,
					options,
					transformOptions,
					fileSource,
				);
				return processTransformResult(originalResult, filename, instrumentor);
			},
	);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function intercept(obj: any, name: string, interceptor: Function) {
	obj[name] = interceptor(obj[name].bind(obj));
}

function isInstrumented(code: string): boolean {
	return code.includes(INSTRUMENTATION_MARKER);
}

function processTransformResult(
	originalResult: TransformResult,
	filename: string,
	instrumentor: Instrumentor,
): TransformResult {
	// If already instrumented by previous calls or internal invocation of
	// transformSource simply return the original result.
	if (isInstrumented(originalResult.code)) {
		return originalResult;
	}

	const sourceMap = sourceMapContent(originalResult.sourceMapPath);
	const instrumented = instrumentor.instrument(
		originalResult.code,
		filename,
		sourceMap,
	);
	if (!instrumented) {
		return originalResult;
	}
	// Source map path is only set if a transformation happened, in that case the
	// code should be instrumented via the other intercepted method.
	let sourceMapPath = originalResult.sourceMapPath;
	if (instrumented?.map) {
		sourceMapPath = writeSourceMap(instrumented.map);
	}
	return {
		code: instrumented.code ?? originalResult.code,
		sourceMapPath: sourceMapPath,
		originalCode: originalResult.originalCode,
	};
}

function writeSourceMap(sourceMap: Object) {
	const sourceMapPath = tmp.fileSync({ prefix: "jazzerjs-map" }).name;
	fs.writeFileSync(sourceMapPath, JSON.stringify(sourceMap));
	return sourceMapPath;
}

function sourceMapContent(sourceMapPath: string | null): SourceMap | undefined {
	if (sourceMapPath) {
		try {
			return JSON.parse(fs.readFileSync(sourceMapPath).toString());
		} catch (e) {
			// Ignore missing source map
		}
	}
}
