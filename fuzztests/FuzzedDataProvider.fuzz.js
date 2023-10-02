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

const { FuzzedDataProvider, jazzer } = require("@jazzer.js/core");

describe("FuzzedDataProvider", () => {
	// In this fuzz test we try to guide the fuzzer to use as many functions on
	// FuzzedDataProvider as possible, before invoking a terminating one
	// like consumeRemainingXY. Strange combinations of functions could produce a
	// one-off error.
	it.fuzz(
		"consumes the provided input",
		(data) => {
			const provider = new FuzzedDataProvider(data);
			const properties = Object.getOwnPropertyNames(
				Object.getPrototypeOf(provider),
			);
			const methodNames = properties
				.filter((p) => provider[p] instanceof Function)
				.filter((m) => provider[m].length === 0);

			let usedMethods = "";
			while (provider.remainingBytes > 0 && methodNames.length > 0) {
				const methodName = provider.pickValue(methodNames);
				provider[methodName].call(provider);
				usedMethods += methodName;
			}
			jazzer.exploreState(hash(usedMethods), 31);
		},
		5000,
	);
});

const hash = (str) => {
	let hash = 0;
	if (str.length === 0) return hash;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	return hash;
};
