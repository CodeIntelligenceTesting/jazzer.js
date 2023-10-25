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

import { JestEnvironment } from "@jest/environment";
import { Circus } from "@jest/types";

import { Options } from "@jazzer.js/core";

// Arbitrary high value to disable Jest timeout.
const JEST_TIMEOUT_DISABLED = 1000 * 60 * 24 * 365;

export type InterceptedTestState = {
	currentTestState: () => Circus.DescribeBlock | undefined;
	currentTestTimeout: () => number | undefined;
	originalTestNamePattern: () => RegExp | undefined;
};

export function interceptTestState(
	environment: JestEnvironment,
	jazzerConfig: Options,
): InterceptedTestState {
	const originalHandleTestEvent =
		environment.handleTestEvent?.bind(environment);
	let testState: Circus.DescribeBlock | undefined;
	let testTimeout: number | undefined;
	let firstFuzzTestEncountered: boolean | undefined;
	let originalTestNamePattern: RegExp | undefined;

	environment.handleTestEvent = (event: Circus.Event, state: Circus.State) => {
		testState = state.currentDescribeBlock;
		// First event, created once on start up.
		if (event.name === "setup") {
			// In regression mode, fuzz tests are added as describe block with every seed file as dedicated
			// test inside. This breaks test name pattern matching, so remove "$" from the end of the pattern,
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
			// Created for every test function, before lifecycle hooks.
		} else if (event.name === "test_start") {
			// In fuzzing mode, only execute the first encountered (not skipped) fuzz test
			// and mark all others as skipped.
			if (jazzerConfig.mode === "fuzzing" && event.test.mode !== "skip") {
				if (
					!firstFuzzTestEncountered &&
					(!state.testNamePattern ||
						(state.testNamePattern.test(testName(event.test)) &&
							(!state.hasFocusedTests || event.test.mode === "only")))
				) {
					firstFuzzTestEncountered = true;
				} else {
					event.test.mode = "skip";
				}
			}
			// Created for every test function, before the actual function invocation.
		} else if (event.name === "test_fn_start") {
			// Disable Jest timeout in fuzzing mode by setting it to a high value,
			// otherwise Jest will kill the fuzz test after it's timeout (default 5 seconds).
			if (jazzerConfig.mode === "fuzzing") {
				state.testTimeout = JEST_TIMEOUT_DISABLED;
			}
			// Use configured timeout as fuzzing timeout as well. Every invocation
			// of the fuzz test has to be faster than this.
			testTimeout = state.testTimeout;
		}
		if (originalHandleTestEvent) {
			return originalHandleTestEvent(event as Circus.AsyncEvent, state);
		}
	};

	// Return closures to access latest received state.
	return {
		currentTestState: () => testState,
		currentTestTimeout: () => testTimeout,
		originalTestNamePattern: () => originalTestNamePattern,
	};
}

function testName(test: Circus.TestEntry): string {
	const titles = [];
	let parent: Circus.TestEntry | Circus.DescribeBlock | undefined = test;
	do {
		titles.unshift(parent.name);
	} while ((parent = parent.parent));
	titles.shift(); // Remove root describe block.
	return titles.join(" ");
}
