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
import { fuzz, FuzzTest } from "./fuzz";
import * as vm from "vm";
import {
	computeBasicPrototypeSnapshots,
	detectPrototypePollutionOfBasicObjects,
} from "./prototype-pollution";
import * as Module from "module";

type InitialModule = Omit<Module, "require" | "parent" | "paths">;
type ModuleRegistry = Map<string, InitialModule | Module>;
interface InternalModuleOptions extends Required<CallerTransformOptions> {
	isInternalModule: boolean;
}

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
	//  - Prototype pollution (and other bug detectors) should be added to the vm
	//    - Command injection/path traversal seem to work because they hook builtin node functions
	//      that are shared between vm and host (my guess)
	//    - PP is a ATM host-only and never ran in vm.
	//    - There might be several solutions:
	//      1) Bug detectors and fuzzer core are loaded directly into the VM. Since BDs talk to hook manager
	//         and some things should be run after each input, the fuzzer should also be loaded into vm.
	//      2) Load bug detectors into VM and run fuzzer in host, but provide a way to communicate
	//         between VM and host.
	//  - Check: Custom hooks should also not work ATM, since they are loaded by the fuzzer in the host.
	//           CHECKED: Custom hooks and bug detectors that hook functions actually work!
	//  - Prototype pollution: the problem is that the prototype of Object on host is not the
	//    same object as the Object in VM. Polluting one won't pollute the other.
	//    * The approach in this commit is to share the host functions that detect PP into the VM
	//      context, and run them in the VM on the objects in the VM.
	//    * A better approach would load the bug detectors into the VM and run them there. This has
	//      another problem that now the before/after hooks in core/callback.ts run the functions in the host.
	//      Or actually, the functions are not even registered, since the PP bug detector is loaded in the VM.
	//      Jest should forward the bug detector functions to our callback.ts by:
	//          - wiring the registration functions to the VM
	//          - better ideas?
	//     * Currently does not work in fuzzing mode, but the principle is clear.
	// - Add (or convert to ticket): .only.fuzz, .failing.fuzz,  .todo.fuzz, .only.failing.fuzz
	const originalExecModule = runtime["_execModule"].bind(runtime);
	runtime["_execModule"] = (
		localModule: InitialModule,
		options: InternalModuleOptions | undefined,
		moduleRegistry: ModuleRegistry,
		from: string | undefined,
		moduleName?: string,
	): unknown => {
		// console.log("[runtime.execModule] " + moduleName + "  ---   " + from);
		// console.log(localModule);
		return originalExecModule(localModule, options, moduleRegistry, from);
	};

	const jazzerConfig = loadConfig({
		coverage: globalConfig.collectCoverage,
		coverageReporters: globalConfig.coverageReporters as reports.ReportType[],
	});
	const globalEnvironments = [environment.getVmContext(), globalThis];
	const instrumentor = await initFuzzing(
		jazzerConfig,
		globalEnvironments,
		"jest",
	);
	const { currentTestState, currentTestTimeout, originalTestNamePattern } =
		interceptCurrentStateAndTimeout(environment, jazzerConfig);
	interceptScriptTransformerCalls(runtime, instrumentor);
	interceptGlobals(
		environment,
		runtime,
		testPath,
		jazzerConfig,
		currentTestState,
		currentTestTimeout,
		originalTestNamePattern,
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
	let originalTestNamePattern: RegExp | undefined;

	environment.handleTestEvent = (event: Circus.Event, state: Circus.State) => {
		testState = state.currentDescribeBlock;
		if (event.name === "setup") {
			// In regression, mode fuzz tests are added as describe block with every seed as test inside.
			// This breaks the test name pattern matching, so we remove the $ from the end of the pattern,
			// and skip tests not matching the original pattern in the fuzz function.
			if (
				jazzerConfig.mode == "regression" &&
				state.testNamePattern?.source?.endsWith("$")
			) {
				originalTestNamePattern = state.testNamePattern;
				state.testNamePattern = new RegExp(
					state.testNamePattern.source.slice(0, -1),
				);
			}
		} else if (event.name === "test_start") {
			// In fuzzing mode, only execute the first encountered (not skipped) fuzz test
			// and mark all others as skipped.
			if (jazzerConfig.mode === "fuzzing") {
				if (
					!firstFuzzTestEncountered &&
					state.testNamePattern?.test(testName(event.test))
				) {
					firstFuzzTestEncountered = true;
				} else {
					event.test.mode = "skip";
				}
			}
		} else if (event.name === "test_fn_start") {
			// Disable Jest timeout in fuzzing mode by setting it to a high value,
			// otherwise Jest will kill the fuzz test after (default) 5 seconds.
			if (jazzerConfig.mode === "fuzzing") {
				state.testTimeout = 1000 * 60 * 24 * 365;
			}
			testTimeout = state.testTimeout;
		}
		if (originalHandleTestEvent) {
			return originalHandleTestEvent(event as Circus.AsyncEvent, state);
		}
	};
	return {
		currentTestState: () => testState,
		currentTestTimeout: () => testTimeout,
		originalTestNamePattern: () => originalTestNamePattern,
	};
}

