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

const JSZip = require("jszip");
const path = require("path");

/**
 * This demonstrates the path traversal bug detector on a vulnerable version of jszip.
 * @param { Buffer } data
 */
module.exports.fuzz = function (data) {
	// Parse the buffer into a JSZip object. The buffer might have been obtained from an http-request.
	// See https://stuk.github.io/jszip/documentation/howto/read_zip.html for some examples.
	return (
		JSZip.loadAsync(data)
			.then((zip) => {
				for (const file in zip.files) {
					// We might want to extract the file from the zip archive and write it to disk.
					// The loadAsync function should have sanitized the path already.
					// Here we only construct the absolute path and trigger the path traversal bug.
					// This issue was fixed in jszip 3.8.0.
					path.join(__dirname, file);
				}
			})
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			.catch(() => {
				/* ignore broken zip files */
			})
	);
};
