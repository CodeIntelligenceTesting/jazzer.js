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

import { shouldInstrumentFn } from "./instrument";

describe("shouldInstrument check", () => {
	it("should consider includes and excludes", () => {
		const check = shouldInstrumentFn(["include"], ["exclude"]);
		expect(check("include")).toBeTruthy();
		expect(check("exclude")).toBeFalsy();
		expect(check("/some/package/include/files")).toBeTruthy();
		expect(check("/some/package/exclude/files")).toBeFalsy();
		expect(check("/something/else")).toBeFalsy();
	});

	it("should include everything with emptystring", () => {
		const check = shouldInstrumentFn([""], []);
		expect(check("include")).toBeTruthy();
		expect(check("/something/else")).toBeTruthy();
	});

	it("should exclude with precedence", () => {
		const check = shouldInstrumentFn(["include"], [""]);
		expect(check("/some/package/include/files")).toBeFalsy();
	});
});
