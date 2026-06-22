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

import path from "path";

import {
	ensureFilepath,
	normalizeLegacyEngineFlags,
	prepareArgs,
} from "./utils";

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
		it("normalizes legacy single-dash engine flags before parsing", () => {
			expect(
				normalizeLegacyEngineFlags([
					"-runs=4000",
					"-seed=1337",
					"-max_len=16",
					"-artifact_prefix=/tmp/",
					"-dict=tokens.dict",
				]),
			).toEqual([
				"--runs=4000",
				"--seed=1337",
				"--max_len=16",
				"--artifact_prefix=/tmp/",
				"--dict=tokens.dict",
			]);
		});

		it("leaves regular CLI arguments unchanged", () => {
			expect(
				normalizeLegacyEngineFlags([
					"fuzz.js",
					"-f",
					"target",
					"--engine=afl",
					"corpus",
				]),
			).toEqual(["fuzz.js", "-f", "target", "--engine=afl", "corpus"]);
		});

		it("does not add an undefined engine", () => {
			const args = {
				_: [],
				corpus: [],
				fuzzTarget: "filename.js",
			};
			const options = prepareArgs(args);
			expect(
				Object.prototype.hasOwnProperty.call(options, "engine"),
			).toBeFalsy();
		});

		it("converts corpus directories to strings", () => {
			const args = {
				_: [],
				corpus: ["directory1", "directory2"],
				fuzzTarget: "filename.js",
			};
			const options = prepareArgs(args);
			expect(options).toEqual({
				fuzzTarget: "file://" + path.join(process.cwd(), "filename.js"),
				corpusDirectories: ["directory1", "directory2"],
			});
		});

		it("rejects engine args after double dash", () => {
			const args = {
				_: ["-use_value_profile=1"],
				corpus: [],
				fuzzTarget: "filename.js",
			};

			expect(() => prepareArgs(args)).toThrow("after '--'");
		});

		it("keeps explicit libFuzzer options", () => {
			const args = {
				_: [],
				corpus: [],
				fuzzTarget: "filename.js",
				libFuzzerOptions: ["-use_value_profile=1"],
			};

			expect(prepareArgs(args)).toEqual({
				fuzzTarget: "file://" + path.join(process.cwd(), "filename.js"),
				libFuzzerOptions: ["-use_value_profile=1"],
			});
		});

		it("normalizes engine alias", () => {
			const args = {
				_: [],
				corpus: [],
				engine: "afl",
				fuzzTarget: "filename.js",
			};
			const options = prepareArgs(args);
			expect(options.engine).toBe("libafl");
		});
	});
});
