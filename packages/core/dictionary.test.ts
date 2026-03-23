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
import fs from "fs";

import tmp from "tmp";

import {
	addDictionary,
	convertDictionaryEntry,
	toEscapedString,
	useDictionaryByParams,
} from "./dictionary";

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

describe("Dictionary with custom entries", () => {
	beforeEach(() => {
		globalThis.JazzerJS = new Map<string, unknown>();
	});

	it("toEscapedHexString Uint8Array", () => {
		expect(toEscapedString(new Uint8Array([0, 1, 32, 65, 109, 97]))).toBe(
			'"\\x00\\x01\\x20\\x41\\x6d\\x61"',
		);
	});

	it("convertDictionaryEntry", () => {
		expect(convertDictionaryEntry("foo")).toBe('"\\x66\\x6f\\x6f"');
		expect(convertDictionaryEntry("\\")).toBe('"\\x5c"');
		expect(convertDictionaryEntry('\\"')).toBe('"\\x5c\\x22"');
		expect(convertDictionaryEntry('f"o\\o\tbar')).toBe(
			'"\\x66\\x22\\x6f\\x5c\\x6f\\x09\\x62\\x61\\x72"',
		);
		expect(convertDictionaryEntry("\u0012\u001A")).toBe('"\\x12\\x1a"');
		expect(convertDictionaryEntry("✂\uD83D\uDCCB")).toBe(
			'"\\xe2\\x9c\\x82\\xf0\\x9f\\x93\\x8b"',
		);
		expect(
			convertDictionaryEntry(new Uint8Array([0, 1, 32, 65, 109, 98])),
		).toBe('"\\x00\\x01\\x20\\x41\\x6d\\x62"');

		expect(convertDictionaryEntry(new Uint8Array([...Array(256).keys()]))).toBe(
			'"\\x00\\x01\\x02\\x03\\x04\\x05\\x06\\x07\\x08\\x09\\x0a\\x0b\\x0c\\x0d\\x0e\\x0f' +
				"\\x10\\x11\\x12\\x13\\x14\\x15\\x16\\x17\\x18\\x19\\x1a\\x1b\\x1c\\x1d\\x1e\\x1f" +
				"\\x20\\x21\\x22\\x23\\x24\\x25\\x26\\x27\\x28\\x29\\x2a\\x2b\\x2c\\x2d\\x2e\\x2f" +
				"\\x30\\x31\\x32\\x33\\x34\\x35\\x36\\x37\\x38\\x39\\x3a\\x3b\\x3c\\x3d\\x3e\\x3f" +
				"\\x40\\x41\\x42\\x43\\x44\\x45\\x46\\x47\\x48\\x49\\x4a\\x4b\\x4c\\x4d\\x4e\\x4f" +
				"\\x50\\x51\\x52\\x53\\x54\\x55\\x56\\x57\\x58\\x59\\x5a\\x5b\\x5c\\x5d\\x5e\\x5f" +
				"\\x60\\x61\\x62\\x63\\x64\\x65\\x66\\x67\\x68\\x69\\x6a\\x6b\\x6c\\x6d\\x6e\\x6f" +
				"\\x70\\x71\\x72\\x73\\x74\\x75\\x76\\x77\\x78\\x79\\x7a\\x7b\\x7c\\x7d\\x7e\\x7f" +
				"\\x80\\x81\\x82\\x83\\x84\\x85\\x86\\x87\\x88\\x89\\x8a\\x8b\\x8c\\x8d\\x8e\\x8f" +
				"\\x90\\x91\\x92\\x93\\x94\\x95\\x96\\x97\\x98\\x99\\x9a\\x9b\\x9c\\x9d\\x9e\\x9f" +
				"\\xa0\\xa1\\xa2\\xa3\\xa4\\xa5\\xa6\\xa7\\xa8\\xa9\\xaa\\xab\\xac\\xad\\xae\\xaf" +
				"\\xb0\\xb1\\xb2\\xb3\\xb4\\xb5\\xb6\\xb7\\xb8\\xb9\\xba\\xbb\\xbc\\xbd\\xbe\\xbf" +
				"\\xc0\\xc1\\xc2\\xc3\\xc4\\xc5\\xc6\\xc7\\xc8\\xc9\\xca\\xcb\\xcc\\xcd\\xce\\xcf" +
				"\\xd0\\xd1\\xd2\\xd3\\xd4\\xd5\\xd6\\xd7\\xd8\\xd9\\xda\\xdb\\xdc\\xdd\\xde\\xdf" +
				"\\xe0\\xe1\\xe2\\xe3\\xe4\\xe5\\xe6\\xe7\\xe8\\xe9\\xea\\xeb\\xec\\xed\\xee\\xef" +
				'\\xf0\\xf1\\xf2\\xf3\\xf4\\xf5\\xf6\\xf7\\xf8\\xf9\\xfa\\xfb\\xfc\\xfd\\xfe\\xff"',
		);
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
