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
const { promisify } = require("util");

const friendlyFile = "FRIENDLY";

const evilCommand = "jaz_zer";
const friendlyCommand =
	(process.platform === "win32" ? "copy NUL " : "touch ") + friendlyFile;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.execEVIL = async function (data) {
	child_process.exec(evilCommand);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.execFRIENDLY = async function (data) {
	child_process.exec(friendlyCommand);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.execFileEVIL = async function (data) {
	child_process.execFile(evilCommand);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.execFileFRIENDLY = async function (data) {
	const command = process.platform === "win32" ? "copy" : "touch";
	const args =
		process.platform === "win32" ? ["NUL", friendlyFile] : [friendlyFile];
	const execFile = promisify(child_process.execFile);
	await execFile(command, args, { shell: true });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.execFileSyncEVIL = function (data) {
	child_process.execFileSync(evilCommand);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.execFileSyncFRIENDLY = function (data) {
	const command = process.platform === "win32" ? "copy" : "touch";
	const args =
		process.platform === "win32" ? ["NUL", friendlyFile] : [friendlyFile];
	const options = process.platform === "win32" ? { shell: true } : {};
	child_process.execFileSync(command, args, options);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.spawnEVIL = async function (data) {
	child_process.spawn(evilCommand);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.spawnFRIENDLY = async function (data) {
	const command = process.platform === "win32" ? "copy" : "touch";
	const args =
		process.platform === "win32" ? ["NUL", friendlyFile] : [friendlyFile];
	const proc = child_process.spawn(command, args, { shell: true });
	await new Promise((resolve, reject) => {
		proc.on("exit", (val) => {
			resolve(val);
		});
		proc.on("error", (err) => {
			reject(err);
		});
	});
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.spawnSyncEVIL = function (data) {
	child_process.spawnSync(evilCommand);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.spawnSyncFRIENDLY = function (data) {
	const command = process.platform === "win32" ? "copy" : "touch";
	const args =
		process.platform === "win32" ? ["NUL", friendlyFile] : [friendlyFile];
	child_process.spawnSync(command, args, { shell: true });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.forkEVIL = function (data) {
	child_process.fork(evilCommand);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.forkFRIENDLY = function (data) {
	child_process.fork("makeFRIENDLY.js");
};
