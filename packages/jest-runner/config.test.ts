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

import { OptionsManager, OptionSource } from "@jazzer.js/core";

import { loadConfig } from "./config";

const defaultJestOptions = new OptionsManager(OptionSource.DefaultJestOptions);

describe("Config", () => {
	describe("loadConfig", () => {
		it("return default configuration if nothing found", () => {
			expect(loadConfig().getOptions()).toEqual(
				defaultJestOptions.getOptions(),
			);
		});
		it("merge found and default options", () => {
			const config = loadConfig({}, "test-jazzerjs");
			expect(config.getOptions()).not.toEqual(defaultJestOptions.getOptions());
			expect(config.get("includes")).toContain("target");
			expect(config.get("excludes")).toContain("nothing");
		});
		it("merge explicitly passed in options", () => {
			const config = loadConfig({ fuzzTarget: "foo" }, "test-jazzerjs");
			expect(config.get("fuzzTarget")).toEqual("foo");
		});
		it("deep copy configurations", () => {
			const config1 = loadConfig();
			config1.get("fuzzerOptions").push("-runs=100");
			const config2 = loadConfig({}, "merge-test-jazzerjs");
			expect(config1.get("fuzzerOptions")).not.toEqual(
				config2.get("fuzzerOptions"),
			);
		});
		it("default to regression mode", () => {
			expect(loadConfig().get("mode")).toEqual("regression");
		});
		it("set fuzzing mode based on environment variable", () => {
			try {
				process.env.JAZZER_FUZZ = "1";
				expect(loadConfig().get("mode")).toEqual("fuzzing");
			} finally {
				delete process.env.JAZZER_FUZZ;
			}
		});
	});
});
