/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
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
	return process.argv[3] ?? process.arch;
}
