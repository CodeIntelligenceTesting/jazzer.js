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

import {
	buildLibAflOptions,
	defaultCLIOptions,
	defaultJestOptions,
	fromSnakeCase,
	fromSnakeCaseWithPrefix,
	Options,
	OptionsManager,
	OptionSource,
	resolveEngine,
	spawnsSubprocess,
	validateKeySource,
} from "./options";

describe("options", () => {
	describe("OptionsManager", () => {
		it("mergeInPlace: options of type string[] are copied", () => {
			const input = ["1", "2", "3"];
			const v0 = "CHANGED";
			const v1 = "CHANGED AGAIN";

			// get all keys of Options for which the type is string[]
			Object.keys(defaultCLIOptions).forEach((key) => {
				if (defaultCLIOptions[key as keyof Options] instanceof Array) {
					mutateArrayAndCheck(key as keyof Options, input, v0, v1);
				}
			});
		});

		it("mergeInPlace: Uint8Array is copied", () => {
			const originalArray = new Uint8Array([0, 1, 2, 3, 4, 5]);
			const options = new OptionsManager(OptionSource.DefaultCLIOptions);
			options.merge(
				{ dictionaryEntries: [originalArray] },
				OptionSource.JestFuzzTestOptions,
			);
			originalArray[0] = 42;
			expect(options.get("dictionaryEntries")).not.toStrictEqual(originalArray);
			expect(options.get("dictionaryEntries")).toStrictEqual([
				new Uint8Array([0, 1, 2, 3, 4, 5]),
			]);
		});

		it("mergeInPlace: Int8Array is copied", () => {
			const originalArray = new Int8Array([-1, 0, 1, 2, 3, 4, 5]);
			const options = new OptionsManager(OptionSource.DefaultCLIOptions);
			options.merge(
				{ dictionaryEntries: [originalArray] },
				OptionSource.JestFuzzTestOptions,
			);
			originalArray[0] = 42;
			expect(options.get("dictionaryEntries")).not.toStrictEqual(originalArray);
			expect(options.get("dictionaryEntries")).toStrictEqual([
				new Int8Array([-1, 0, 1, 2, 3, 4, 5]),
			]);
		});
	});

	describe("merge", () => {
		it("uses LibAFL as default CLI engine", () => {
			expect(defaultCLIOptions.engine).toBe("libafl");
		});

		it("keeps libFuzzer as default Jest engine", () => {
			expect(defaultJestOptions.engine).toBe("libfuzzer");
		});

		it("New options with lower priorities will not be added", () => {
			const baseOptions = OptionsManager.attachSource(
				defaultCLIOptions,
				OptionSource.JestFuzzTestOptions,
			);

			const mergedOptions = new OptionsManager(baseOptions).merge(
				{ verbose: "foo", fuzzTarget: "bla" },
				OptionSource.CommandLineArguments,
			);
			expect(mergedOptions.getOptions()).not.toHaveProperty("verbose", "foo");
		});

		it("Only 'Jest fuzz tests' are allowed to set `dictionaryEntries`", () => {
			// Looping over enum keys gives them twice: 1) 0...n; 2) the key names: "JestFuzztestOptions" etc.
			Object.keys(OptionSource)
				.filter((k) => isNaN(Number(k)))
				.forEach((key) => {
					const source = OptionSource[key as keyof typeof OptionSource];
					if (source === OptionSource.JestFuzzTestOptions) {
						const options = new OptionsManager(
							OptionSource.DefaultCLIOptions,
						).merge({ dictionaryEntries: ["foo"] }, source);
						expect(options.getOptionsWithSource()).toHaveProperty(
							"dictionaryEntries",
							{
								value: ["foo"],
								source: source,
							},
						);
					} else {
						expect(() => {
							new OptionsManager(OptionSource.DefaultCLIOptions).merge(
								{ dictionaryEntries: ["foo"] },
								source,
							);
						}).toThrow();
					}
				});
		});
	});

	describe("detachSource", () => {
		it("options should not change", () => {
			// @ts-ignore
			const options = OptionsManager.detachSource({
				verbose: { value: false, source: OptionSource.JestFuzzTestOptions },
				dictionaryEntries: {
					value: ["1", "2", "3"],
					source: OptionSource.JestFuzzTestOptions,
				},
			});
			expect(options).toHaveProperty("verbose", false);
			expect(options).toHaveProperty("dictionaryEntries", ["1", "2", "3"]);
			// expect options to have only one property
			expect(Object.keys(options).length).toEqual(2);
		});
	});

	describe("processOptions", () => {
		it("prefer configuration file values to defaults", () => {
			const manager = new OptionsManager(OptionSource.DefaultJestOptions).merge(
				{ fuzzTarget: "FOO" },
				OptionSource.ConfigurationFile,
			);
			const options = manager.getOptions();
			expect(options).toHaveProperty("fuzzTarget", "FOO");
			expectDefaultsExceptKeys(
				options,
				OptionSource.DefaultJestOptions,
				"fuzzTarget",
			);
		});
		it("prefer environment variables to configuration file values", () => {
			withEnv("JAZZER_FUZZ_TARGET", "FOO", () => {
				withEnv("JAZZER_INCLUDES", '["BAR", "BAZ"]', () => {
					withSource(
						OptionSource.DefaultJestOptions,
						{ fuzzTarget: "QUX" },
						OptionSource.ConfigurationFile,
						(options) => {
							expect(options).toHaveProperty("fuzzTarget", "FOO");
							expect(options).toHaveProperty("includes", ["BAR", "BAZ"]);
							expectDefaultsExceptKeys(
								options,
								OptionSource.DefaultJestOptions,
								"fuzzTarget",
								"includes",
							);
						},
					);
				});
			});
		});
		it("prefer CLI parameters to environment variables", () => {
			withEnv("JAZZER_FUZZ_TARGET", "bar", () => {
				withSource(
					OptionSource.DefaultCLIOptions,
					{ fuzzTarget: "foo" },
					OptionSource.CommandLineArguments,
					(options) => {
						expect(options).toHaveProperty("fuzzTarget", "foo");
						expectDefaultsExceptKeys(
							options,
							OptionSource.DefaultCLIOptions,
							"fuzzTarget",
						);
					},
				);
			});
		});
		it("includes and excludes are set together", () => {
			withSource(
				OptionSource.DefaultCLIOptions,
				{ includes: ["foo"] },
				OptionSource.CommandLineArguments,
				(options) => {
					expect(options).toHaveProperty("excludes", []);
				},
			);
			withSource(
				OptionSource.DefaultCLIOptions,
				{ excludes: ["foo"] },
				OptionSource.CommandLineArguments,
				(options) => {
					expect(options).toHaveProperty("includes", []);
				},
			);
		});
		it("error on unknown option", () => {
			expect(() => {
				withSource(
					OptionSource.DefaultCLIOptions,
					{ unknown_option: "foo" },
					OptionSource.CommandLineArguments,
					(options) => {},
				);
			}).toThrow("unknown_option");
		});
		it("error on mismatching type", () => {
			expect(() => {
				withSource(
					OptionSource.DefaultCLIOptions,
					{ fuzzTarget: false },
					OptionSource.CommandLineArguments,
					(options) => {},
				);
			}).toThrow("expected type 'string'");
		});
		it("options are copied", () => {
			const input = { includes: ["foo"] };
			withSource(
				OptionSource.DefaultCLIOptions,
				input,
				OptionSource.CommandLineArguments,
				(options) => {
					input.includes.push("bar");
					expect(options.includes).not.toContain("bar");
				},
			);
		});
		it("set debug env variable", () => {
			withEnv("JAZZER_DEBUG", "", () => {
				withSource(
					OptionSource.DefaultCLIOptions,
					{ verbose: true },
					OptionSource.CommandLineArguments,
					(options) => {
						expect(process.env.JAZZER_DEBUG).toEqual("1");
					},
				);
			});
			withEnv("JAZZER_DEBUG", "", () => {
				withEnv("DEBUG", "1", () => {
					// const options = buildInitialOptions(OptionSource.DefaultCLIOptions);
					// expect(process.env.JAZZER_DEBUG).toEqual("1");
				});
			});
		});
		it("does not merge __proto__", () => {
			expect(() => {
				withSource(
					OptionSource.DefaultCLIOptions,
					JSON.parse('{"__proto__": {"polluted": 42}}'),
					OptionSource.CommandLineArguments,
					(options) => {},
				);
			}).toThrow();
		});
	});
});

