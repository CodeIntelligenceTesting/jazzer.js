/*
 * Copyright 2026 Code Intelligence GmbH
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
