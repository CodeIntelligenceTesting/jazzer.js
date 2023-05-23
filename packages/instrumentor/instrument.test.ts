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

/* eslint @typescript-eslint/ban-ts-comment:0 */

import * as ts from "typescript";
import { Instrumentor } from "./instrument";

describe("shouldInstrument check", () => {
	it("should consider includes and excludes", () => {
		const instrumentor = new Instrumentor(["include"], ["exclude"]);
		expect(instrumentor.shouldInstrumentForFuzzing("include")).toBeTruthy();
		expect(instrumentor.shouldInstrumentForFuzzing("exclude")).toBeFalsy();
		expect(
			instrumentor.shouldInstrumentForFuzzing("/some/package/include/files")
		).toBeTruthy();
		expect(
			instrumentor.shouldInstrumentForFuzzing("/some/package/exclude/files")
		).toBeFalsy();
		expect(
			instrumentor.shouldInstrumentForFuzzing("/something/else")
		).toBeFalsy();
	});

	it("should include everything by default", () => {
		const instrumentor = new Instrumentor();
		expect(instrumentor.shouldInstrumentForFuzzing("include")).toBeTruthy();
		expect(
			instrumentor.shouldInstrumentForFuzzing("/something/else")
		).toBeTruthy();
	});

	it("should include nothing with emtpy string", () => {
		const instrumentorWithEmptyInclude = new Instrumentor(["include", ""]);
		expect(
			instrumentorWithEmptyInclude.shouldInstrumentForFuzzing("include")
		).toBeTruthy();
		expect(
			instrumentorWithEmptyInclude.shouldInstrumentForFuzzing("/something/else")
		).toBeFalsy();

		const instrumentorWithEmptyExclude = new Instrumentor(["include"], [""]);
		expect(
			instrumentorWithEmptyExclude.shouldInstrumentForFuzzing("include")
		).toBeTruthy();
		expect(
			instrumentorWithEmptyExclude.shouldInstrumentForFuzzing("/something/else")
		).toBeFalsy();
	});

	it("should exclude with precedence", () => {
		const instrumentor = new Instrumentor(["include"], ["*"]);
		expect(
			instrumentor.shouldInstrumentForFuzzing("/some/package/include/files")
		).toBeFalsy();
	});
});

describe("transform", () => {
	it("should use source maps to correct error stack traces", () => {
		withSourceMap((instrumentor: Instrumentor) => {
			const sourceFileName = "sourcemap-test.js";
			const errorLocation = sourceFileName + ":5:13";
			const content = ` 
				module.exports.functionThrowingAnError = function foo () {
					// eslint-disable-next-line no-constant-condition
					if (1 < 2) {
						throw Error("Expected test error"); // error thrown at ${errorLocation}
					}
				};
				// sourceURL is required for the snippet to reference a filename during
				// eval and so be able to lookup the appropriate source map later on.
				// This is only necessary for this test and not when using normal 
				// import/require without eval.
				//@ sourceURL=${sourceFileName}`;
			try {
				evalWithInstrumentor(instrumentor, content, sourceFileName);
				fail("Error expected but not thrown.");
			} catch (e: unknown) {
				if (!(e instanceof Error && e.stack)) {
					throw e;
				}
				// Verify that the received error was corrected via a source map
				// by checking the original error location.
				expect(e.stack).toContain(errorLocation);
			}
		});
	});

	it("should use inline source maps to correct error stack traces", () => {
		const sourceFileName = "inline-sourcemap-test.ts";
		const errorLocation = sourceFileName + ":7:12";
		const content = `
			interface Foo {
				bar: string;
			}
			export default function foo (): Foo {
				if (1 < 2) {
					throw new Error("Expected test error"); // error thrown at ${errorLocation}
				} else {
					return { bar: "baz" };
				}
			}
			// sourceURL is required for the snippet to reference a filename during
			// eval and so be able to lookup the appropriate source map later on.
		  // This is only necessary for this test and not when using normal 
			// import/require without eval.
			//@ sourceURL=${sourceFileName}`;

		const transpiledCode = ts.transpile(
			content,
			{
				fileName: sourceFileName,
				inlineSourceMap: true,
			},
			sourceFileName
		);

		withSourceMap((instrumentor: Instrumentor) => {
			try {
				evalWithInstrumentor(instrumentor, transpiledCode, sourceFileName);
				fail("Error expected but not thrown.");
			} catch (e: unknown) {
				if (!(e instanceof Error && e.stack)) {
					throw e;
				}
				expect(e.stack).toContain(errorLocation);
			}
		});
	});
});

function evalWithInstrumentor(
	instrumentor: Instrumentor,
	content: string,
	fileName: string
) {
	const result = instrumentor.instrument(content, fileName);
	const fn = eval(result);
	fn();
}

function withSourceMap(fn: (instrumentor: Instrumentor) => void) {
	// @ts-ignore
	const oldFuzzer = globalThis.Fuzzer;
	// @ts-ignore
	globalThis.Fuzzer = {
		// @ts-ignore
		coverageTracker: {
			incrementCounter: () => {
				// ignored
			},
		},
	};
	const instrumentor = new Instrumentor([], [], [], true, false);
	const resetSourceMapHandlers = instrumentor.init();
	try {
		fn(instrumentor);
	} finally {
		resetSourceMapHandlers();
		// @ts-ignore
		globalThis.Fuzzer = oldFuzzer;
	}
}
