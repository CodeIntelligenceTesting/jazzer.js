/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const crypto = require("crypto");

const fuzzMe = (data) => {
	if (data.toString() === "Awe") {
		throw Error("Welcome to Awesome Fuzzing!");
	}
};
module.exports.fuzzMe = fuzzMe;

const fuzzMeHashed = function (data) {
	const s = data.toString();
	if (s.length !== 7) {
		return;
	}

	const sha = crypto.createHash("sha512").update(s);
	const result = sha.digest("hex");

	// Hash of "Amazing"
	if (
		result ===
		"79328e1e1272ff2890ff0c6e8181a52ce5960ae7703b00f9f094edd7dbd198210129b2bb307e8cd34d689d101e4d685f1259e42af7ce252944ca46aecca60752"
	) {
		throw Error("Welcome to Amazing Fuzzing!");
	}
};

module.exports.fuzzMeHashed = fuzzMeHashed;

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
