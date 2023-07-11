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

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */

const child_process = require("child_process");
const path = require("path");
const fs = require("fs");
const assert = require("assert");
const { platform } = require("os");

const { makeFnCalledOnce, callWithTimeout } = require("../../helpers");

const evilCommand = "jaz_zer";
const friendlyFile = "FRIENDLY";

// On Windows use copy NUL instead of touch
const friendlyCommand =
	(process.platform === "win32" ? "copy NUL " : "touch ") + friendlyFile;

module.exports.CallOriginalEvilAsync = makeFnCalledOnce(async (data) => {
	return callWithTimeout(() => child_process.execSync(evilCommand), 500);
}, 1);

module.exports.CallOriginalEvilSync = function (data) {
	child_process.execSync(evilCommand);
};

module.exports.CallOriginalFriendlyAsync = async function (data) {
	child_process.exec(friendlyCommand);
};

module.exports.CallOriginalFriendlySync = function (data) {
	child_process.exec(friendlyCommand);
};

module.exports.CallOriginalEvilDoneCallback = function (data, done) {
	child_process.execSync(evilCommand);
	done();
};

module.exports.CallOriginalEvilDoneCallbackWithTryCatch = function (
	data,
	done,
) {
	try {
		child_process.execSync(evilCommand);
	} catch (e) {
		console.log("error caught");
	}
	done();
};

module.exports.CallOriginalEvilDoneCallbackWithTimeout = function (data, done) {
	setTimeout(() => {
		child_process.execSync(evilCommand);
		done();
	}, 100);
};

module.exports.CallOriginalEvilDoneCallbackWithTimeoutWithTryCatch = function (
	data,
	done,
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

module.exports.CallOriginalFriendlyDoneCallback = function (data, done) {
	child_process.execSync(friendlyCommand);
	done();
};

module.exports.CallOriginalEvilAsyncCallingSync = async function (data) {
	child_process.execSync(evilCommand);
};

module.exports.CallOriginalFriendlyAsync = async function (data) {
	child_process.exec(friendlyCommand);
};

module.exports.CallOriginalFriendlyAsyncCallingSync = async function (data) {
	child_process.execSync(friendlyCommand);
};

module.exports.ForkModeCallOriginalEvil = makeFuzzFunctionWithInput(
	100,
	evilCommand,
);

module.exports.ForkModeCallOriginalFriendly = makeFuzzFunctionWithInput(
	100,
	friendlyCommand,
);

module.exports.ForkModeCallOriginalEvilAsync = makeAsyncFuzzFunctionWithInput(
	100,
	evilCommand,
);

module.exports.ForkModeCallOriginalFriendlyAsync =
	makeAsyncFuzzFunctionWithInput(100, friendlyCommand);

module.exports.DisableAllBugDetectors = makeFnCalledOnce(async (data) => {
	// Command Injection : try to make an empty file named "jaz_zer" (our evil string)
	const execSyncCommand =
		platform() === "win32" ? "COPY NUL jaz_zer" : "touch jaz_zer";

	child_process.execSync(execSyncCommand);
	// Path Traversal : try to make a directory named "../../jaz_zer" using fs
	fs.mkdirSync("../../jaz_zer");
});

/**
 * Generates a fuzz function that does nothing for a given number of iterations; calls the provided
 * input at the n-th iteration; and continues doing nothing thereafter.
 */
function makeFuzzFunctionWithInput(n, input) {
	assert(n > 0);
	let i = n;
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
	return async function (data) {
		i--;
		if (i === 0) {
			child_process.execSync(input);
		}
	};
}
