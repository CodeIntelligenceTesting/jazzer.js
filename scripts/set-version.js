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
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const newVersion = process.argv[2];
validateVersion(newVersion);

const packagesDir = path.join(__dirname, "..", "packages");
const packages = fs.readdirSync(packagesDir);

// read package.json of each package
packages.forEach((packageName) => {
	const packageJson = require(
		path.join(packagesDir, packageName, "package.json"),
	);

	// update the version of the package
	packageJson.version = newVersion;

	// update the version of the dependencies
	for (const dependencyName in packageJson.dependencies) {
		// for all packages, check if the dependencyName name includes any of them
		if (
			packages.some(
				(packageName) => dependencyName === "@jazzer.js/" + packageName,
			)
		) {
			packageJson.dependencies[dependencyName] = newVersion;
		}
	}

	// write the updated package.json
	writePackageJson(
		path.join(packagesDir, packageName, "package.json"),
		packageJson,
	);
});

// update the jazzer.js version in the <root>/package.json
updateVersion(path.join(__dirname, "..", "package.json"), newVersion);

// run npm install to update the package-lock.json files
execSync("npm install", { cwd: packagesDir, stdio: "inherit" });

function updateVersion(filename, newVersion) {
	const pkg = require(filename);
	pkg.version = newVersion;
	writePackageJson(filename, pkg);
}

function writePackageJson(filename, pkg) {
	fs.writeFileSync(filename, JSON.stringify(pkg, null, "\t") + "\n");
}

// make sure the new version has the format v*.*.*
function validateVersion(version) {
	if (!version?.match(/^\d+\.\d+\.\d+$/)) {
		console.error("Invalid version format. Expected *.*.*");
		process.exit(1);
	}
}
