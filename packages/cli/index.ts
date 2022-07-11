#!/usr/bin/env node

import yargs, { Argv } from "yargs";
import * as path from "path";
import { instrument, InstrumentationOptions } from "../instrumentor/instrument";

yargs(process.argv.slice(2))
	.scriptName("fuzzyEagle")
	// parse unknown options as args to include them in fuzzerOptions array
	.parserConfiguration({ "unknown-options-as-args": true })
	.command(
		"$0 <target> <corpus> [fuzzerOptions..]",
		"Coverage-guided, in-process fuzzer for the Node.js platform.",
		(yargs: Argv) => {
			yargs
				.positional("fuzzFunction", {
					describe: "Name of the function to fuzz",
					type: "string",
				})
				.positional("target", { describe: "Fuzz target name", type: "string" })
				.positional("corpus", { describe: "Corpus directory", type: "string" })
				.option("includes", {
					describe: "Part of filepath to include in instrumentation",
					type: "string",
				})
				.option("excludes", {
					describe: "Part of filepath to exclude from instrumentation",
					type: "string",
				})
				.positional("fuzzerOptions", {
					describe: "Flags to pass to the fuzzing engine (libfuzzer)",
					type: "string",
				})
				.default("fuzzFunction", "fuzz")
				.hide("fuzzFunction")
				.default("excludes", ["node_modules"])
				.default("includes", ["*"])
				.demandOption(["target", "corpus"]);
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(args: any) => {
			const options: InstrumentationOptions = {
				fuzzFunction: args.fuzzFunction,
				includes: args.includes.map((include: string) =>
					include === "*" ? "" : include
				),
				excludes: args.excludes.map((exclude: string) =>
					exclude === "*" ? "" : exclude
				),
				fuzzerOptions: args.fuzzerOptions.filter((o: string) =>
					o.startsWith("--")
				),
			};
			instrument(path.join(process.cwd(), args.target), options);
		}
	)
	.help().argv;
