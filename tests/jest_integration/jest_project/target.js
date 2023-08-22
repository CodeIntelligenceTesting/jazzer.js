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

const fuzzMe = function (data) {
	console.log("not mocked");
	if (data.toString() === "Awesome") {
		throw Error("Welcome to Awesome Fuzzing!");
	}
};

const originalFn = function () {
	console.log("original result");
};

const asyncFuzzMe = function (data) {
	return new Promise((resolve, reject) => {
		try {
			fuzzMe(data);
			resolve();
		} catch (e) {
			reject(e);
		}
	});
};

const callbackFuzzMe = function (data, done) {
	setImmediate(() => {
		try {
			fuzzMe(data);
			done();
		} catch (e) {
			done(e);
		}
	});
};

module.exports.fuzzMe = fuzzMe;
module.exports.asyncFuzzMe = asyncFuzzMe;
module.exports.callbackFuzzMe = callbackFuzzMe;
