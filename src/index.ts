#!/usr/bin/env node
import yargs, { Argv } from "yargs";
import path from "path";
import { instrument } from "./instrument/instrument";

yargs(process.argv.slice(2))
	.scriptName("fuzzyEagle")
	.command(
		"$0 <target> [corpus]",
		"fuzz you",
		(args: Argv) => {
			return args
				.positional("target", { describe: "fuzz target", type: "string" })
				.positional("corpus", { describe: "corpus", type: "string" });
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(args: any) => {
			instrument(path.join(process.cwd(), args.target));
		}
	)
	.help().argv;