describe("KeyFormatSource", () => {
	describe("fromSnakeCase", () => {
		it("converts to camelCase", () => {
			expect(fromSnakeCase("snake_case")).toEqual("snakeCase");
			expect(fromSnakeCase("Snake_Case")).toEqual("snakeCase");
			expect(fromSnakeCase("SNAKE_CASE")).toEqual("snakeCase");
			expect(fromSnakeCase("SNAKE_CASE_123")).toEqual("snakeCase123");
			expect(fromSnakeCase("SNAKE_CASE_123_")).toEqual("snakeCase123_");
			expect(fromSnakeCase("word")).toEqual("word");
			expect(fromSnakeCase("kebab-case")).toEqual("kebab-case");
		});
	});
	describe("fromSnakeCaseWithPrefix", () => {
		it("converts to camelCase", () => {
			expect(fromSnakeCaseWithPrefix("PREFIX")("PREFIX_snake_case")).toEqual(
				"snakeCase",
			);
			expect(fromSnakeCaseWithPrefix("PREFIX")("PREFIX_Snake_Case")).toEqual(
				"snakeCase",
			);
			expect(fromSnakeCaseWithPrefix("PREFIX")("PREFIX_SNAKE_CASE")).toEqual(
				"snakeCase",
			);
			expect(
				fromSnakeCaseWithPrefix("PREFIX")("PREFIX_SNAKE_CASE_123"),
			).toEqual("snakeCase123");
			expect(
				fromSnakeCaseWithPrefix("PREFIX")("PREFIX_SNAKE_CASE_123_"),
			).toEqual("snakeCase123_");
			expect(fromSnakeCaseWithPrefix("PREFIX")("PREFIX_word")).toEqual("word");
			expect(fromSnakeCaseWithPrefix("PREFIX")("PREFIX_kebab-case")).toEqual(
				"kebab-case",
			);
		});
	});
});

