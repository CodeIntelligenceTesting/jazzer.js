#!/usr/bin/env node
/*
 * Copyright 2022 Code Intelligence GmbH
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

import yargs, { Argv } from "yargs";
import { startFuzzing, ensureFilepath } from "./core";

yargs(process.argv.slice(2))
	.scriptName("jazzer")
	.parserConfiguration({
		"camel-case-expansion": false,
		"strip-aliased": true,
		"strip-dashed": true,
		"greedy-arrays": false,
	})
	.example(
		"$0 package/target -i packages/foo -i packages/bar",
		'Start a fuzzing run using the "fuzz" function exported by "target" ' +
			'and only instrument code in the "packages/a" and "packages/b" modules.',
	)
	.example(
		"$0 package/target corpus -- -max_total_time=60",
		'Start a fuzzing run using the "fuzz" function exported by "target" ' +
			'and use the directory "corpus" to store newly generated inputs. ' +
			'Also pass the "-max_total_time" flag to the internal fuzzing engine ' +
			"(libFuzzer) to stop the fuzzing run after 60 seconds.",
	)
	.command(
		"$0 <target> [corpus..]",
		"Coverage-guided, in-process fuzzer for the Node.js platform. \n\n" +
			'The "target" module has to export a function "fuzz" which accepts ' +
			"a byte array as first parameter and uses that to invoke the actual " +
			"function to fuzz.\n\n" +
			'The "corpus" directory is optional and can be used to provide initial ' +
			"seed input. It is also used to store interesting inputs between fuzzing " +
			"runs.\n\n" +
			"To pass options to the internal fuzzing engine (libFuzzer) use a " +
			'double-dash, "--", to mark the end of the normal fuzzer arguments. ' +
			"An example is shown in the examples section of this help message.",
		(yargs: Argv) => {
			yargs
				.positional("target", {
					describe: "Name of the module that exports the fuzz target function.",
					type: "string",
				})
				.demandOption("target")

				.array("corpus")
				.positional("corpus", {
					describe:
						"Paths to the corpus directories. If not given, no initial " +
						"seeds are used nor interesting inputs saved.",
					type: "string",
				})

				.option("fuzz_function", {
					describe:
						"Name of the fuzz test entry point. It must be an exported " +
						"function with a single Buffer parameter",
					alias: "f",
					type: "string",
					default: "fuzz",
					group: "Fuzzer:",
				})

				.option("id_sync_file", {
					describe:
						"File used to sync edge ID generation. " +
						"Needed when fuzzing in multi-process modes",
					type: "string",
					default: undefined,
					group: "Fuzzer:",
				})
				.hide("id_sync_file")

				.option("sync", {
					describe: "Run the fuzz target synchronously.",
					type: "boolean",
					default: false,
					group: "Fuzzer:",
				})
				.array("instrumentation_includes")
				.option("instrumentation_includes", {
					describe:
						"Part of filepath names to include in the instrumentation. " +
						'A tailing "/" should be used to include directories and prevent ' +
						'confusion with filenames. "*" can be used to include all files.\n' +
						"Can be specified multiple times. By default all files will be " +
						"included.",
					type: "string",
					alias: "i",
					group: "Fuzzer:",
				})

				.array("instrumentation_excludes")
				.option("instrumentation_excludes", {
					describe:
						"Part of filepath names to exclude in the instrumentation. " +
						'A tailing "/" should be used to exclude directories and prevent ' +
						'confusion with filenames. "*" can be used to exclude all files.\n' +
						'Can be specified multiple times. By default, "node_modules/" will ' +
						"be excluded.",
					type: "string",
					alias: "e",
					group: "Fuzzer:",
				})
				.option("dry_run", {
					describe:
						"Perform a dry run with the fuzzing instrumentation disabled. " +
						"A dry run only executes the fuzz test with the inputs from the " +
						"corpus and returns directly. That is, no fuzzing is performed. " +
						"This option can then be used when reporting code coverage for " +
						"a fuzz test",
					type: "boolean",
					alias: "d",
					group: "Fuzzer:",
					default: false,
				})
				.array("custom_hooks")
				.option("custom_hooks", {
					describe:
						"Allow users to hook functions. This can be used for writing " +
						"bug detectors, for stubbing, and for writing feedback functions " +
						"for the fuzzer.",
					type: "string",
					alias: "h",
					group: "Fuzzer:",
					default: [],
				})
				.array("expected_errors")
				.option("expected_errors", {
					describe:
						"Expected errors can be specified as the class name of the " +
						"thrown error object or value of a thrown string. If expected " +
						"errors are defined, but none, or none of the expected ones are " +
						"raised during execution, the test execution fails." +
						'Examples: -x Error -x "My thrown error string"',
					type: "string",
					alias: "x",
					group: "Fuzzer:",
					default: [],
				})
				.hide("expected_errors")
				.boolean("verbose")
				.option("verbose", {
					describe: "Enable verbose debugging logs.",
					type: "boolean",
					alias: "v",
					group: "Fuzzer:",
					default: false,
				})
				.boolean("cov")
				.option("cov", {
					describe: "Enable code coverage.",
					alias: "coverage",
					type: "boolean",
					group: "Fuzzer:",
					default: false,
				})
				.option("cov_dir", {
					describe: "Directory for storing coverage reports.",
					alias: "coverage_directory",
					type: "string",
					default: "coverage",
					group: "Fuzzer:",
				})
				.array("cov_reporters")
				.option("cov_reporters", {
					describe: "A list of reporter names for writing coverage reports.",
					alias: "coverage_reporters",
					type: "string",
					group: "Fuzzer:",
					default: ["json", "text", "lcov", "clover"],
				})
				.option("timeout", {
					describe: "Timeout in milliseconds for each fuzz test execution.",
					type: "number",
					group: "Fuzzer:",
					default: 5000,
				})
				.array("disable_bug_detectors")
				.option("disable_bug_detectors", {
					describe:
						"A list of patterns to disable internal bug detectors. By default all internal " +
						"bug detectors are enabled. To disable all, use the '.*' pattern." +
						"Following bug detectors are available: " +
						"    command-injection\n" +
						"    path-traversal\n",
					type: "string",
					group: "Fuzzer:",
					default: [],
				});
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(args: any) => {
			if (args.verbose) {
				process.env.JAZZER_DEBUG = "1";
			}
			// noinspection JSIgnoredPromiseFromCall
			startFuzzing({
				fuzzTarget: ensureFilepath(args.target),
				fuzzEntryPoint: args.fuzz_function,
				includes: args.instrumentation_includes,
				excludes: args.instrumentation_excludes,
				dryRun: args.dry_run,
				sync: args.sync,
				timeout: args.timeout,
				fuzzerOptions: args.corpus.concat(args._),
				customHooks: args.custom_hooks,
				expectedErrors: args.expected_errors,
				idSyncFile: args.id_sync_file,
				coverage: args.cov,
				coverageDirectory: args.cov_dir,
				coverageReporters: args.cov_reporters,
				disableBugDetectors: args.disable_bug_detectors,
			});
		},
	)
	.help().argv;
