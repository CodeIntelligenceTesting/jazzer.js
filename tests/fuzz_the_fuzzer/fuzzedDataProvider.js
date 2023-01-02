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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FuzzedDataProvider, jazzer } = require("@jazzer.js/core");

const usedHashes = [];

// FuzzedDataProvider in itself can not be instrumented, as it's already loaded
// by the core module for re-export. In this test we try to guide the fuzzer to
// use as many functions on it as possible, before invoking a terminating one
// like consumeRemainingXY.
module.exports.fuzz = (data) => {
	const provider = new FuzzedDataProvider(data);
	const properties = Object.getOwnPropertyNames(
		Object.getPrototypeOf(provider)
	);
	const methodNames = properties
		.filter((p) => provider[p] instanceof Function)
		.filter((m) => provider[m].length === 0);

	let usedMethods = "";
	while (provider.remainingBytes > 0) {
		const methodName = rndElementOf(methodNames);
		provider[methodName].call(provider);
		usedMethods += methodName;
	}
	let state = hash(usedMethods);
	if (usedHashes.indexOf(state) === -1) {
		usedHashes.push(state);
	}
	jazzer.exploreState(state, 31);
};

const rndElementOf = (array) => {
	return array[Math.floor(Math.random() * array.length)];
};

const hash = (str) => {
	let hash = 0;
	if (str.length === 0) return hash;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	return hash;
};
