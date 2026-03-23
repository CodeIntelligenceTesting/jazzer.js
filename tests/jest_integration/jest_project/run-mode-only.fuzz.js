/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

describe("Run mode only and standard", () => {
	it.fuzz("standard test", (data) => {
		throw new Error("Standard test should not be called when only is used!");
	});

	it.only.fuzz("only test", (data) => {
		console.log("only test called");
	});
});
