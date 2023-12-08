/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const { FuzzedDataProvider } = require("@jazzer.js/core");
const { Instrumentor } = require("@jazzer.js/instrumentor");

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
