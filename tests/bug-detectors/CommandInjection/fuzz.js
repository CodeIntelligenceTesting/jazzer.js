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

const evilCommand =
	process.platform === "win32" ? "copy NUL EVIL" : "touch EVIL";
const safeCommand =
	process.platform === "win32" ? "copy NUL SAFE" : "touch SAFE";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.CommandInjectionCallOriginalEvilAsync = async function (
	/** @type {any} */ _
) {
	child_process.execSync(evilCommand);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.CommandInjectionCallOriginalEvilDoneCallback =
	generateDelayedResponseFunctionWithDone(3, evilCommand);

module.exports.CommandInjectionCallOriginalEvilAsyncCallingSync =
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async function (/** @type {any} */ _) {
		child_process.execSync(evilCommand);
	};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.CommandInjectionCallOriginalSafeAsync = async function (
	/** @type {any} */ _
) {
	child_process.exec(safeCommand);
};

module.exports.CommandInjectionCallOriginalSafeAsyncCallingSync =
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async function (/** @type {any} */ _) {
		child_process.execSync(safeCommand);
	};

module.exports.ForkModeCommandInjectionCallOriginalEvil =
	generateDelayedResponseFunction(100, evilCommand);

/**
 * @param {number} iterationsBeforeEvilCommand
 * @param {string} _response
 */
function generateDelayedResponseFunction(
	iterationsBeforeEvilCommand,
	_response
) {
	let i = 0;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	return function (/** @type {any} */ _data) {
		i++;
		if (i == iterationsBeforeEvilCommand) {
			child_process.execSync(evilCommand);
		}
	};
}

/**
 * @param {number} iterationsBeforeEvilCommand
 * @param {string} response
 */
function generateDelayedResponseFunctionWithDone(
	iterationsBeforeEvilCommand,
	response
) {
	let i = 0;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	return function (/** @type {any} */ data, /** @type {() => void} */ done) {
		i++;
		if (i == iterationsBeforeEvilCommand) {
			child_process.execSync(response);
		}
		done();
	};
}
