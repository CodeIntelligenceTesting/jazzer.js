/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const child_process = require("child_process");
const { promisify } = require("util");

const friendlyFile = "FRIENDLY";

const evilCommand = "jaz_zer";
const friendlyCommand =
	(process.platform === "win32" ? "copy NUL " : "touch ") + friendlyFile;

module.exports.execEVIL = async function (data) {
	child_process.exec(evilCommand);
};

module.exports.execFRIENDLY = async function (data) {
	child_process.exec(friendlyCommand);
};

module.exports.execFileEVIL = async function (data) {
	child_process.execFile(evilCommand);
};

module.exports.execFileFRIENDLY = async function (data) {
	const command = process.platform === "win32" ? "copy" : "touch";
	const args =
		process.platform === "win32" ? ["NUL", friendlyFile] : [friendlyFile];
	const execFile = promisify(child_process.execFile);
	await execFile(command, args, { shell: true });
};

module.exports.execFileSyncEVIL = function (data) {
	child_process.execFileSync(evilCommand);
};

module.exports.execFileSyncFRIENDLY = function (data) {
	const command = process.platform === "win32" ? "copy" : "touch";
	const args =
		process.platform === "win32" ? ["NUL", friendlyFile] : [friendlyFile];
	const options = process.platform === "win32" ? { shell: true } : {};
	child_process.execFileSync(command, args, options);
};

module.exports.spawnEVIL = async function (data) {
	child_process.spawn(evilCommand);
};

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

module.exports.spawnSyncEVIL = function (data) {
	child_process.spawnSync(evilCommand);
};

module.exports.spawnSyncFRIENDLY = function (data) {
	const command = process.platform === "win32" ? "copy" : "touch";
	const args =
		process.platform === "win32" ? ["NUL", friendlyFile] : [friendlyFile];
	child_process.spawnSync(command, args, { shell: true });
};

module.exports.forkEVIL = function (data) {
	child_process.fork(evilCommand);
};

module.exports.forkFRIENDLY = function (data) {
	child_process.fork("makeFRIENDLY.js");
};

module.exports.execInvalid = async function (data) {
	child_process.exec(0);
};
