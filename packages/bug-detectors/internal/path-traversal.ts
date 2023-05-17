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

import { reportFinding } from "../findings";
import { guideTowardsContainment } from "@jazzer.js/fuzzer";
import { registerBeforeHook } from "@jazzer.js/hooking";

/**
 * Importing this file adds "before-hooks" for all functions in the built-in `child_process` module and guides
 * the fuzzer towards the uniquely chosen `goal` string `"../../jaz_zer"`. If the goal is found in the first argument
 * of any hooked function, a `Finding` is reported.
 */
const goal = "../../jaz_zer";
const modulesToHook = [
	{
		moduleName: "fs",
		functionNames: [
			"access",
			"accessSync",
			"appendFile",
			"appendFileSync",
			"chmod",
			"chown",
			"chownSync",
			"chmodSync",
			"copyFile",
			"copyFileSync",
			"cp",
			"cpSync",
			"createReadStream",
			"createWriteStream",
			"exists",
			"existsSync",
			"link",
			"linkSync",
			"lchmod",
			"lchmodSync",
			"lchown",
			"lchownSync",
			"lstat",
			"lstatSync",
			"lutimes",
			"lutimesSync",
			"mkdir",
			"mkdirSync",
			"open",
			"opendir",
			"opendirSync",
			"openAsBlob",
			"openSync",
			"readFile",
			"readFileSync",
			"readlink",
			"readlinkSync",
			"readdir",
			"readdirSync",
			"realpath",
			"realpathSync",
			"rename",
			"renameSync",
			"rm",
			"rmSync",
			"rmdir",
			"rmdirSync",
			"stat",
			"statfs",
			"statfsSync",
			"statSync",
			"symlink",
			"symlinkSync",
			"truncate",
			"truncateSync",
			"unlink",
			"unlinkSync",
			"unwatchFile",
			"utimes",
			"utimesSync",
			"watch",
			"watchFile",
			"writeFile",
			"writeFileSync",
		],
	},
	{
		moduleName: "fs/promises",
		functionNames: [
			"access",
			"appendFile",
			"chmod",
			"chown",
			"copyFile",
			"cp",
			"lchmod",
			"lchown",
			"link",
			"lstat",
			"lutimes",
			"mkdir",
			"open",
			"opendir",
			"readFile",
			"readlink",
			"readdir",
			"realpath",
			"rename",
			"rm",
			"rmdir",
			"stat",
			"statfs",
			"symlink",
			"truncate",
			"unlink",
			"utimes",
			"watch",
			"writeFile",
		],
	},
	// path.join() can have any number of strings as inputs. Internally, it uses path.normalize(), which we hook here.
	{
		moduleName: "path",
		functionNames: ["normalize", "resolve"],
	},
];

for (const module of modulesToHook) {
	for (const functionName of module.functionNames) {
		const beforeHook = (
			thisPtr: unknown,
			params: unknown[],
			hookId: number
		) => {
			if (params === undefined || params.length === 0) {
				return;
			}
			// The first argument of the original function is typically
			// a path or a file name.
			const firstArgument = params[0] as string;
			if (firstArgument.includes(goal)) {
				reportFinding(
					`Path Traversal in ${functionName}(): called with '${firstArgument}'`
				);
			}
			guideTowardsContainment(firstArgument, goal, hookId);
		};

		registerBeforeHook(functionName, module.moduleName, false, beforeHook);
	}
}

// Some functions have two arguments that can be used for path traversal.
const functionsWithTwoTargets = [
	{
		moduleName: "fs/promises",
		functionNames: ["copyFile", "cp", "link", "rename", "symlink"],
	},
	{
		moduleName: "fs",
		functionNames: [
			"copyFile",
			"copyFileSync",
			"cp",
			"cpSync",
			"link",
			"linkSync",
			"rename",
			"renameSync",
			"symlink",
			"symlinkSync",
		],
	},
];

for (const module of functionsWithTwoTargets) {
	for (const functionName of module.functionNames) {
		const beforeHook = (
			thisPtr: unknown,
			params: unknown[],
			hookId: number
		) => {
			if (params === undefined || params.length < 2) {
				return;
			}
			// The first two arguments are paths.
			const firstArgument = params[0] as string;
			const secondArgument = params[1] as string;
			if (firstArgument.includes(goal) || secondArgument.includes(goal)) {
				reportFinding(
					`Path Traversal in ${functionName}(): called with '${firstArgument}'` +
						` and '${secondArgument}'`
				);
			}
			guideTowardsContainment(firstArgument, goal, hookId);
			// We don't want to confuse the fuzzer with the same hookId (used as a program counter (PC)),
			// so we increment it.
			guideTowardsContainment(secondArgument, goal, hookId + 1);
		};

		registerBeforeHook(functionName, module.moduleName, false, beforeHook);
	}
}
