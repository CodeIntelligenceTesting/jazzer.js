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

// Original file has MIT Licence
// This file is copied from prebuild/strip.js from https://github.com/prebuild/prebuild

const child_process = require("child_process");

function strip(files, cb) {
	// TODO no support on windows, noop
	const platform = process.platform;
	if (platform === "win32") return process.nextTick(cb);
	stripFiles(files, platform, cb);
}

function stripFiles(file, platform, cb) {
	spawn(
		process.env.STRIP || "strip",
		stripArgs(platform, file),
		function (err) {
			if (err) {
				cb(err);
				return;
			}
		},
	);
}

function stripArgs(platform, file) {
	if (platform === "darwin") return [file, "-Sx"];
	if (["freebsd", "linux"].includes(platform)) return [file, "--strip-all"];
	// TODO find out what args to use for other platforms, e.g. 'sunos'
	return [];
}

function spawn(cmd, args, cb) {
	return child_process.spawn(cmd, args).on("exit", function (code) {
		if (code === 0) return cb();
		cb(new Error("could not spawn strip"));
	});
}

module.exports = strip;
