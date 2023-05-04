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
const child_process = require("child_process");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const assert = require("assert");

const evilCommand = "jaz_zer";
const friendlyFile = "FRIENDLY";

const friendlyCommand =
	(process.platform === "win32" ? "copy NUL " : "touch ") + friendlyFile;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.CallOriginalEvilAsync = async function (data) {
	child_process.execSync(evilCommand);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.CallOriginalEvilSync = function (data) {
	child_process.execSync(evilCommand);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.CallOriginalFriendlyAsync = async function (data) {
	child_process.exec(friendlyCommand);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.CallOriginalFriendlySync = function (data) {
	child_process.exec(friendlyCommand);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.CallOriginalEvilDoneCallback = function (data, done) {
	child_process.execSync(evilCommand);
	done();
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.CallOriginalEvilDoneCallbackWithTryCatch = function (
	data,
	done
) {
	try {
		child_process.execSync(evilCommand);
	} catch (e) {
		console.log("error caught");
	}
	done();
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.CallOriginalEvilDoneCallbackWithTimeout = function (data, done) {
	setTimeout(() => {
		child_process.execSync(evilCommand);
		done();
	}, 100);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.CallOriginalEvilDoneCallbackWithTimeoutWithTryCatch = function (
	data,
	done
) {
	setTimeout(() => {
		try {
			child_process.execSync(evilCommand);
		} catch (e) {
			console.log("error caught");
		}
		done();
	}, 100);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.CallOriginalFriendlyDoneCallback = function (data, done) {
	child_process.execSync(friendlyCommand);
	done();
};

module.exports.CallOriginalEvilAsyncCallingSync =
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async function (data) {
		child_process.execSync(evilCommand);
	};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.CallOriginalFriendlyAsync = async function (data) {
	child_process.exec(friendlyCommand);
};

module.exports.CallOriginalFriendlyAsyncCallingSync =
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async function (data) {
		child_process.execSync(friendlyCommand);
	};

module.exports.ForkModeCallOriginalEvil = makeFuzzFunctionWithInput(
	100,
	evilCommand
);

module.exports.ForkModeCallOriginalFriendly = makeFuzzFunctionWithInput(
	100,
	friendlyCommand
);

module.exports.ForkModeCallOriginalEvilAsync = makeAsyncFuzzFunctionWithInput(
	100,
	evilCommand
);

module.exports.ForkModeCallOriginalFriendlyAsync =
	makeAsyncFuzzFunctionWithInput(100, friendlyCommand);

/**
 * Generates a fuzz function that does nothing for a given number of iterations; calls the provided
 * input at the n-th iteration; and continues doing nothing thereafter.
 */
function makeFuzzFunctionWithInput(n, input) {
	assert(n > 0);
	let i = n;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	return function (data) {
		i--;
		if (i === 0) {
			child_process.execSync(input);
		}
	};
}

function makeAsyncFuzzFunctionWithInput(n, input) {
	assert(n > 0);
	let i = n;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	return async function (data) {
		i--;
		if (i === 0) {
			child_process.execSync(input);
		}
	};
}
