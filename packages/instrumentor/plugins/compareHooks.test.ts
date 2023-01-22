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
import { instrumentAndEvalWith, instrumentWith } from "./testhelpers";
import { types } from "@babel/core";

const fuzzer = mockFuzzerApi();

const expectInstrumentationAndEval = instrumentAndEvalWith(compareHooks);
const expectInstrumentation = instrumentWith(compareHooks);

describe("compare hooks instrumentation", () => {
	describe("string compares", () => {
		it("intercepts equals (`==` and `===`)", () => {
			fuzzer.traceStrCmp.mockClear().mockReturnValue(false);
			helpers.fakePC.mockClear().mockReturnValue(types.numericLiteral(0));
			const input = `
			|let a = "a"
			|a === "b" == "c"`;
			const output = `
			|let a = "a";
			|Fuzzer.traceStrCmp(Fuzzer.traceStrCmp(a, "b", "===", 0), "c", "==", 0);`;

			const result = expectInstrumentationAndEval<boolean>(input, output);
			expect(result).toBe(false);
			expect(fuzzer.traceStrCmp).toHaveBeenCalledTimes(2);
			expect(fuzzer.traceStrCmp).toHaveBeenNthCalledWith(1, "a", "b", "===", 0);
			expect(fuzzer.traceStrCmp).toHaveBeenNthCalledWith(
				2,
				false,
				"c",
				"==",
				0
			);
		});

		it("intercepts not equals (`!=` and `!==`)", () => {
			fuzzer.traceStrCmp.mockClear().mockReturnValue(true);
			helpers.fakePC.mockClear().mockReturnValue(types.numericLiteral(0));

			const input = `
			|let a = "a"
			|a !== "b" != "c"`;
			const output = `
			|let a = "a";
			|Fuzzer.traceStrCmp(Fuzzer.traceStrCmp(a, "b", "!==", 0), "c", "!=", 0);`;

			const result = expectInstrumentationAndEval<boolean>(input, output);
			expect(result).toBe(true);
			expect(fuzzer.traceStrCmp).toHaveBeenCalledTimes(2);
			expect(fuzzer.traceStrCmp).toHaveBeenNthCalledWith(1, "a", "b", "!==", 0);
			expect(fuzzer.traceStrCmp).toHaveBeenNthCalledWith(2, true, "c", "!=", 0);
		});
	});

	describe("integer compares", () => {
		it("intercepts equals (`==` and `===`))", () => {
			fuzzer.traceNumberCmp.mockClear().mockReturnValue(false);
			helpers.fakePC.mockClear().mockReturnValue(types.numericLiteral(0));

			const input = `
			|let a = 10
			|a === 20 == 30`;
			const output = `
			|let a = 10;
			|Fuzzer.traceNumberCmp(Fuzzer.traceNumberCmp(a, 20, "===", 0), 30, "==", 0);`;
			const result = expectInstrumentationAndEval<boolean>(input, output);
			expect(result).toBe(false);
			expect(fuzzer.traceNumberCmp).toHaveBeenCalledTimes(2);
			expect(fuzzer.traceNumberCmp).toHaveBeenNthCalledWith(
				1,
				10,
				20,
				"===",
				0
			);
			expect(fuzzer.traceNumberCmp).toHaveBeenNthCalledWith(
				2,
				false,
				30,
				"==",
				0
			);
		});

		it("intercepts not equals (`!=` and `!==`))", () => {
			fuzzer.traceNumberCmp.mockClear().mockReturnValue(true);
			helpers.fakePC.mockClear().mockReturnValue(types.numericLiteral(0));

			const input = `
			|let a = 10
			|a !== 20 != 30`;
			const output = `
			|let a = 10;
			|Fuzzer.traceNumberCmp(Fuzzer.traceNumberCmp(a, 20, "!==", 0), 30, "!=", 0);`;
			const result = expectInstrumentationAndEval<boolean>(input, output);
			expect(result).toBe(true);
			expect(fuzzer.traceNumberCmp).toHaveBeenCalledTimes(2);
			expect(fuzzer.traceNumberCmp).toHaveBeenNthCalledWith(
				1,
				10,
				20,
				"!==",
				0
			);
			expect(fuzzer.traceNumberCmp).toHaveBeenNthCalledWith(
				2,
				true,
				30,
				"!=",
				0
			);
		});

		it("intercepts greater and less them", () => {
			[">", "<", ">=", "<="].forEach((operator) => {
				fuzzer.traceNumberCmp.mockClear().mockReturnValue(false);
				helpers.fakePC.mockClear().mockReturnValue(types.numericLiteral(0));
				const input = `
				|let a = 10
				|a ${operator} 20`;
				const output = `
				|let a = 10;
				|Fuzzer.traceNumberCmp(a, 20, "${operator}", 0);`;
				const result = expectInstrumentationAndEval<boolean>(input, output);
				expect(result).toBe(false);
				expect(fuzzer.traceNumberCmp).toHaveBeenCalledTimes(1);
				expect(fuzzer.traceNumberCmp).toHaveBeenNthCalledWith(
					1,
					10,
					20,
					operator,
					0
				);
			});
		});
	});

	describe("switch statements", () => {
		it("intercepts string cases", () => {
			const input = `
			|switch(day) {
			|  case "Monday":
			|    console.log("monday");
			|    break;
			|  case "Tuesday":
			|    console.log("Tuesday");
			|    break;			
			|  case "Friday":
			|    console.log("Friday");
			|    break;
			|  default:
			|    console.log("Some other day");
			|    break;				
			|}`;
			const output = `
			|switch (day) {
            |  case Fuzzer.traceAndReturn(day, "Monday", 0):
            |    console.log("monday");
            |    break;
            |
            |  case Fuzzer.traceAndReturn(day, "Tuesday", 0):
            |    console.log("Tuesday");
            |    break;
            |
            |  case Fuzzer.traceAndReturn(day, "Friday", 0):
            |    console.log("Friday");
            |    break;
            |
            |  default:
            |    console.log("Some other day");
            |    break;
            |}`;
			expectInstrumentation(input, output);
		});

		it("intercepts integer cases", () => {
			const input = `
			|switch(count) {
			|  case 1:
			|    console.log("1");
			|    break;
			|  case 2:
			|    console.log("2");
			|    break;			
			|  case 5:
			|    console.log("5");
			|    break;
			|  default:
			|    console.log("Some other number");
			|    break;				
			|}`;
			const output = `
			|switch (count) {
            |  case Fuzzer.traceAndReturn(count, 1, 0):
            |    console.log("1");
            |    break;
            |
            |  case Fuzzer.traceAndReturn(count, 2, 0):
            |    console.log("2");
            |    break;
            |
            |  case Fuzzer.traceAndReturn(count, 5, 0):
            |    console.log("5");
            |    break;
            |
            |  default:
            |    console.log("Some other number");
            |    break;
            |}`;
			expectInstrumentation(input, output);
		});
	});
});

// Mock global Fuzzer API
// This is normally done by the jest environment. Here we replace every
// API function with a jest mock, which can be configured in the test.
function mockFuzzerApi() {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const fuzzer = require("@jazzer.js/fuzzer").fuzzer;
	jest.mock("@jazzer.js/fuzzer");
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	global.Fuzzer = fuzzer;
	return fuzzer;
}

function mockHelpers() {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const helpers = require("./helpers");
	jest.mock("./helpers");
	return helpers;
}
