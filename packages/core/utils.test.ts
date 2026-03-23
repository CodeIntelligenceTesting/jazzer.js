/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import path from "path";

import { ensureFilepath, prepareArgs } from "./utils";

describe("core", () => {
	describe("ensuresFilepath", () => {
		it("adds .js suffix if none or unsupported one is present", () => {
			expect(ensureFilepath("filename")).toMatch(/.*filename.js$/);
			expect(ensureFilepath("filename.xyz")).toMatch(/.*filename\.xyz\.js$/);
			expect(ensureFilepath("filename.js")).toMatch(/.*filename\.js$/);
			expect(ensureFilepath("filename.mjs")).toMatch(/.*filename\.mjs$/);
			expect(ensureFilepath("filename.cjs")).toMatch(/.*filename\.cjs$/);
		});
		it("adds file schema", () => {
			expect(ensureFilepath("filename.js")).toMatch(/^file:\/\/.*/);
		});
		it("adds current working directory to filename", () => {
			const expectedPath = path.join(process.cwd(), "filename.js");
			expect(ensureFilepath("filename.js")).toMatch(expectedPath);
		});
	});
	describe("prepareArgs", () => {
		it("converts fuzzer args to strings", () => {
			const args = {
				_: ["-some_arg=value", "-other_arg", 123],
				corpus: ["directory1", "directory2"],
				fuzzTarget: "filename.js",
			};
			const options = prepareArgs(args);
			expect(options).toEqual({
				fuzzTarget: "file://" + path.join(process.cwd(), "filename.js"),
				fuzzerOptions: [
					"directory1",
					"directory2",
					"-some_arg=value",
					"-other_arg",
					"123",
				],
			});
		});
	});
});
