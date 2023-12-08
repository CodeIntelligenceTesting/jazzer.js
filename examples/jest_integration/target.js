/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
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
