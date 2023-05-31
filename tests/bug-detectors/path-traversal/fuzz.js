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

/* eslint no-undef: 0 */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */

const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");

const { makeFnCalledOnce } = require("../helpers");

const evil_path = "../../jaz_zer/";
const safe_path = "../../safe_path/";

/**
 * libFuzzer tends to call the test function at least twice: once with empty data; and subsequent times with user data.
 * If the test function generates a directory, it will fail with error "EEXIST: file already exists, mkdir '...'" on the
 * second call. Thus, we call only once.
 */

// Test fs module
module.exports.PathTraversalFsOpenEvilSync = makeFnCalledOnce((data) => {
	fs.openSync(evil_path, "r");
});

module.exports.PathTraversalFsOpenEvilAsync = makeFnCalledOnce(async (data) => {
	fs.open(evil_path, "r", (err, f) => {});
});

module.exports.PathTraversalFsMkdirEvilSync = makeFnCalledOnce((data) => {
	fs.mkdirSync(evil_path);
});

module.exports.PathTraversalFsMkdirSafeSync = makeFnCalledOnce((data) => {
	fs.mkdirSync(safe_path);
});

module.exports.PathTraversalFsMkdirEvilAsync = makeFnCalledOnce(
	async (data) => {
		fs.mkdir(evil_path, () => {});
	}
);

module.exports.PathTraversalFsMkdirSafeAsync = makeFnCalledOnce(
	async (data) => {
		fs.mkdir(safe_path, () => {});
	}
);

// Test fsp module
module.exports.PathTraversalFspMkdirSafeAsync = makeFnCalledOnce(
	async (data) => {
		await fsp.mkdir(safe_path);
	}
);

module.exports.PathTraversalFspMkdirEvilAsync = makeFnCalledOnce(
	async (data) => {
		return fsp.mkdir(evil_path);
	}
);

module.exports.PathTraversalFspOpenEvilAsync = makeFnCalledOnce(
	async (data) => {
		return callWithTimeout(() => fsp.open(evil_path, "r"), 500);
	},
	1
);

// Test path module
module.exports.PathTraversalJoinEvilSync = makeFnCalledOnce((data) => {
	path.join(evil_path, "EVIL");
});

module.exports.PathTraversalJoinSafeSync = makeFnCalledOnce((data) => {
	path.join(safe_path, "SAFE");
});

module.exports.PathTraversalJoinEvilAsync = makeFnCalledOnce(async (data) => {
	path.join(evil_path, "EVIL");
});

module.exports.PathTraversalJoinSafeAsync = makeFnCalledOnce(async (data) => {
	path.join(safe_path, "SAFE");
});
