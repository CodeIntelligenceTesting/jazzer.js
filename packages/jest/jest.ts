/* eslint-disable @typescript-eslint/ban-ts-comment */

import { Global } from "@jest/types";
import * as core from "@jazzer.js/core";
import { FuzzFn } from "@jazzer.js/fuzzer";
import { loadConfig } from "@jazzer.js/jest-runner";

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
		const testFn: Global.TestCallback = () => {
			const config = loadConfig();
			const fuzzerOptions = core.addFuzzerOptionsForDryRun(
				config.fuzzerOptions,
				config.dryRun
			);
			return core.startFuzzingAsyncNoInit(fuzzTest, fuzzerOptions);
		};
		g.test(title, testFn, timeout);
	};

	return { test };
};

const g = globalThis as unknown as Global;
const fuzz = install(g);

// @ts-ignore
g.it.fuzz = fuzz.test;
// @ts-ignore
g.test.fuzz = fuzz.test;

export { fuzz };
