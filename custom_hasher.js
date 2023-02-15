#!/usr/bin/env node

const fs = require("fs");
const crypto = require("crypto");

function computeHash(path, hash) {
	const stat = fs.lstatSync(path);

	if (stat.isDirectory()) {
		const entries = fs.readdirSync(path);
		entries.forEach((entry) => {
			const entryPath = `${path}/${entry}`;
			const entryStat = fs.lstatSync(entryPath);
			if (!entryStat.isSymbolicLink()) {
				computeHash(entryPath, hash);
			}
		});
	} else if (stat.isFile()) {
		const data = fs.readFileSync(path);
		hash.update(data);
	}
}

function computeDirectoryHash(directoryPath) {
	const hash = crypto.createHash("sha256");
	computeHash(directoryPath, hash);
	return hash.digest("hex");
}

const directoryPath = "./packages/fuzzer/";
const hash = computeDirectoryHash(directoryPath);
console.log(`${hash}`);
