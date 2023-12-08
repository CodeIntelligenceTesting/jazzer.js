/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import "@jazzer.js/jest-runner";
import * as target from "./target";

describe("Target", () => {
	it.fuzz("executes sync methods", (data: Buffer) => {
		target.fuzzMe(data);
	});

	it.fuzz("executes async methods", async (data: Buffer) => {
		await target.asyncFuzzMe(data);
	});

	it.fuzz(
		"executes methods with a done callback",
		(data: Buffer, done: (e?: Error) => void) => {
			target.callbackFuzzMe(data, done);
		},
	);
});
