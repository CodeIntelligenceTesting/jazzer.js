/* eslint-disable @typescript-eslint/ban-ts-comment */

import { Global } from "@jest/types";
import * as core from "@jazzer.js/core";
import { FuzzFn } from "@jazzer.js/fuzzer";
import * as circus from "jest-circus";
import * as fs from "fs";
import * as path from "path";
import { loadConfig } from "./config";

// Use jests global object definition
type Global = Global.Global;

// Define own types for Jest integration
// TODO: Inject these types into Global to allow IDE completion
export type FuzzData = Buffer;

type FuzzTargetFn = (
	fuzzData: FuzzData,
	done?: Global.DoneFn
) => Global.TestReturnValue;

export type FuzzTest = (
	name: string | Global.NameLike,
	fn: FuzzFn,
	timeout?: number
) => void;

const install = (g: Global) => {
	const test: FuzzTest = (title, fuzzTest, timeout) => {
		const fuzzingConfig = loadConfig();
		const fuzzerOptions = core.addFuzzerOptionsForDryRun(
			fuzzingConfig.fuzzerOptions,
			fuzzingConfig.dryRun
		);
		const inputDir = inputsDirectory(title as string, fuzzingConfig);
		fs.mkdirSync(inputDir, { recursive: true });

		if (fuzzingConfig.dryRun) {
			const files = fs.readdirSync(inputDir);

			g.describe(title, () => {
				for (const file of files) {
					const runOptions = fuzzerOptions.concat(path.join(inputDir, file));
					const testFn: Global.TestCallback = () => {
						return core.startFuzzingNoInit(fuzzTest, runOptions);
					};
					g.test(file, testFn, timeout);
				}
			});
		} else {
			fuzzerOptions.unshift(inputDir);
			fuzzerOptions.push("-artifact_prefix=" + inputDir + path.sep);
			console.log(fuzzerOptions);
			const testFn: Global.TestCallback = () => {
				return core.startFuzzingNoInit(fuzzTest, fuzzerOptions);
			};
			g.test(title, testFn, timeout);
		}
	};

	return { test };
};

function inputsDirectory(test: string, options: core.Options): string {
	const root = path.parse(options.fuzzTarget);
	const testElements = fullPathElements(test);
	return path.join(root.root, root.dir, root.name, ...testElements);
}

function fullPathElements(test: string): string[] {
	const elements = [test];
	let describeBlock = circus.getState().currentDescribeBlock;
	while (describeBlock !== circus.getState().rootDescribeBlock) {
		elements.unshift(describeBlock.name);
		if (describeBlock.parent) {
			describeBlock = describeBlock.parent;
		}
	}
	return elements.map((s) => replaceSpacesWithUnderscore(s));
}

function replaceSpacesWithUnderscore(s: string): string {
	return s.replace(/ /g, "_");
}

export function registerFuzzExtension() {
	const g = globalThis as unknown as Global;
	const fuzz = install(g);

	// @ts-ignore
	g.it.fuzz = fuzz.test;
	// @ts-ignore
	g.test.fuzz = fuzz.test;
}
