/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
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

// noinspection JSUnusedLocalSymbols
module.exports.callbackTimeout = (data, done) => {
	// Never call done to provoke a timeout.
};