function interceptGlobals(
	environment: JestEnvironment,
	runtime: Runtime,
	testPath: string,
	jazzerConfig: Options,
	currentTestState: () => Circus.DescribeBlock | undefined,
	currentTestTimeout: () => number | undefined,
	originalTestNamePattern: () => RegExp | undefined,
) {
	console.log("-------------------------------------------------------------");
	const extendedEnvironment = environment.getVmContext() ?? {};
	extendedEnvironment["computeBasicPrototypeSnapshots"] =
		computeBasicPrototypeSnapshots;
	extendedEnvironment["detectPrototypePollutionOfBasicObjects"] =
		detectPrototypePollutionOfBasicObjects;
	extendedEnvironment["BASIC_PROTO_SNAPSHOTS"] = vm.runInContext(
		'computeBasicPrototypeSnapshots([{},[],"",42,true,()=>{}]);',
		extendedEnvironment,
	);
	console.log("-------------------------------------------------------------");

	const originalSetGlobalsForRuntime =
		runtime.setGlobalsForRuntime.bind(runtime);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	runtime.setGlobalsForRuntime = (globals: any) => {
		globals.it.fuzz = fuzz(
			extendedEnvironment,
			globals,
			testPath,
			jazzerConfig,
			currentTestState,
			currentTestTimeout,
			originalTestNamePattern,
			"standard",
		);
		globals.it.skip.fuzz = fuzz(
			extendedEnvironment,
			globals,
			testPath,
			jazzerConfig,
			currentTestState,
			currentTestTimeout,
			originalTestNamePattern,
			"skip",
		);
		globals.it.only.fuzz = fuzz(
			extendedEnvironment,
			globals,
			testPath,
			jazzerConfig,
			currentTestState,
			currentTestTimeout,
			originalTestNamePattern,
			"only",
		);
		originalSetGlobalsForRuntime(globals);
	};
}

function instrumentIfNotInstrumented(
	result: TransformResult,
	instrumentor: Instrumentor,
	filename: string,
): TransformResult {
	let newResult;
	if (
		result?.code &&
		!result.code.includes("Fuzzer.coverageTracker.incrementCounter")
	) {
		newResult = instrumentor.instrumentRaw(filename, result.code);
	}

	if (newResult) {
		return {
			code: newResult.code ?? result.code,
			originalCode: result.originalCode,
			sourceMapPath: result.sourceMapPath,
		};
	} else {
		return result;
	}
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
		console.log("************************************* 1 " + filename);
		const result = originalBuildTransformResult(
			filename,
			cacheFilePath,
			content,
			transformer,
			shouldCallTransform,
			options,
			processed,
			sourceMapPath,
		);
		return instrumentIfNotInstrumented(
			result,
			instrumentor,
			filename,
		) as TransformResult;
	};

	const originalTransformAndBuildScript =
		scriptTransformer._transformAndBuildScript.bind(scriptTransformer);
	scriptTransformer._transformAndBuildScript = (
		filename: string,
		options: unknown,
		transformOptions: unknown,
		fileSource?: string,
	): TransformResult => {
		console.log("************************************* 2 " + filename);
		const result: TransformResult = originalTransformAndBuildScript(
			filename,
			options,
			transformOptions,
			fileSource,
		);
		return instrumentIfNotInstrumented(result, instrumentor, filename);
	};

	const originalTransformAndBuildScriptAsync =
		scriptTransformer._transformAndBuildScriptAsync.bind(scriptTransformer);
	scriptTransformer._transformAndBuildScriptAsync = async (
		filename: string,
		options: unknown,
		transformOptions: unknown,
		fileSource?: string,
	): Promise<TransformResult> => {
		console.log("************************************* 3 " + filename);
		const result: TransformResult = await originalTransformAndBuildScriptAsync(
			filename,
			options,
			transformOptions,
			fileSource,
		);
		return instrumentIfNotInstrumented(result, instrumentor, filename);
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
