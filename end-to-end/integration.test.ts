/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import * as target from "./target";

describe("My describe", () => {
	it("My normal Jest test", () => {
		expect(1).toEqual(1);
	});

	it("My done callback Jest test", (done) => {
		expect(1).toEqual(1);
		done();
	});

	it("My async Jest test", async () => {
		expect(1).toEqual(1);
	});

	it("Test target function", () => {
		const data = Buffer.from("a");
		target.fuzzMe(data);
	});
});
