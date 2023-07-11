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

/* eslint-disable no-undef */

const { Instrumentor } = require("@jazzer.js/instrumentor");
const { FuzzedDataProvider } = require("@jazzer.js/core");

describe("instrument", () => {
	it.fuzz("shouldInstrumentFn", (data) => {
		const provider = new FuzzedDataProvider(data);
		const filename = provider.consumeString(10);
		const includes = provider.consumeStringArray(
			provider.consumeIntegralInRange(0, 10),
			5,
		);
		const excludes = provider.consumeStringArray(
			provider.consumeIntegralInRange(0, 10),
			5,
		);

		const instrumentor = new Instrumentor(includes, excludes);
		const check = instrumentor.shouldInstrumentForFuzzing(filename);
		const includeAll = includes.some((e) => e === "*");
		const excludeAll = excludes.some((e) => e === "*");

		if (excludeAll) {
			expect(check).toBeFalsy();
		} else if (includeAll) {
			expect(check).toBeTruthy();
		} else {
			expect(check).toBeDefined();
		}
	});
});
