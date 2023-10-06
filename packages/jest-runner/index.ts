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

import type { JestEnvironment } from "@jest/environment";
import { TestResult } from "@jest/test-result";
import { Config } from "@jest/types";
import * as libCoverage from "istanbul-lib-coverage";
import * as reports from "istanbul-reports";
import Runtime from "jest-runtime";

import {
	initFuzzing,
	registerGlobals,
	setJazzerJsGlobal,
} from "@jazzer.js/core";

import { loadConfig } from "./config";
import { cleanupJestError, cleanupJestRunnerStack } from "./errorUtils";
import { FuzzTest } from "./fuzz";
import { interceptGlobals } from "./globalsInterceptor";
import { interceptTestState } from "./testStateInterceptor";
import { interceptScriptTransformerCalls } from "./transformerInterceptor";

export default async function jazzerTestRunner(
	globalConfig: Config.GlobalConfig,
	config: Config.ProjectConfig,
	environment: JestEnvironment,
	runtime: Runtime,
	testPath: string,
	sendMessageToJest?: boolean,
): Promise<TestResult> {
	const vmContext = environment.getVmContext();
	if (vmContext === null) throw new Error("vmContext is undefined");

	const jazzerConfig = loadConfig({
		coverage: globalConfig.collectCoverage,
		coverageReporters: globalConfig.coverageReporters as reports.ReportType[],
	});
	const globalEnvironments = [environment.getVmContext(), globalThis];
	registerGlobals(jazzerConfig, globalEnvironments);
	setJazzerJsGlobal("vmContext", vmContext);
	const instrumentor = await initFuzzing(jazzerConfig);

	interceptScriptTransformerCalls(runtime, instrumentor);

	const testState = interceptTestState(environment, jazzerConfig);
	interceptGlobals(runtime, testPath, jazzerConfig, testState);

	const circusRunner =
		await runtime["_scriptTransformer"].requireAndTranspileModule(
			"jest-circus/runner",
		);

	return circusRunner(
		globalConfig,
		config,
		environment,
		runtime,
		testPath,
		sendMessageToJest,
	).then((result: TestResult) => {
		includeImplicitElseBranches(environment.global.__coverage__);
		return cleanupTestResultDetails(result);
	});
}

function cleanupTestResultDetails(result: TestResult) {
	// Some errors, like timeouts, are created in Jest's test runner and need to be
	// post-processed to remove internal stack frames in this way.
	result.testResults.forEach((testResult) => {
		testResult.failureDetails?.forEach(cleanupJestError);
		testResult.failureMessages = testResult.failureMessages?.map<string>(
			(failureMessage) => cleanupJestRunnerStack(failureMessage) ?? "",
		);
	});
	if (result.failureMessage) {
		result.failureMessage = cleanupJestRunnerStack(result.failureMessage);
	}
	return result;
}

/**
 * Coverage fix from https://github.com/vitest-dev/vitest/pull/2275
 * In our tests this seems to only affect the coverage of TypeScript files,
 * hence including the fix in jest-runner should be sufficient.
 *
 * Original comment:
 * Work-around for #1887 and #2239 while waiting for https://github.com/istanbuljs/istanbuljs/pull/706
 * Goes through all files in the coverage map and checks if branchMap's have
 * if-statements with implicit else. When finds one, copies source location of
 * the if-statement into the else statement.
 */
export function includeImplicitElseBranches(
	coverageMapData: libCoverage.CoverageMapData,
) {
	if (!coverageMapData) {
		return;
	}
	function isEmptyCoverageRange(range: libCoverage.Range) {
		return (
			range.start === undefined ||
			range.start.line === undefined ||
			range.start.column === undefined ||
			range.end === undefined ||
			range.end.line === undefined ||
			range.end.column === undefined
		);
	}
	const coverageMap = libCoverage.createCoverageMap(coverageMapData);
	for (const file of coverageMap.files()) {
		const fileCoverage = coverageMap.fileCoverageFor(file);
		for (const branchMap of Object.values(fileCoverage.branchMap)) {
			if (branchMap.type === "if") {
				const lastIndex = branchMap.locations.length - 1;
				if (lastIndex > 0) {
					const elseLocation = branchMap.locations[lastIndex];
					if (elseLocation && isEmptyCoverageRange(elseLocation)) {
						const ifLocation = branchMap.locations[0];
						elseLocation.start = { ...ifLocation.start };
						elseLocation.end = { ...ifLocation.end };
					}
				}
			}
		}
	}
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