describe("buildLibFuzzerOptions", () => {
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
});

describe("libafl options", () => {
	it("normalizes engine aliases", () => {
		expect(resolveEngine("libfuzzer")).toBe("libfuzzer");
		expect(resolveEngine("afl")).toBe("libafl");
		expect(resolveEngine("libafl")).toBe("libafl");
		expect(() => resolveEngine("unknown")).toThrow("Unknown fuzzing engine");
	});

	it("canonicalizes engine aliases during option merge", () => {
		const manager = new OptionsManager(OptionSource.DefaultJestOptions).merge(
			{ engine: "afl" },
			OptionSource.ConfigurationFile,
		);

		expect(manager.get("engine")).toBe("libafl");
	});

	it("builds structured LibAFL options from fuzzer options", () => {
		const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
			{
				engine: "libafl",
				timeout: 1234,
				fuzzerOptions: [
					"corpus-main",
					"corpus-seed",
					"-runs=99",
					"-seed=1337",
					"-max_len=1024",
					"-max_total_time=42",
					"-artifact_prefix=/tmp/artifacts/",
				],
			},
			OptionSource.CommandLineArguments,
		);

		expect(buildLibAflOptions(manager)).toEqual({
			mode: "fuzzing",
			runs: 99,
			seed: 1337,
			maxLen: 1024,
			timeoutMillis: 1234,
			maxTotalTimeSeconds: 42,
			artifactPrefix: "/tmp/artifacts/",
			corpusDirectories: ["corpus-main", "corpus-seed"],
			dictionaryFiles: [],
		});
	});

	it("rejects unsupported options in LibAFL mode", () => {
		const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
			{
				engine: "libafl",
				fuzzerOptions: ["-fork=1"],
			},
			OptionSource.CommandLineArguments,
		);

		expect(() => buildLibAflOptions(manager)).toThrow("not supported");
	});

	it("supports regression mode in LibAFL mode", () => {
		const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
			{
				engine: "libafl",
				mode: "regression",
				fuzzerOptions: ["corpus", "-runs=1"],
			},
			OptionSource.CommandLineArguments,
		);

		expect(buildLibAflOptions(manager)).toEqual({
			mode: "regression",
			runs: 0,
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
						engine: "libafl",
						fuzzerOptions: ["corpus", `-dict=${dictionaryPath}`],
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

	it("rejects malformed LibAFL integer flags", () => {
		for (const option of ["-runs=1abc", "-max_len=1.5", "-seed="]) {
			const manager = new OptionsManager(OptionSource.DefaultCLIOptions).merge(
				{
					engine: "libafl",
					fuzzerOptions: [option],
				},
				OptionSource.CommandLineArguments,
			);

			expect(() => buildLibAflOptions(manager)).toThrow();
		}
	});
});

function expectDefaultsExceptKeys(
	options: Options,
	source: OptionSource,
	...ignore: string[]
) {
	const defaultOptions = new OptionsManager(source).getOptions();
	Object.keys(defaultOptions).forEach((key: string) => {
		if (ignore.includes(key)) return;
		expect(options).toHaveProperty(key, defaultOptions[key as keyof Options]);
	});
}

function withEnv(property: string, value: string, fn: () => void) {
	const current = process.env[property];
	try {
		process.env[property] = value;
		fn();
	} finally {
		if (current) {
			process.env[property] = current;
		} else {
			delete process.env[property];
		}
	}
}

function withSource(
	initialSource: OptionSource,
	args: object,
	argsSource: OptionSource,
	fn: (options: Options) => void,
) {
	const options = new OptionsManager(initialSource).merge(args, argsSource);
	fn(options.getOptions());
}

// Check that OptionsManager.merge() copies new input
function mutateArrayAndCheck<T extends Options, K extends keyof Options>(
	key: K,
	newValue: T[K],
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	v0: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	v1: any,
) {
	const options = new OptionsManager(OptionSource.DefaultCLIOptions);
	const newValueCopy = OptionsManager.copyOptionValue(newValue);
	if (!(newValueCopy instanceof Array) || newValueCopy.length < 1) {
		throw new Error("Array should have at least 1 elements.");
	}
	if (!(newValue instanceof Array) || newValueCopy.length < 1) {
		throw new Error("Array should have at least 1 elements.");
	}
	const originalReference = options.get(key);
	const originalValue = OptionsManager.copyOptionValue(originalReference);

	let newPriority = OptionSource.CommandLineArguments;
	try {
		validateKeySource(key, OptionSource.JestFuzzTestOptions);
		newPriority = OptionSource.JestFuzzTestOptions;
	} catch (e) {
		/**/
	}

	options.merge({ [key]: newValue }, newPriority);
	const newReference = options.get(key);
	if (!(newReference instanceof Array) || newReference.length < 1) {
		throw new Error("Array should have at least 1 elements.");
	}
	const newStoredValue = OptionsManager.copyOptionValue(newReference);

	// after merge, value of the option should equal to the newValue, and not equal to the old one
	expect(options.get(key)).toStrictEqual(newValue);
	expect(options.get(key)).not.toStrictEqual(originalValue);
	// also the reference should be different
	expect(options.get(key)).not.toStrictEqual(originalReference);

	// mutate newValue and check that the new value of option is not changed
	newValue[0] = v0;
	expect(options.get(key)).toStrictEqual(newStoredValue);

	// mutate the option, and check that newValue is not changed
	newReference[0] = v1;
	expect(newValue[0]).toStrictEqual(v0);
	// @ts-ignore
	expect(options.get(key)[0]).toStrictEqual(v1);
	return options;
}
