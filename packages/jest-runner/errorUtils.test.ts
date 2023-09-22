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

import {
	cleanupJestError,
	removeTopFrames,
	removeTopFramesFromError,
} from "./errorUtils";

describe("ErrorUtils", () => {
	const error = new Error();
	const stack = `Error: thrown: "Exceeded timeout of 5000 ms for a test.
Add a timeout value to this test to increase the timeout, if this is a long-running test. See https://jestjs.io/docs/api#testname-fn-timeout."
    at /home/Code-Intelligence/jazzer.js/packages/jest-runner/fuzz.ts:163:3
    at _dispatchDescribe (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-circus/build/index.js:91:26)
    at describe (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-circus/build/index.js:55:5)
    at runInRegressionMode (/home/Code-Intelligence/jazzer.js/packages/jest-runner/fuzz.ts:145:24)
    at Function.fuzz (/home/Code-Intelligence/jazzer.js/packages/jest-runner/fuzz.ts:110:20)
    at fuzz (/home/Code-Intelligence/jazzer.js/tests/jest_integration/jest_project/integration.fuzz.js:44:5)
    at _dispatchDescribe (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-circus/build/index.js:91:26)
    at describe (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-circus/build/index.js:55:5)
    at Object.describe (/home/Code-Intelligence/jazzer.js/tests/jest_integration/jest_project/integration.fuzz.js:27:1)
    at Runtime._execModule (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-runtime/build/index.js:1439:24)
    at Runtime._loadModule (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-runtime/build/index.js:1022:12)
    at Runtime.requireModule (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-runtime/build/index.js:882:12)
    at jestAdapter (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-circus/build/legacy-code-todo-rewrite/jestAdapter.js:77:13)
    at runTestInternal (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-runner/build/runTest.js:367:16)
    at runTest (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-runner/build/runTest.js:444:34)`;

	beforeEach(() => {
		error.stack = stack;
	});

	describe("clean up Jest runner frames", () => {
		it("in errors", () => {
			const result = cleanupJestError(error);
			expect(result instanceof Error).toBeTruthy();
			if (result instanceof Error) {
				expect(result.stack)
					.toMatch(`Error: thrown: "Exceeded timeout of 5000 ms for a test.
Add a timeout value to this test to increase the timeout, if this is a long-running test. See https://jestjs.io/docs/api#testname-fn-timeout."
    at fuzz (/home/Code-Intelligence/jazzer.js/tests/jest_integration/jest_project/integration.fuzz.js:44:5)
    at _dispatchDescribe (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-circus/build/index.js:91:26)
    at describe (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-circus/build/index.js:55:5)
    at Object.describe (/home/Code-Intelligence/jazzer.js/tests/jest_integration/jest_project/integration.fuzz.js:27:1)
    at Runtime._execModule (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-runtime/build/index.js:1439:24)
    at Runtime._loadModule (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-runtime/build/index.js:1022:12)
    at Runtime.requireModule (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-runtime/build/index.js:882:12)
    at jestAdapter (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-circus/build/legacy-code-todo-rewrite/jestAdapter.js:77:13)
    at runTestInternal (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-runner/build/runTest.js:367:16)
    at runTest (/home/Code-Intelligence/jazzer.js/tests/jest_integration/node_modules/jest-runner/build/runTest.js:444:34)`);
			}
		});
	});
});
