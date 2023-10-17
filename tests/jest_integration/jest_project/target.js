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

const fuzzMe = (data) => {
	if (data.toString() === "Awe") {
		throw Error("Welcome to Awesome Fuzzing!");
	}
};
module.exports.fuzzMe = fuzzMe;

module.exports.asyncFuzzMe = (data) =>
	new Promise((resolve, reject) => {
		try {
			fuzzMe(data);
			resolve();
		} catch (e) {
			reject(e);
		}
	});

module.exports.callbackFuzzMe = (data, done) => {
	setImmediate(() => {
		try {
			fuzzMe(data);
			done();
		} catch (e) {
			done(e);
		}
	});
};

module.exports.originalFunction = () => {
	throw Error("Original function invoked!");
};

// noinspection JSUnusedLocalSymbols
module.exports.asyncTimeout = (data) =>
	new Promise(() => {
		// Never resolve this promise to provoke a timeout.
	});

module.exports.syncTimeout = (data) => {
	// eslint-disable-next-line no-constant-condition
	while (true) {
		/* empty */
	}
};

// noinspection JSUnusedLocalSymbols
module.exports.callbackTimeout = (data, done) => {
	// Never call done to provoke a timeout.
};
