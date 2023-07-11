/*
 * Copyright 2022 Code Intelligence GmbH
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

/* eslint no-constant-condition: 0 */

const target = require("./target.js");

describe("My describe", () => {
	it.fuzz("My fuzz test", (data) => {
		target.fuzzMe(data);
	});

	it.fuzz(
		"My fuzz test with an explicit timeout (async)",
		async (data) => {
			target.fuzzMe(data);
		},
		1000,
	);

	it.fuzz(
		"My fuzz test with an explicit timeout (sync)",
		(data) => {
			target.fuzzMe(data);
		},
		1000,
	);

	it.fuzz("My callback fuzz test", (data, done) => {
		target.callbackFuzzMe(data, done);
	});

	it.fuzz("My async fuzz test", async (data) => {
		await target.asyncFuzzMe(data);
	});

	// In regression mode sync timeouts can not be detected, as the main event
	// loop is blocked and registered timeout handlers can not fire.
	// This is not only the case in regression test mode, but also during
	// fuzzing runs. As the main event loop is blocked, no errors can be
	// propagated to Jest. But the timeout set in libFuzzer will trigger a
	// finding and shut down the whole process with exit code 70.
	it.skip.fuzz("Sync timeout", () => {
		// noinspection InfiniteLoopJS
		while (true) {
			// Ignore
		}
	});

	// Timeouts for async fuzz test functions can be detected in regression and
	// fuzzing mode. libFuzzer shuts down the process after Jest received the
	// error and displayed its result.
	it.skip.fuzz("Async timeout", async () => {
		return new Promise(() => {
			// don't resolve promise
		});
	});

	// Timeouts for done callback fuzz test functions can be detected in
	// regression and fuzzing mode. libFuzzer shuts down the process after Jest
	// received the error and displayed its result.
	// Two parameters are required to execute the done callback branch.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	it.skip.fuzz("Done callback timeout", (ignore, ignore2) => {
		// don't call done
	});
});
