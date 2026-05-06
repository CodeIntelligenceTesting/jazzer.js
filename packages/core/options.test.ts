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

import fs from "fs";
import os from "os";
import path from "path";

import { Mode, OptionsManager, OptionSource } from "@jazzer.js/options";

import {
	buildLibAflOptions,
	buildLibFuzzerOptions,
	spawnsSubprocess,
} from "./options";

describe("libFuzzer options", () => {
	describe("spawnsSubprocess", () => {
		it("checks if subprocess libFuzzer flags are present", () => {
			expect(spawnsSubprocess(["-fork=1"])).toBeTruthy();
			expect(spawnsSubprocess(["-fork=0"])).toBeFalsy();
			expect(
				spawnsSubprocess(["abc", "-foo=0", "-fork=0", "-jobs=1"]),
			).toBeTruthy();
			expect(spawnsSubprocess(["-foo=0"])).toBeFalsy();
			expect(spawnsSubprocess(["abc"])).toBeFalsy();
			expect(spawnsSubprocess(["123"])).toBeFalsy();
		});
	});

	it("translates common options and appends backend-specific options", () => {
		const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
			{
				artifactPrefix: "/tmp/artifacts/",
				corpusDirectories: ["corpus-main", "corpus-seed"],
				libFuzzerOptions: ["-use_value_profile=1", "-print_final_stats=1"],
				maxLen: 1024,
				maxTotalTime: 42,
				runs: 99,
				seed: 1337,
				timeout: 1234,
			},
			OptionSource.CommandLineArguments,
		);

		expect(buildLibFuzzerOptions(manager)).toEqual([
			"unused_arg0_report_a_bug_if_you_see_this",
			"-seed=1337",
			"-max_len=1024",
			"-timeout=2",
			"-runs=99",
			"-max_total_time=42",
			"-artifact_prefix=/tmp/artifacts/",
			"corpus-main",
			"corpus-seed",
			"-use_value_profile=1",
			"-print_final_stats=1",
			"-handle_int=0",
			"-handle_term=0",
			"-handle_segv=0",
		]);
	});

	it("forwards explicitly configured zero runs to libFuzzer", () => {
		const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
			{ runs: 0 },
			OptionSource.CommandLineArguments,
		);

		expect(buildLibFuzzerOptions(manager)).toContain("-runs=0");
	});

	it("does not turn the default zero runs value into a libFuzzer run limit", () => {
		const manager = new OptionsManager(OptionSource.DefaultCLIOptions);

		expect(buildLibFuzzerOptions(manager)).not.toContain("-runs=0");
	});

	it("rejects common flags in libFuzzer-specific options", () => {
		for (const option of ["-runs=1", "-max_len=1", "-timeout=5", "-dict=x"]) {
			const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
				{ libFuzzerOptions: [option] },
				OptionSource.CommandLineArguments,
			);

			expect(() => buildLibFuzzerOptions(manager)).toThrow(
				"Jazzer.js common option",
			);
		}
	});
});

describe("LibAFL options", () => {
	it("builds structured LibAFL options from common options", () => {
		const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
			{
				artifactPrefix: "/tmp/artifacts/",
				corpusDirectories: ["corpus-main", "corpus-seed"],
				engine: "libafl",
				maxLen: 1024,
				maxTotalTime: 42,
				runs: 99,
				seed: 1337,
				timeout: 1234,
			},
			OptionSource.CommandLineArguments,
		);

		expect(buildLibAflOptions(manager)).toEqual({
			mode: Mode.Fuzzing,
			runs: 99,
			runsSet: true,
			seed: 1337,
			maxLen: 1024,
			timeoutMillis: 1234,
			maxTotalTimeSeconds: 42,
			artifactPrefix: "/tmp/artifacts/",
			corpusDirectories: ["corpus-main", "corpus-seed"],
			dictionaryFiles: [],
		});
	});

	it("preserves explicitly configured zero runs for LibAFL", () => {
		const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
			{
				engine: "libafl",
				runs: 0,
			},
			OptionSource.CommandLineArguments,
		);

		expect(buildLibAflOptions(manager)).toMatchObject({
			runs: 0,
			runsSet: true,
		});
	});

	it("marks default zero runs as unset for LibAFL", () => {
		const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
			{ engine: "libafl" },
			OptionSource.CommandLineArguments,
		);

		expect(buildLibAflOptions(manager)).toMatchObject({
			runs: 0,
			runsSet: false,
		});
	});

	it("rejects LibAFL-specific options until they are implemented", () => {
		const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
			{
				engine: "libafl",
				libAflOptions: ["-some_libafl_option=1"],
			},
			OptionSource.CommandLineArguments,
		);

		expect(() => buildLibAflOptions(manager)).toThrow("not supported yet");
	});

	it("rejects libFuzzer-specific options in LibAFL mode", () => {
		const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
			{
				engine: "libafl",
				libFuzzerOptions: ["-fork=1"],
			},
			OptionSource.CommandLineArguments,
		);

		expect(() => buildLibAflOptions(manager)).toThrow(
			"libFuzzerOptions can only be used",
		);
	});

	it("supports regression mode in LibAFL mode", () => {
		const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
			{
				corpusDirectories: ["corpus"],
				engine: "libafl",
				mode: Mode.Regression,
				runs: 1,
			},
			OptionSource.CommandLineArguments,
		);

		expect(buildLibAflOptions(manager)).toEqual({
			mode: Mode.Regression,
			runs: 0,
			runsSet: true,
			seed: 0,
			maxLen: 4096,
			timeoutMillis: 5000,
			maxTotalTimeSeconds: 0,
			artifactPrefix: "",
			corpusDirectories: ["corpus"],
			dictionaryFiles: [],
		});
	});

	it("supports dictionary entries in LibAFL mode", () => {
		const tempDirectory = fs.mkdtempSync(
			path.join(os.tmpdir(), "jazzer-libafl-dict-"),
		);
		const dictionaryPath = path.join(tempDirectory, "seed.dict");
		fs.writeFileSync(dictionaryPath, '"Amazing"\n');

		try {
			const manager = new OptionsManager(OptionSource.DefaultCLIOptions)
				.merge(
					{
						corpusDirectories: ["corpus"],
						dictionaryFiles: [dictionaryPath],
						engine: "libafl",
					},
					OptionSource.CommandLineArguments,
				)
				.merge(
					{ dictionaryEntries: ["banana"] },
					OptionSource.JestFuzzTestOptions,
				);

			const built = buildLibAflOptions(manager);
			expect(built.corpusDirectories).toEqual(["corpus"]);
			expect(built.dictionaryFiles).toHaveLength(1);
			expect(fs.readFileSync(built.dictionaryFiles[0], "utf8")).toContain(
				"\\x62\\x61\\x6e\\x61\\x6e\\x61",
			);
			expect(fs.readFileSync(built.dictionaryFiles[0], "utf8")).toContain(
				"Amazing",
			);
		} finally {
			fs.rmSync(tempDirectory, { force: true, recursive: true });
		}
	});

	it("rejects malformed common integer options", () => {
		for (const option of [
			{ runs: -1 },
			{ maxLen: 0 },
			{ seed: 1.5 },
			{ maxTotalTime: Number.NaN },
		]) {
			const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
				{ engine: "libafl", ...option },
				OptionSource.CommandLineArguments,
			);

			expect(() => buildLibAflOptions(manager)).toThrow();
		}
	});
});
