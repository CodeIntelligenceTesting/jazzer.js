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

import * as fs from "fs";
import * as path from "path";

import * as tmp from "tmp";
import ts from "typescript";

import { fuzzer } from "@jazzer.js/fuzzer";

import { Instrumentor } from "./instrument";
import { SourceMap } from "./SourceMapRegistry";

jest.mock("@jazzer.js/fuzzer");

tmp.setGracefulCleanup();

describe("PC location source map remapping", () => {
	const registerPCLocationsMock = jest.mocked(
		fuzzer.coverageTracker.registerPCLocations,
	);

	beforeEach(() => {
		registerPCLocationsMock.mockClear();
	});

	it("maps CJS edge locations to TypeScript files", () => {
		const sourceFile = path.join(process.cwd(), "src", "target.ts");
		const generatedFile = path.join(process.cwd(), "dist", "target.js");

		const transpiled = transpile(
			[
				"interface Marker {",
				"  value: number;",
				"}",
				"",
				"class Parser {",
				"  makeFilter(stream: string, maybeLength: number) {",
				"    if (maybeLength === 0) return stream;",
				"    return stream + 'x';",
				"  }",
				"}",
				"",
				"export function run(x: number) {",
				"  if (x > 1) return x;",
				"  return 0;",
				"}",
			].join("\n"),
			sourceFile,
			path.join(process.cwd(), "src"),
			path.join(process.cwd(), "dist"),
		);

		const instrumentor = new Instrumentor();
		instrumentor.instrument(transpiled.code, generatedFile, transpiled.map);

		expect(registerPCLocationsMock).toHaveBeenCalled();

		const tsCall = registerPCLocationsMock.mock.calls.find(([filename]) =>
			String(filename).endsWith(path.join("src", "target.ts")),
		);
		expect(tsCall).toBeDefined();

		if (!tsCall) {
			return;
		}

		const [, funcNames, entries, pcBase] = tsCall;
		expect(pcBase).toBe(0);
		expect(entries.length % 5).toBe(0);

		const tuples = toTuples(entries);
		expect(
			tuples.some(
				([, line, , funcIdx, isFuncEntry]) =>
					isFuncEntry === 1 &&
					funcNames[funcIdx] === "Parser.makeFilter" &&
					line === 6,
			),
		).toBe(true);
	});

	it("loads external source map files for CJS symbolization", () => {
		const dir = tmp.dirSync({ unsafeCleanup: true });
		const srcDir = path.join(dir.name, "src");
		const distDir = path.join(dir.name, "dist");
		fs.mkdirSync(srcDir, { recursive: true });
		fs.mkdirSync(distDir, { recursive: true });

		const sourceFile = path.join(srcDir, "target.ts");
		const generatedFile = path.join(distDir, "target.js");

		const transpiled = transpile(
			[
				"export class Parser {",
				"  makeFilter(stream: string, maybeLength: number) {",
				"    if (maybeLength === 0) return stream;",
				"    return stream + 'x';",
				"  }",
				"}",
			].join("\n"),
			sourceFile,
			srcDir,
			distDir,
		);

		const sourceMapPath = path.join(distDir, "target.js.map");
		fs.writeFileSync(sourceMapPath, JSON.stringify(transpiled.map));

		const instrumentor = new Instrumentor();
		instrumentor.instrument(transpiled.code, generatedFile);

		expect(registerPCLocationsMock).toHaveBeenCalled();
		expect(
			registerPCLocationsMock.mock.calls.some(([filename]) =>
				String(filename).endsWith(path.join("src", "target.ts")),
			),
		).toBe(true);
	});

	it("keeps generated JS locations when TypeScript mappings are missing", () => {
		const sourceFile = path.join(process.cwd(), "src", "downlevel.ts");
		const generatedFile = path.join(process.cwd(), "dist", "downlevel.js");

		const transpiled = transpile(
			[
				"class Base { value = 1; }",
				"class Child extends Base {",
				"  method(x: number) {",
				"    if (x > 0) return this.value + x;",
				"    return x;",
				"  }",
				"}",
				"export const run = (n: number) => new Child().method(n);",
			].join("\n"),
			sourceFile,
			path.join(process.cwd(), "src"),
			path.join(process.cwd(), "dist"),
			ts.ScriptTarget.ES5,
		);

		const instrumentor = new Instrumentor();
		instrumentor.instrument(transpiled.code, generatedFile, transpiled.map);

		const filenames = registerPCLocationsMock.mock.calls.map(([filename]) =>
			String(filename),
		);
		expect(
			filenames.some((filename) =>
				filename.endsWith(path.join("src", "downlevel.ts")),
			),
		).toBe(true);
		expect(
			filenames.some((filename) =>
				filename.endsWith(path.join("dist", "downlevel.js")),
			),
		).toBe(true);

		const totalRegisteredEntries = registerPCLocationsMock.mock.calls.reduce(
			(total, [, , entries]) => total + entries.length / 5,
			0,
		);
		expect(totalRegisteredEntries).toBeGreaterThan(0);
	});
});

function transpile(
	code: string,
	sourceFile: string,
	rootDir: string,
	outDir: string,
	target: ts.ScriptTarget = ts.ScriptTarget.ES2018,
): { code: string; map: SourceMap } {
	const transpiled = ts.transpileModule(code, {
		compilerOptions: {
			target,
			module: ts.ModuleKind.CommonJS,
			sourceMap: true,
			inlineSources: true,
			rootDir,
			outDir,
		},
		fileName: sourceFile,
	});

	if (!transpiled.sourceMapText) {
		throw new Error(
			"Expected TypeScript transpilation to produce a source map",
		);
	}

	return {
		code: transpiled.outputText,
		map: JSON.parse(transpiled.sourceMapText),
	};
}

function toTuples(entries: Int32Array): number[][] {
	const tuples: number[][] = [];
	for (let i = 0; i + 4 < entries.length; i += 5) {
		tuples.push([
			entries[i],
			entries[i + 1],
			entries[i + 2],
			entries[i + 3],
			entries[i + 4],
		]);
	}
	return tuples;
}
