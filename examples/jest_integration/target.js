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

/**
 * @param { Buffer } data
 */
const fuzzMe = function (data) {
	const s = data.toString();
	if (s.length !== 7) {
		return;
	}
	if (s.slice(0, 7) === "Awesome") {
		throw Error("Welcome to Awesome Fuzzing!");
	}
};

/**
 * @param { Buffer } data
 * @param { Function } done
 */
const callbackFuzzMe = function (data, done) {
	// Use setImmediate here to unblock the event loop but still have better
	// performance compared to setTimeout.
	setImmediate(() => {
		fuzzMe(data);
		done();
	});
};

/**
 * @param { Buffer } data
 */
const asyncFuzzMe = function (data) {
	return new Promise((resolve) => {
		callbackFuzzMe(data, resolve);
	});
};

module.exports.fuzzMe = fuzzMe;
module.exports.callbackFuzzMe = callbackFuzzMe;
module.exports.asyncFuzzMe = asyncFuzzMe;
