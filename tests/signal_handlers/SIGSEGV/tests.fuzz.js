/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const {
	SIGSEGV_ASYNC,
	SIGSEGV_SYNC,
	NATIVE_SIGSEGV_SYNC,
	NATIVE_SIGSEGV_ASYNC,
} = require("./fuzz.js");

describe("Jest", () => {
	it.fuzz("Sync", SIGSEGV_SYNC);
	it.fuzz("Async", SIGSEGV_ASYNC);
	it.fuzz("Native", NATIVE_SIGSEGV_SYNC);
	it.fuzz("Native Async", NATIVE_SIGSEGV_ASYNC);
});
