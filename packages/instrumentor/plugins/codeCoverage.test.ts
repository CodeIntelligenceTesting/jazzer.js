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

import { codeCoverage } from "./codeCoverage";
import { instrumentWith } from "./testhelpers";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const native = require("@jazzer.js/fuzzer").fuzzer;
jest.mock("@jazzer.js/fuzzer");
native.nextCounter.mockReturnValue(0);

const expectInstrumentation = instrumentWith(codeCoverage);

describe("code coverage instrumentation", () => {
	describe("IfStatement", () => {
		it("should add counter in consequent branch and afterwards", () => {
			const input = `
               |if (1 < 2)
               |  true;`;
			const output = `
               |if (1 < 2) {
               |  Fuzzer.incrementCounter(0);
               |  true;
               |}
               |
               |Fuzzer.incrementCounter(0);`;
			expectInstrumentation(input, output);
		});
		it("should add counter in alternate branch and afterwards", () => {
			const input = `
               |if (1 < 2)
               |  true;
               |else
               |  false;`;
			const output = `
               |if (1 < 2) {
               |  Fuzzer.incrementCounter(0);
               |  true;
               |} else {
               |  Fuzzer.incrementCounter(0);
               |  false;
               |}
               |
               |Fuzzer.incrementCounter(0);`;
			expectInstrumentation(input, output);
		});
	});

	describe("SwitchStatement", () => {
		it("should add counter in case and afterwards", () => {
			const input = `
               |switch(a) {
               |  case 1: true;
               |  case 2: false; break;
               |  default: true;
               |}`;
			const output = `
               |switch (a) {
               |  case 1:
               |    Fuzzer.incrementCounter(0);
               |    true;
               |
               |  case 2:
               |    Fuzzer.incrementCounter(0);
               |    false;
               |    break;
               |
               |  default:
               |    Fuzzer.incrementCounter(0);
               |    true;
               |}
               |
               |Fuzzer.incrementCounter(0);`;
			expectInstrumentation(input, output);
		});
	});

	describe("TryStatement", () => {
		it("should add counter in catch block and afterwards", () => {
			const input = `
               |try {
               |  dangerousCall();
               |} catch (e) {
               |  console.error(e, e.stack);
               |}`;
			const output = `
               |try {
               |  dangerousCall();
               |} catch (e) {
               |  Fuzzer.incrementCounter(0);
               |  console.error(e, e.stack);
               |}
               |
               |Fuzzer.incrementCounter(0);`;
			expectInstrumentation(input, output);
		});
	});

	describe("Loop", () => {
		it("should add counter in loop and afterwards", () => {
			const input = `
               |for(let i = 0; i < 100; i++) {
               |  counter++
               |}`;
			const output = `
               |for (let i = 0; i < 100; i++) {
               |  Fuzzer.incrementCounter(0);
               |  counter++;
               |}
               |
               |Fuzzer.incrementCounter(0);`;
			expectInstrumentation(input, output);
		});
	});

	describe("Function", () => {
		it("should add counter in function", () => {
			const input = `
               |let foo = function add(a) {
               |  return (b) => {
               |    return a + b;
               |  } 
               |};`;
			const output = `
               |let foo = function add(a) {
               |  Fuzzer.incrementCounter(0);
               |  return b => {
               |    Fuzzer.incrementCounter(0);
               |    return a + b;
               |  };
               |};`;
			expectInstrumentation(input, output);
		});
	});

	describe("LogicalExpression", () => {
		it("should add counters in leaves", () => {
			const input = `let condition = (a === "a" || (potentiallyNull ?? b === "b")) && c !== "c"`;
			const output = `let condition = ((Fuzzer.incrementCounter(0), a === "a") || ((Fuzzer.incrementCounter(0), potentiallyNull) ?? (Fuzzer.incrementCounter(0), b === "b"))) && (Fuzzer.incrementCounter(0), c !== "c");`;
			expectInstrumentation(input, output);
		});
	});

	describe("ConditionalExpression", () => {
		it("should add counters branches", () => {
			const input = `(a === "a" ? x : y) + 1`;
			const output = `
        |(a === "a" ? (Fuzzer.incrementCounter(0), x) : (Fuzzer.incrementCounter(0), y)) + 1;`;
			expectInstrumentation(input, output);
		});
	});
});
