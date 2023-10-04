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
import fs from "fs";

import tmp from "tmp";

import { addDictionary, useDictionaryByParams } from "./dictionary";

// Cleanup created files on exit
tmp.setGracefulCleanup();

describe("Dictionary", () => {
	beforeEach(() => {
		globalThis.JazzerJS = new Map<string, unknown>();
	});

	it("use explicit dictionary", () => {
		const content = `
# comment
"01234567890-Test"
`;
		const filename = writeDict(content);

		const params = useDictionaryByParams([`-dict=${filename}`]);

		const tempDictionary = params[params.length - 1].substring(6);
		expect(tempDictionary).not.toMatch(`^-dict=${filename}$`);
		const tempDictionaryContent = fs.readFileSync(tempDictionary).toString();
		expect(tempDictionaryContent).toMatch(content);
	});

	it("combine two explicit dictionaries", () => {
		const content1 = `
# comment 1
"01234567890-Test"
`;
		const filename1 = writeDict(content1);
		const content2 = `
# comment 2
"abcdef-Test"
`;
		const filename2 = writeDict(content2);

		const params = useDictionaryByParams([
			`-dict=${filename1}`,
			`-dict=${filename2}`,
		]);

		const tempDictionary = params[params.length - 1].substring(6);
		const tempDictionaryContent = fs.readFileSync(tempDictionary).toString();
		expect(tempDictionaryContent).toContain(content1);
		expect(tempDictionaryContent).toContain(content2);
	});

	it("combines explicit dictionary with programmatic one", () => {
		const content = `
# comment
"01234567890-Test"
`;
		const filename = writeDict(content);
		const dictLines = ["abcdef-Test", "ghijkl-Test"];

		addDictionary(...dictLines);
		const params = useDictionaryByParams([`-dict=${filename}`]);

		const tempDictionary = params[params.length - 1].substring(6);
		const tempDictionaryContent = fs.readFileSync(tempDictionary).toString();
		expect(tempDictionaryContent).toContain(content);
		expect(tempDictionaryContent).toContain(dictLines[0]);
		expect(tempDictionaryContent).toContain(dictLines[1]);
	});
});

function writeDict(content: string) {
	const dict = tmp.fileSync({
		mode: 0o700,
		prefix: "jazzer.js-test",
		postfix: "dict",
	});
	fs.writeFileSync(dict.name, content);
	return dict.name;
}
