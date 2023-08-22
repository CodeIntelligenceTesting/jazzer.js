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

import * as reports from "istanbul-reports";
import Runtime from "jest-runtime";
import {
	CallerTransformOptions,
	TransformedSource,
	TransformResult,
} from "@jest/transform";
import { TestResult } from "@jest/test-result";
import { Circus, Config } from "@jest/types";
import type { JestEnvironment } from "@jest/environment";

import { initFuzzing, Options } from "@jazzer.js/core";
import { Instrumentor } from "@jazzer.js/instrumentor";

import { loadConfig } from "./config";
import { cleanupJestError } from "./errorUtils";
import { fuzz, FuzzTest, skip } from "./fuzz";

export default async function jazzerTestRunner(
	globalConfig: Config.GlobalConfig,
	config: Config.ProjectConfig,
	environment: JestEnvironment,
	runtime: Runtime,
	testPath: string,
	sendMessageToJest?: boolean,
): Promise<TestResult> {
	// TODO:
	// - Instrumentation!
	//  - Cleanup
	//  - Apologies for the bad hack
	//  - Implement correct source map handling

	const jazzerConfig = loadConfig({
		coverage: globalConfig.collectCoverage,
		coverageReporters: globalConfig.coverageReporters as reports.ReportType[],
	});
	const globalEnvironments = [environment.getVmContext(), globalThis];

	const instrumentor = await initFuzzing(jazzerConfig, globalEnvironments);
	const { currentTestState, currentTestTimeout } =
		interceptCurrentStateAndTimeout(environment, jazzerConfig);
	interceptScriptTransformerCalls(runtime, instrumentor);

	interceptGlobals(
		runtime,
		testPath,
		jazzerConfig,
		currentTestState,
		currentTestTimeout,
	);

	const circusRunner = await runtime[
		"_scriptTransformer"
	].requireAndTranspileModule("jest-circus/runner");
	return circusRunner(
		globalConfig,
		config,
		environment,
		runtime,
		testPath,
		sendMessageToJest,
	).then((result: TestResult) => {
		result.testResults.forEach((testResult) => {
			testResult.failureDetails?.forEach(cleanupJestError);
		});
		return result;
	});
}

function interceptCurrentStateAndTimeout(
	environment: JestEnvironment,
	jazzerConfig: Options,
) {
	const originalHandleTestEvent =
		environment.handleTestEvent?.bind(environment);
	let testState: Circus.DescribeBlock | undefined;
	let testTimeout: number | undefined;
	let firstFuzzTestEncountered: boolean | undefined;

	environment.handleTestEvent = (event: Circus.Event, state: Circus.State) => {
		//console.log(event);
		if (event.name === "setup") {
		} else if (event.name === "test_start") {
			if (jazzerConfig.mode === "fuzzing") {
				if (
					!firstFuzzTestEncountered &&
					state.testNamePattern?.test(testName(event.test))
				) {
					firstFuzzTestEncountered = true;
				} else {
					event.test.mode = "skip";
				}
			} else if (jazzerConfig.mode === "regression") {
				// && state.testNamePattern?.source.endsWith("$")) {
				// state.testNamePattern = new RegExp(state.testNamePattern.source.slice(0, -1));
			}
		} else if (event.name === "test_fn_start") {
			// Disable Jest timeout in fuzzing mode by setting it to a high value.
			if (jazzerConfig.mode === "fuzzing") {
				state.testTimeout = 1000 * 60 * 24 * 365;
			} else {
				testTimeout = state.testTimeout;
			}
		} else if (event.name === "start_describe_definition") {
			testState = state.currentDescribeBlock;
		}
		if (originalHandleTestEvent) {
			return originalHandleTestEvent(event as Circus.AsyncEvent, state);
		}
	};
	return {
		currentTestState: () => testState?.parent,
		currentTestTimeout: () => testTimeout,
	};
}

function interceptGlobals(
	runtime: Runtime,
	testPath: string,
	jazzerConfig: Options,
	currentTestState: () => Circus.DescribeBlock | undefined,
	currentTestTimeout: () => number | undefined,
) {
	const originalSetGlobalsForRuntime =
		runtime.setGlobalsForRuntime.bind(runtime);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	runtime.setGlobalsForRuntime = (globals: any) => {
		globals.it.fuzz = fuzz(
			globals,
			testPath,
			jazzerConfig,
			currentTestState,
			currentTestTimeout,
		);
		globals.it.skip.fuzz = skip(globals);
		globals.test.fuzz = fuzz(
			globals,
			testPath,
			jazzerConfig,
			currentTestState,
			currentTestTimeout,
		);
		globals.test.skip.fuzz = skip(globals);
		originalSetGlobalsForRuntime(globals);
	};
}

function interceptScriptTransformerCalls(
	runtime: Runtime,
	instrumentor: Instrumentor,
) {
	const scriptTransformer = runtime["_scriptTransformer"];
	const originalBuildTransformResult =
		scriptTransformer._buildTransformResult.bind(scriptTransformer);
	scriptTransformer._buildTransformResult = (
		filename: string,
		cacheFilePath: string,
		content: string,
		transformer: Transformer | undefined,
		shouldCallTransform: boolean,
		options: CallerTransformOptions,
		processed: TransformedSource | null,
		sourceMapPath: string | null,
	): TransformResult => {
		if (processed?.code) {
			const newResult = instrumentor.instrumentFoo(filename, processed?.code);
			console.log("instrumenting buildResult: " + filename);
			processed = {
				code: newResult?.code ?? processed?.code,
			};
		}
		return originalBuildTransformResult(
			filename,
			cacheFilePath,
			content,
			transformer,
			shouldCallTransform,
			options,
			processed,
			sourceMapPath,
		);
	};
}

function testName(test: Circus.TestEntry): string {
	const titles = [];
	let parent: Circus.TestEntry | Circus.DescribeBlock | undefined = test;
	do {
		titles.unshift(parent.name);
	} while ((parent = parent.parent));
	titles.shift();
	return titles.join(" ");
}

// Global definition of the Jest fuzz test extension function.
// This is required to allow the Typescript compiler to recognize it.
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace jest {
		interface It {
			fuzz: FuzzTest;
		}
	}
}
