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

import {
	defaultCLIOptions,
	defaultJestOptions,
	fromSnakeCase,
	fromSnakeCaseWithPrefix,
	Mode,
	Options,
	OptionsManager,
	OptionSource,
	resolveEngine,
	resolveMode,
	validateKeySource,
} from "./index";

describe("options", () => {
	describe("OptionsManager", () => {
		it("mergeInPlace: options of type string[] are copied", () => {
			const input = ["1", "2", "3"];
			const v0 = "CHANGED";
			const v1 = "CHANGED AGAIN";

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
		it("keeps libFuzzer as default CLI engine", () => {
			expect(defaultCLIOptions.engine).toBe("libfuzzer");
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
			expect(Object.keys(options).length).toEqual(2);
		});
	});

	describe("processOptions", () => {
		it("contains explicit common and backend engine options by default", () => {
			expect(defaultCLIOptions).toMatchObject({
				artifactPrefix: "",
				corpusDirectories: [],
				dictionaryFiles: [],
				libAflOptions: [],
				libFuzzerOptions: [],
				maxLen: 4096,
				maxTotalTime: 0,
				runs: 0,
				seed: 0,
			});
		});

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
					withEnv("JAZZER_MAX_LEN", "1337", () => {
						withSource(
							OptionSource.DefaultJestOptions,
							{ fuzzTarget: "QUX" },
							OptionSource.ConfigurationFile,
							(options) => {
								expect(options).toHaveProperty("fuzzTarget", "FOO");
								expect(options).toHaveProperty("includes", ["BAR", "BAZ"]);
								expect(options).toHaveProperty("maxLen", 1337);
								expectDefaultsExceptKeys(
									options,
									OptionSource.DefaultJestOptions,
									"fuzzTarget",
									"includes",
									"maxLen",
								);
							},
						);
					});
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
					() => undefined,
				);
			}).toThrow("unknown_option");
		});
		it("error on mismatching type", () => {
			expect(() => {
				withSource(
					OptionSource.DefaultCLIOptions,
					{ fuzzTarget: false },
					OptionSource.CommandLineArguments,
					() => undefined,
				);
			}).toThrow("expected type 'string'");
		});
		it("rejects invalid mode values during option merge", () => {
			expect(() => {
				withSource(
					OptionSource.DefaultCLIOptions,
					{ mode: "nonsense" },
					OptionSource.CommandLineArguments,
					() => undefined,
				);
			}).toThrow("Unknown fuzzer mode");
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
					() => {
						expect(process.env.JAZZER_DEBUG).toEqual("1");
					},
				);
			});
		});
		it("does not merge __proto__", () => {
			expect(() => {
				withSource(
					OptionSource.DefaultCLIOptions,
					JSON.parse('{"__proto__": {"polluted": 42}}'),
					OptionSource.CommandLineArguments,
					() => undefined,
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

describe("engine and mode", () => {
	it("normalizes engine aliases", () => {
		expect(resolveEngine("libfuzzer")).toBe("libfuzzer");
		expect(resolveEngine("afl")).toBe("libafl");
		expect(resolveEngine("libafl")).toBe("libafl");
		expect(() => resolveEngine("unknown")).toThrow("Unknown fuzzing engine");
	});

	it("normalizes fuzzing modes", () => {
		expect(resolveMode("fuzzing")).toBe(Mode.Fuzzing);
		expect(resolveMode("regression")).toBe(Mode.Regression);
		expect(() => resolveMode("unknown")).toThrow("Unknown fuzzer mode");
	});

	it("canonicalizes engine aliases during option merge", () => {
		const manager = new OptionsManager(OptionSource.DefaultJestOptions).merge(
			{ engine: "afl" },
			OptionSource.ConfigurationFile,
		);

		expect(manager.get("engine")).toBe("libafl");
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
	} catch {
		/**/
	}

	options.merge({ [key]: newValue }, newPriority);
	const newReference = options.get(key);
	if (!(newReference instanceof Array) || newReference.length < 1) {
		throw new Error("Array should have at least 1 elements.");
	}
	const newStoredValue = OptionsManager.copyOptionValue(newReference);

	expect(options.get(key)).toStrictEqual(newValue);
	expect(options.get(key)).not.toStrictEqual(originalValue);
	expect(options.get(key)).not.toStrictEqual(originalReference);

	newValue[0] = v0;
	expect(options.get(key)).toStrictEqual(newStoredValue);

	newReference[0] = v1;
	expect(newValue[0]).toStrictEqual(v0);
	// @ts-ignore
	expect(options.get(key)[0]).toStrictEqual(v1);
	return options;
}
