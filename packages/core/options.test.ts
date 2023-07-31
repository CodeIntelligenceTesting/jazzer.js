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

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
	defaultOptions,
	fromSnakeCase,
	fromSnakeCaseWithPrefix,
	Options,
	processOptions,
} from "./options";

describe("options", () => {
	describe("processOptions", () => {
		it("use default options if none given", () => {
			expect(processOptions({})).toEqual(defaultOptions);
			expect(processOptions(undefined as any)).toEqual(defaultOptions);
			expect(processOptions(null as any)).toEqual(defaultOptions);
			expect(processOptions("" as any)).toEqual(defaultOptions);
			expect(processOptions(false as any)).toEqual(defaultOptions);
		});
		it("prefer environment variables to defaults", () => {
			withEnv("JAZZER_FUZZ_TARGET", "FOO", () => {
				withEnv("JAZZER_INCLUDES", '["BAR", "BAZ"]', () => {
					const options = processOptions({});
					expect(options).toHaveProperty("fuzzTarget", "FOO");
					expect(options).toHaveProperty("includes", ["BAR", "BAZ"]);
					expectDefaultsExceptKeys(options, "fuzzTarget", "includes");
				});
			});
		});
		it("prefer given values to defaults and environment variables", () => {
			withEnv("JAZZER_FUZZ_TARGET", "bar", () => {
				const options = processOptions({ fuzzTarget: "foo" });
				expect(options).toHaveProperty("fuzzTarget", "foo");
				expectDefaultsExceptKeys(options, "fuzzTarget");
			});
		});
		it("includes and excludes are set together", () => {
			expect(processOptions({ includes: ["foo"] })).toHaveProperty(
				"excludes",
				[],
			);
			expect(processOptions({ excludes: ["foo"] })).toHaveProperty(
				"includes",
				[],
			);
		});
		it("error on unknown option", () => {
			const inputs = { unknownOption: "foo" };
			expect(() => processOptions(inputs as any)).toThrow("'unknownOption'");
		});
		it("error on mismatching type", () => {
			expect(() => processOptions({ fuzzTarget: false } as any)).toThrow(
				"expected type 'string'",
			);
		});
		it("does not use parts of input", () => {
			const input = { includes: ["foo"] };
			const options = processOptions(input);
			input.includes.push("bar");
			expect(options.includes).not.toContain("bar");
		});
		it("lookup keys with transformer function", () => {
			const options = processOptions(
				{ fuzz_target: "foo" } as any,
				fromSnakeCase,
			);
			expect(options).toHaveProperty("fuzzTarget", "foo");
		});
		it("set debug env variable", () => {
			withEnv("JAZZER_DEBUG", "", () => {
				processOptions({ verbose: true });
				expect(process.env.JAZZER_DEBUG).toEqual("1");
			});
			withEnv("JAZZER_DEBUG", "", () => {
				withEnv("DEBUG", "1", () => {
					processOptions({ verbose: true });
					expect(process.env.JAZZER_DEBUG).toEqual("1");
				});
			});
		});
		it("does not merge __proto__", () => {
			expect(() => {
				processOptions(JSON.parse('{"__proto__": {"polluted": 42}}') as any);
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
