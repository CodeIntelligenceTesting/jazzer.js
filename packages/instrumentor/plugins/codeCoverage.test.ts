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
import { FileSyncIdStrategy, ZeroEdgeIdStrategy } from "../edgeIdStrategy";
import { Instrumentor } from "../instrument";

import * as tmp from "tmp";
import * as fs from "fs";
import * as os from "os";

tmp.setGracefulCleanup();

const expectInstrumentation = instrumentWith(
	codeCoverage(new ZeroEdgeIdStrategy())
);

describe("code coverage instrumentation", () => {
	describe("IfStatement", () => {
		it("should add counter in consequent branch and afterwards", () => {
			const input = `
               |if (1 < 2)
               |  true;`;
			const output = `
               |if (1 < 2) {
               |  Fuzzer.coverageTracker.incrementCounter(0);
               |  true;
               |}
               |
               |Fuzzer.coverageTracker.incrementCounter(0);`;
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
               |  Fuzzer.coverageTracker.incrementCounter(0);
               |  true;
               |} else {
               |  Fuzzer.coverageTracker.incrementCounter(0);
               |  false;
               |}
               |
               |Fuzzer.coverageTracker.incrementCounter(0);`;
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
               |    Fuzzer.coverageTracker.incrementCounter(0);
               |    true;
               |
               |  case 2:
               |    Fuzzer.coverageTracker.incrementCounter(0);
               |    false;
               |    break;
               |
               |  default:
               |    Fuzzer.coverageTracker.incrementCounter(0);
               |    true;
               |}
               |
               |Fuzzer.coverageTracker.incrementCounter(0);`;
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
               |  Fuzzer.coverageTracker.incrementCounter(0);
               |  console.error(e, e.stack);
               |}
               |
               |Fuzzer.coverageTracker.incrementCounter(0);`;
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
               |  Fuzzer.coverageTracker.incrementCounter(0);
               |  counter++;
               |}
               |
               |Fuzzer.coverageTracker.incrementCounter(0);`;
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
               |  Fuzzer.coverageTracker.incrementCounter(0);
               |  return b => {
               |    Fuzzer.coverageTracker.incrementCounter(0);
               |    return a + b;
               |  };
               |};`;
			expectInstrumentation(input, output);
		});
	});

	describe("LogicalExpression", () => {
		it("should add counters in leaves", () => {
			const input = `let condition = (a === "a" || (potentiallyNull ?? b === "b")) && c !== "c"`;
			const output = `let condition = ((Fuzzer.coverageTracker.incrementCounter(0), a === "a") || ((Fuzzer.coverageTracker.incrementCounter(0), potentiallyNull) ?? (Fuzzer.coverageTracker.incrementCounter(0), b === "b"))) && (Fuzzer.coverageTracker.incrementCounter(0), c !== "c");`;
			expectInstrumentation(input, output);
		});
	});

	describe("ConditionalExpression", () => {
		it("should add counters branches", () => {
			const input = `(a === "a" ? x : y) + 1`;
			const output = `
        |(a === "a" ? (Fuzzer.coverageTracker.incrementCounter(0), x) : (Fuzzer.coverageTracker.incrementCounter(0), y)) + 1;`;
			expectInstrumentation(input, output);
		});
	});

	describe("FileSyncIdStrategy", () => {
		it("should add correct number of edges", () => {
			const idSyncFile = tmp.fileSync({
				mode: 0o600,
				prefix: "jazzer.js",
				postfix: "idSync",
			});
			fs.closeSync(idSyncFile.fd);

			const testCases: { file: string; code: string }[] = [
				{
					file: "foo.js",
					code: "if (1 < 2) { true; } else { false; }",
				},
				{
					file: "bar.js",
					code: "for (let i = 0; i < 100; i++) { counter++; }",
				},
				{
					file: "do_not_instrument.js",
					code: "some invalid code to throw a SyntaxError if we try to instrument it",
				},
				{
					file: "baz.js",
					code: "switch(a) {case 1: true; case 2: false; break; default: true;}",
				},
			];

			const instrumentor = new Instrumentor(
				["*"],
				["do_not_instrument"],
				[],
				false,
				false,
				new FileSyncIdStrategy(idSyncFile.name)
			);

			for (const testCase of testCases) {
				instrumentor.instrument(testCase.code, testCase.file);
			}

			for (let i = 0; i < 100; i++) {
				// Randomly select a file to instrument. At this point all files should have been instrumented
				// and thus instrumenting new files should not change the ID sync file.
				const testCase = testCases[Math.floor(Math.random() * 4)];
				instrumentor.instrument(testCase.code, testCase.file);
			}

			expect(
				fs
					.readFileSync(idSyncFile.name)
					.toString()
					.split(os.EOL)
					.filter((line) => line !== "")
			).toEqual(["foo.js,0,3", "bar.js,3,2", "baz.js,5,4"]);
		});
	});
});
