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

const helpers = mockHelpers();
import { compareHooks } from "./compareHooks";
import { instrumentAndEvalWith } from "./testhelpers";
import { types } from "@babel/core";

const native = mockNativeAddonApi();

const expectInstrumentation = instrumentAndEvalWith(compareHooks);

describe("compare hooks instrumentation", () => {
	describe("string compares", () => {
		it("intercepts equals (`==` and `===`)", () => {
			native.traceStrCmp.mockClear().mockReturnValue(false);
			helpers.fakePC.mockClear().mockReturnValue(types.numericLiteral(0));
			const input = `
			|let a = "a"
			|a === "b" == "c"`;
			const output = `
			|let a = "a";
			|Fuzzer.traceStrCmp(Fuzzer.traceStrCmp(a, "b", "===", 0), "c", "==", 0);`;

			const result = expectInstrumentation<boolean>(input, output);
			expect(result).toBe(false);
			expect(native.traceStrCmp).toHaveBeenCalledTimes(2);
			expect(native.traceStrCmp).toHaveBeenNthCalledWith(1, "a", "b", "===", 0);
			expect(native.traceStrCmp).toHaveBeenNthCalledWith(
				2,
				false,
				"c",
				"==",
				0
			);
		});

		it("intercepts not equals (`!=` and `!==`)", () => {
			native.traceStrCmp.mockClear().mockReturnValue(true);
			helpers.fakePC.mockClear().mockReturnValue(types.numericLiteral(0));

			const input = `
			|let a = "a"
			|a !== "b" != "c"`;
			const output = `
			|let a = "a";
			|Fuzzer.traceStrCmp(Fuzzer.traceStrCmp(a, "b", "!==", 0), "c", "!=", 0);`;

			const result = expectInstrumentation<boolean>(input, output);
			expect(result).toBe(true);
			expect(native.traceStrCmp).toHaveBeenCalledTimes(2);
			expect(native.traceStrCmp).toHaveBeenNthCalledWith(1, "a", "b", "!==", 0);
			expect(native.traceStrCmp).toHaveBeenNthCalledWith(2, true, "c", "!=", 0);
		});
	});

	describe("integer compares", () => {
		it("intercepts equals (`==` and `===`))", () => {
			native.traceNumberCmp.mockClear().mockReturnValue(false);
			helpers.fakePC.mockClear().mockReturnValue(types.numericLiteral(0));

			const input = `
			|let a = 10
			|a === 20 == 30`;
			const output = `
			|let a = 10;
			|Fuzzer.traceNumberCmp(Fuzzer.traceNumberCmp(a, 20, "===", 0), 30, "==", 0);`;
			const result = expectInstrumentation<boolean>(input, output);
			expect(result).toBe(false);
			expect(native.traceNumberCmp).toHaveBeenCalledTimes(2);
			expect(native.traceNumberCmp).toHaveBeenNthCalledWith(
				1,
				10,
				20,
				"===",
				0
			);
			expect(native.traceNumberCmp).toHaveBeenNthCalledWith(
				2,
				false,
				30,
				"==",
				0
			);
		});

		it("intercepts not equals (`!=` and `!==`))", () => {
			native.traceNumberCmp.mockClear().mockReturnValue(true);
			helpers.fakePC.mockClear().mockReturnValue(types.numericLiteral(0));

			const input = `
			|let a = 10
			|a !== 20 != 30`;
			const output = `
			|let a = 10;
			|Fuzzer.traceNumberCmp(Fuzzer.traceNumberCmp(a, 20, "!==", 0), 30, "!=", 0);`;
			const result = expectInstrumentation<boolean>(input, output);
			expect(result).toBe(true);
			expect(native.traceNumberCmp).toHaveBeenCalledTimes(2);
			expect(native.traceNumberCmp).toHaveBeenNthCalledWith(
				1,
				10,
				20,
				"!==",
				0
			);
			expect(native.traceNumberCmp).toHaveBeenNthCalledWith(
				2,
				true,
				30,
				"!=",
				0
			);
		});

		it("intercepts greater and less them", () => {
			[">", "<", ">=", "<="].forEach((operator) => {
				native.traceNumberCmp.mockClear().mockReturnValue(false);
				helpers.fakePC.mockClear().mockReturnValue(types.numericLiteral(0));
				const input = `
				|let a = 10
				|a ${operator} 20`;
				const output = `
				|let a = 10;
				|Fuzzer.traceNumberCmp(a, 20, "${operator}", 0);`;
				const result = expectInstrumentation<boolean>(input, output);
				expect(result).toBe(false);
				expect(native.traceNumberCmp).toHaveBeenCalledTimes(1);
				expect(native.traceNumberCmp).toHaveBeenNthCalledWith(
					1,
					10,
					20,
					operator,
					0
				);
			});
		});
	});
});

// Mock global native addon API
// This is normally done by the jest environment. Here we replace every
// API function with a jest mock, which can be configured in the test.
function mockNativeAddonApi() {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const native = require("@jazzer.js/fuzzer");
	jest.mock("@jazzer.js/fuzzer");
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	global.Fuzzer = native;
	return native;
}

function mockHelpers() {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const helpers = require("./helpers");
	jest.mock("./helpers");
	return helpers;
}
