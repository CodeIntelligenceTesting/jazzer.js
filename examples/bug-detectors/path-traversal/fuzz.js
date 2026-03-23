/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const path = require("path");

const JSZip = require("jszip");

/**
 * This demonstrates the path traversal bug detector on a vulnerable version of jszip.
 * @param { Buffer } data
 */
module.exports.fuzz = function (data) {
	// Parse the buffer into a JSZip object. The buffer might have been obtained from an http-request.
	// See https://stuk.github.io/jszip/documentation/howto/read_zip.html for some examples.
	return JSZip.loadAsync(data)
		.then((zip) => {
			for (const file in zip.files) {
				// We might want to extract the file from the zip archive and write it to disk.
				// The loadAsync function should have sanitized the path already.
				// Here we only construct the absolute path and trigger the path traversal bug.
				// This issue was fixed in jszip 3.8.0.
				path.join(__dirname, file);
			}
		})
		.catch(() => {
			/* ignore broken zip files */
		});
};
