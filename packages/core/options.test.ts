/*
 * Copyright 2023 Code Intelligence GmbH
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
	buildOptions,
	defaultOptions,
	fromSnakeCase,
	fromSnakeCaseWithPrefix,
	Options,
	ParameterResolverIndex,
	setParameterResolverValue,
	spawnsSubprocess,
} from "./options";

const commandLineArguments = ParameterResolverIndex.CommandLineArguments;
const configurationFile = ParameterResolverIndex.ConfigurationFile;

describe("options", () => {
	describe("processOptions", () => {
		it("use default options if none given", () => {
			expect(buildOptions()).toEqual(defaultOptions);
		});
		it("prefer configuration file values to defaults", () => {
			withResolverValue(configurationFile, { fuzzTarget: "FOO" }, () => {
				const options = buildOptions();
				expect(options).toHaveProperty("fuzzTarget", "FOO");
				expectDefaultsExceptKeys(options, "fuzzTarget");
			});
		});
		it("prefer environment variables to configuration file values", () => {
			withResolverValue(configurationFile, { fuzzTarget: "QUX" }, () => {
				withEnv("JAZZER_FUZZ_TARGET", "FOO", () => {
					withEnv("JAZZER_INCLUDES", '["BAR", "BAZ"]', () => {
						const options = buildOptions();
						expect(options).toHaveProperty("fuzzTarget", "FOO");
						expect(options).toHaveProperty("includes", ["BAR", "BAZ"]);
						expectDefaultsExceptKeys(options, "fuzzTarget", "includes");
					});
				});
			});
		});
		it("prefer CLI parameters to environment variables", () => {
			withEnv("JAZZER_FUZZ_TARGET", "bar", () => {
				withResolverValue(commandLineArguments, { fuzz_target: "foo" }, () => {
					const options = buildOptions();
					expect(options).toHaveProperty("fuzzTarget", "foo");
					expectDefaultsExceptKeys(options, "fuzzTarget");
				});
			});
		});
		it("includes and excludes are set together", () => {
			withResolverValue(commandLineArguments, { includes: ["foo"] }, () => {
				expect(buildOptions()).toHaveProperty("excludes", []);
			});
			withResolverValue(commandLineArguments, { excludes: ["foo"] }, () => {
				expect(buildOptions()).toHaveProperty("includes", []);
			});
		});
		it("error on unknown option", () => {
			withResolverValue(commandLineArguments, { unknown_option: "foo" }, () => {
				expect(() => buildOptions()).toThrow("'unknown_option'");
			});
		});
		it("error on mismatching type", () => {
			withResolverValue(commandLineArguments, { fuzz_target: false }, () => {
				expect(() => buildOptions()).toThrow("expected type 'string'");
			});
		});
		it("does not use parts of input", () => {
			const input = { includes: ["foo"] };
			withResolverValue(commandLineArguments, input, () => {
				const options = buildOptions();
				input.includes.push("bar");
				expect(options.includes).not.toContain("bar");
			});
		});
		it("set debug env variable", () => {
			withEnv("JAZZER_DEBUG", "", () => {
				withResolverValue(commandLineArguments, { verbose: true }, () => {
					buildOptions();
					expect(process.env.JAZZER_DEBUG).toEqual("1");
				});
			});
			withEnv("JAZZER_DEBUG", "", () => {
				withEnv("DEBUG", "1", () => {
					buildOptions();
					expect(process.env.JAZZER_DEBUG).toEqual("1");
				});
			});
		});
		it("does not merge __proto__", () => {
			expect(() => {
				withResolverValue(
					commandLineArguments,
					JSON.parse('{"__proto__": {"polluted": 42}}'),
					() => {
						buildOptions();
					},
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

function expectDefaultsExceptKeys(options: Options, ...ignore: string[]) {
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

function withResolverValue(
	index: ParameterResolverIndex,
	args: object,
	fn: () => void,
) {
	try {
		setParameterResolverValue(index, args);
		fn();
	} finally {
		setParameterResolverValue(index, {});
	}
}
