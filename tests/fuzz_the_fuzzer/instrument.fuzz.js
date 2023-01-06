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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { shouldInstrumentFn } = require("@jazzer.js/instrumentor");
const { FuzzedDataProvider } = require("@jazzer.js/core");

describe("instrument", () => {
	it.fuzz("shouldInstrumentFn", (data) => {
		if (!data) return;
		const provider = new FuzzedDataProvider(data);
		const includes = consumeStringArray(
			provider,
			provider.consumeIntegralInRange(0, 10),
			5
		);
		const excludes = consumeStringArray(
			provider,
			provider.consumeIntegralInRange(0, 10),
			5
		);

		const check = shouldInstrumentFn(includes, excludes);

		let includeAll = includes.some((e) => e === "");
		let excludeAll = excludes.some((e) => e === "");

		if (excludeAll) {
			expect(check).toBeFalsy();
		} else if (includeAll) {
			expect(check).toBeTruthy();
		} else {
			expect(check).toBeDefined();
		}
	});
});

function consumeStringArray(provider, maxArrayLength, maxStringLength) {
	const strs = [];
	while (strs.length < maxArrayLength && provider.remainingBytes > 0) {
		let str = provider.consumeString(maxStringLength, "ascii");
		if (str) {
			strs.push(str);
		}
	}
	return strs;
}
