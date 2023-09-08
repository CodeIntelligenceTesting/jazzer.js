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

// Disable any checks for this file, since it makes mocking much easier.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { interceptGlobals } from "./globalsInterceptor";
import { fuzz } from "./fuzz";

const internalFuzz = jest.fn();
jest.mock("./fuzz", () => ({
	fuzz: jest.fn().mockImplementation(() => {
		return internalFuzz;
	}),
}));

describe("Globals interceptor", () => {
	it("extend Jest global test with fuzz function", () => {
		const originalSetGlobalsForRuntime = jest.fn();
		const runtime = {
			setGlobalsForRuntime: originalSetGlobalsForRuntime,
		} as any;
		const testPath = "testPath";
		const jazzerConfig = {} as any;
		const testState = {
			currentTestState: jest.fn(),
			currentTestTimeout: jest.fn(),
			originalTestNamePattern: jest.fn(),
		};

		const globals = {
			it: {
				skip: {},
				only: {},
			},
		} as any;

		interceptGlobals(runtime, testPath, jazzerConfig, testState);

		runtime.setGlobalsForRuntime(globals);

		expect(Object.keys(globals.it)).toHaveLength(3);
		expect(globals.it.fuzz).toBe(internalFuzz);
		expect(globals.it.skip.fuzz).toBe(internalFuzz);
		expect(globals.it.only.fuzz).toBe(internalFuzz);

		expect(originalSetGlobalsForRuntime).toHaveBeenCalledWith(globals);

		const fuzzMock = fuzz as jest.Mock;
		expect(fuzzMock).toHaveBeenCalledTimes(3);
		expect(fuzzMock).toHaveBeenCalledWith(
			globals,
			testPath,
			jazzerConfig,
			testState.currentTestState,
			testState.currentTestTimeout,
			testState.originalTestNamePattern,
			"standard",
		);
		expect(fuzzMock.mock.calls[1][6]).toBe("skip");
		expect(fuzzMock.mock.calls[2][6]).toBe("only");
	});
});
