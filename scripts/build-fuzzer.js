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
const fs = require("fs");
const path = require("path");

const strip = require("./strip");

fs.mkdirSync("prebuilds", { recursive: true });

// Copy napi release into prebuilds/fuzzer-<platform>-<arch>.node
const targetName = path.join(
	"prebuilds",
	`fuzzer-${process.platform}-${getArchitecture()}.node`,
);
fs.copyFileSync("build/Release/jazzerjs.node", targetName);

// Strip debugging symbols from the release binary.
// TODO: maybe only strip when releasing?
strip(targetName, function (err) {
	if (err) {
		console.error(err);
		process.exit(1);
	}
});

function getArchitecture() {
	if (process.argv[3] && process.argv[3] === "x86_64") return "x64";

	return process.argv[3] ?? process.arch;
}
