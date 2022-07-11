import { default as bind } from "bindings";

const addon = bind("fuzzy-eagle");

export type FuzzFn = (data: Uint8Array) => void;
export type FuzzOpts = string[];

// Re-export everything from the native library.
export const Fuzzer = {
	startFuzzing: addon.startFuzzing as (
		fuzzFn: FuzzFn,
		fuzzOpts: FuzzOpts
	) => void,
	printVersion: addon.printVersion as () => void,
};
