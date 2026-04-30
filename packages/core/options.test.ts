/*
 * Copyright 2026 Code Intelligence GmbH
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

import { OptionsManager, OptionSource } from "@jazzer.js/options";

import { spawnsSubprocess } from "./options";

describe("buildLibFuzzerOptions", () => {
	describe("spawnsSubprocess", () => {
		it("checks if subprocess libFuzzer flags are present", () => {
			expect(spawnsSubprocess(["-fork=1"])).toBeTruthy();
			expect(spawnsSubprocess(["-fork=0"])).toBeFalsy();
			expect(
				spawnsSubprocess(["abc", "-foo=0", "-fork=0", "-jobs=1"]),
			).toBeTruthy();
			expect(spawnsSubprocess(["-foo=0"])).toBeFalsy();
			expect(spawnsSubprocess(["abc"])).toBeFalsy();
			expect(spawnsSubprocess(["123"])).toBeFalsy();
		});
	});
});

describe("fuzzer options", () => {
	it("checks if subprocess libFuzzer flags are present", () => {
		expect(spawnsSubprocess(["-fork=1"])).toBeTruthy();
		expect(spawnsSubprocess(["-fork=0"])).toBeFalsy();
		expect(
			spawnsSubprocess(["abc", "-foo=0", "-fork=0", "-jobs=1"]),
		).toBeTruthy();
		expect(spawnsSubprocess(["-foo=0"])).toBeFalsy();
		expect(spawnsSubprocess(["abc"])).toBeFalsy();
		expect(spawnsSubprocess(["123"])).toBeFalsy();
	});
});
