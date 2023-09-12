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
import { TestResult } from "@jest/test-result";
import { Config } from "@jest/types";
import type { JestEnvironment } from "@jest/environment";

import { initFuzzing, setJazzerJsGlobal } from "@jazzer.js/core";

import { loadConfig } from "./config";
import { FuzzTest } from "./fuzz";
import { interceptScriptTransformerCalls } from "./transformerInterceptor";
import { interceptTestState } from "./testStateInterceptor";
import { interceptGlobals } from "./globalsInterceptor";
import { cleanupJestError, cleanupJestRunnerStack } from "./errorUtils";

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
	setJazzerJsGlobal("vmContext", vmContext);

	const jazzerConfig = loadConfig({
		coverage: globalConfig.collectCoverage,
		coverageReporters: globalConfig.coverageReporters as reports.ReportType[],
	});
	const globalEnvironments = [environment.getVmContext(), globalThis];
	const instrumentor = await initFuzzing(jazzerConfig, globalEnvironments);
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
