import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import headers from "eslint-plugin-headers";
import importX from "eslint-plugin-import-x";
import jest from "eslint-plugin-jest";
import markdownlint from "eslint-plugin-markdownlint";
import markdownlintParser from "eslint-plugin-markdownlint/parser.js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	// Global ignores (replaces .eslintignore)
	{
		ignores: [
			"**/dist/",
			"**/build/",
			"**/cmake-build-*/",
			"**/coverage/",
			"**/node_modules/",
			"**/.idea/",
		],
	},

	// Base config for all JS/TS files
	js.configs.recommended,
	...tseslint.configs.recommended,
	eslintConfigPrettier,
	importX.flatConfigs.recommended,
	importX.flatConfigs.typescript,

	// Global settings for JS/TS files
	{
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
		settings: {
			"import-x/resolver": {
				typescript: true,
				node: true,
			},
		},
		rules: {
			"import-x/no-named-as-default": "off",
			"import-x/no-named-as-default-member": "off",
		},
	},

	// JS/TS specific rules (replaces the *.js, *.ts override)
	{
		files: ["**/*.js", "**/*.ts"],
		plugins: {
			headers,
		},
		rules: {
			"@typescript-eslint/ban-ts-comment": "off",
			"@typescript-eslint/no-require-imports": "off",
			"@typescript-eslint/no-unused-expressions": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"headers/header-format": [
				"error",
				{
					source: "string",
					blockPrefix: "\n",
					content:
						'Copyright 2026 Code Intelligence GmbH\n\nLicensed under the Apache License, Version 2.0 (the "License");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\n     http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software\ndistributed under the License is distributed on an "AS IS" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\nSee the License for the specific language governing permissions and\nlimitations under the License.',
				},
			],
			"import-x/first": "error",
			"import-x/newline-after-import": "error",
			"import-x/no-unresolved": "warn",
			"import-x/order": [
				"error",
				{
					alphabetize: { order: "asc", caseInsensitive: true },
					"newlines-between": "always",
					distinctGroup: true,
					pathGroupsExcludedImportTypes: ["builtin"],
					pathGroups: [
						{
							pattern: "@jazzer.js/**",
							group: "external",
							position: "after",
						},
					],
				},
			],
			"sort-imports": [
				"error",
				{
					ignoreCase: true,
					ignoreDeclarationSort: true,
				},
			],
		},
	},

	// Exclude header check from the header template file itself
	{
		files: [".header.js"],
		rules: {
			"headers/header-format": "off",
		},
	},

	// Disable unresolved import warnings for examples/tests with their own deps
	{
		files: ["examples/**", "tests/**"],
		rules: {
			"import-x/no-unresolved": "off",
		},
	},

	// Jest globals for test and fuzz files
	{
		files: ["**/*.test.ts", "**/*.test.js", "**/*.fuzz.ts", "**/*.fuzz.js"],
		plugins: {
			jest,
		},
		languageOptions: {
			globals: {
				...globals.jest,
			},
		},
	},

	// Markdown files
	{
		files: ["**/*.md"],
		plugins: {
			markdownlint,
		},
		languageOptions: {
			parser: markdownlintParser,
		},
		rules: {
			...markdownlint.configs.recommended.rules,
			"markdownlint/md010": "off",
			"markdownlint/md013": "off",
			"markdownlint/md033": "off",
			"markdownlint/md041": "off",
		},
	},
);
