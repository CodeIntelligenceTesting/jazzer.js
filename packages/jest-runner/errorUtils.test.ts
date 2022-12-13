/*
 * Copyright 2022 Code Intelligence GmbH
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
	removeTopFrames,
	removeBottomFrames,
	cleanupJestError,
	cleanupJestRunnerStack,
	removeTopFramesFromError,
	removeBottomFramesFromError,
} from "./errorUtils";

describe("ErrorUtils", () => {
	const error = new Error();
	const stack = `Error:
    at /home/norbert/Code-Intelligence/jazzer.js/examples/jest_integration/integration.fuzz.js:27:3
    at doneCallbackPromise (/home/norbert/Code-Intelligence/jazzer.js/packages/jest-runner/dist/fuzz.js:213:20)
    at Promise.then._a (/home/norbert/Code-Intelligence/jazzer.js/packages/jest-runner/dist/fuzz.js:169:20)
    at new Promise (<anonymous>)
    at /home/norbert/Code-Intelligence/jazzer.js/packages/jest-runner/dist/fuzz.js:162:16
    at Generator.next (<anonymous>)
    at fulfilled (/home/norbert/Code-Intelligence/jazzer.js/packages/jest-runner/dist/fuzz.js:58:24)
`;

	beforeEach(() => {
		error.stack = stack;
	});

	describe("clean up Jest runner frames", () => {
		it("in errors", () => {
			expect(cleanupJestError(undefined)).toBeUndefined();
			const cleanedUp = cleanupJestError(error);
			expect((cleanedUp || {}).stack).toEqual(`Error:
    at /home/norbert/Code-Intelligence/jazzer.js/examples/jest_integration/integration.fuzz.js:27:3
`);
		});

		it("in stacks", () => {
			expect(cleanupJestRunnerStack(undefined)).toBeUndefined();
			expect(cleanupJestRunnerStack(stack)).toEqual(`Error:
    at /home/norbert/Code-Intelligence/jazzer.js/examples/jest_integration/integration.fuzz.js:27:3
`);
		});
	});

	describe("remove stack frames", () => {
		describe("in errors", () => {
			it("on top", () => {
				expect(removeTopFramesFromError(undefined, 1)).toBeUndefined();
				const cleanedUp = removeTopFramesFromError(error, 3);
				expect((cleanedUp || {}).stack).toEqual(`Error:
    at new Promise (<anonymous>)
    at /home/norbert/Code-Intelligence/jazzer.js/packages/jest-runner/dist/fuzz.js:162:16
    at Generator.next (<anonymous>)
    at fulfilled (/home/norbert/Code-Intelligence/jazzer.js/packages/jest-runner/dist/fuzz.js:58:24)
`);
			});

			it("on bottom", () => {
				expect(removeBottomFramesFromError(undefined, 1)).toBeUndefined();
				const cleanedUp = removeBottomFramesFromError(error, 3);
				expect((cleanedUp || {}).stack).toEqual(`Error:
    at /home/norbert/Code-Intelligence/jazzer.js/examples/jest_integration/integration.fuzz.js:27:3
    at doneCallbackPromise (/home/norbert/Code-Intelligence/jazzer.js/packages/jest-runner/dist/fuzz.js:213:20)
    at Promise.then._a (/home/norbert/Code-Intelligence/jazzer.js/packages/jest-runner/dist/fuzz.js:169:20)
    at new Promise (<anonymous>)
`);
			});
		});

		describe("in stacks", () => {
			it("on top", () => {
				expect(removeTopFrames(undefined, 1)).toBeUndefined();
				expect(removeTopFrames(stack, 3)).toEqual(`Error:
    at new Promise (<anonymous>)
    at /home/norbert/Code-Intelligence/jazzer.js/packages/jest-runner/dist/fuzz.js:162:16
    at Generator.next (<anonymous>)
    at fulfilled (/home/norbert/Code-Intelligence/jazzer.js/packages/jest-runner/dist/fuzz.js:58:24)
`);
			});

			it("on bottom", () => {
				expect(removeBottomFrames(undefined, 1)).toBeUndefined();
				expect(removeBottomFrames(stack, 3)).toEqual(`Error:
    at /home/norbert/Code-Intelligence/jazzer.js/examples/jest_integration/integration.fuzz.js:27:3
    at doneCallbackPromise (/home/norbert/Code-Intelligence/jazzer.js/packages/jest-runner/dist/fuzz.js:213:20)
    at Promise.then._a (/home/norbert/Code-Intelligence/jazzer.js/packages/jest-runner/dist/fuzz.js:169:20)
    at new Promise (<anonymous>)
`);
			});
		});
	});
});
