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

var crypto = require("crypto");

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

const fuzzMeHashed = function (data) {
	const s = data.toString();
	if (s.length !== 7) {
		return;
	}

	const sha = crypto.createHash("sha512").update(s.slice(0, 7));
	const result = sha.digest("hex");

	// Hash of "Amazing"
	if (
		result ===
		"79328e1e1272ff2890ff0c6e8181a52ce5960ae7703b00f9f094edd7dbd198210129b2bb307e8cd34d689d101e4d685f1259e42af7ce252944ca46aecca60752"
	) {
		throw Error("Welcome to Amazing Fuzzing!");
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
module.exports.fuzzMeHashed = fuzzMeHashed;
module.exports.callbackFuzzMe = callbackFuzzMe;
module.exports.asyncFuzzMe = asyncFuzzMe;
