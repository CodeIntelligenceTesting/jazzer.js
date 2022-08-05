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

// This example is inspired by the MazeFuzzer Example in Jazzer. See:
// https://github.com/CodeIntelligenceTesting/jazzer/blob/8c8e87b22645ba7681e72cef0caaf05bab492b75/examples/src/main/java/com/example/MazeFuzzer.java

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jazzer = require("@jazzer.js/core").jazzer;

const mazeString = [
	"  ███████████████████",
	"    █ █ █   █ █     █",
	"█ █ █ █ ███ █ █ █ ███",
	"█ █ █   █       █   █",
	"█ █████ ███ ███ █ ███",
	"█       █   █ █ █   █",
	"█ ███ ███████ █ ███ █",
	"█ █     █ █     █   █",
	"███████ █ █ █████ ███",
	"█   █       █     █ █",
	"█ ███████ █ ███ ███ █",
	"█   █     █ █ █   █ █",
	"███ ███ █ ███ █ ███ █",
	"█     █ █ █   █     █",
	"█ ███████ █ █ █ █ █ █",
	"█ █         █ █ █ █ █",
	"█ █ █████████ ███ ███",
	"█   █   █   █ █ █   █",
	"█ █ █ ███ █████ ███ █",
	"█ █         █        ",
	"███████████████████ #",
];

let maze = [];
mazeString.forEach((line) => maze.push(line.split("")));

/**
 * @param { Buffer } commands
 */
module.exports.fuzz = function (commands) {
	executeCommands(commands, (x, y, won) => {
		if (won) {
			throw "Jazzer.js has found the treasure";
		}
		// This is the key line that makes this fuzz target work: It instructs the fuzzer to track
		// every new combination of x and y as a new feature. Without it, the fuzzer would be
		// completely lost in the maze as guessing an escaping path by chance is close to impossible.
		jazzer.exploreState(hash(x, y), 0);
		if (maze[y][x] === " ") {
			// Fuzzer reached a new field in the maze, print its progress.
			maze[y][x] = ".";
			printMaze();
		}
	});
};

function executeCommands(commands, executeAndCheckResult) {
	let x = 0;
	let y = 0;
	executeAndCheckResult(x, y, false);
	for (const command of commands) {
		let nextX = x;
		let nextY = y;
		let c = String.fromCharCode(command);
		switch (c) {
			case "L":
				nextX--;
				break;
			case "R":
				nextX++;
				break;
			case "U":
				nextY--;
				break;
			case "D":
				nextY++;
				break;
			default:
				return;
		}
		let nextField = "";
		try {
			nextField = maze[nextY][nextX];
		} catch (e) {
			// Fuzzer tried to walk through the exterior walls of the maze.
			continue;
		}
		if (nextField !== " " && nextField !== "#" && nextField !== ".") {
			// Fuzzer tried to walk through the interior walls of the maze.
			continue;
		}
		// Fuzzer performed a valid move.
		x = nextX;
		y = nextY;
		executeAndCheckResult(x, y, nextField === "#");
	}
}

/**
 * Hash function with good mixing properties published by Thomas Mueller
 * under the terms of CC BY-SA 4.0 at
 * https://stackoverflow.com/a/12996028
 * https://creativecommons.org/licenses/by-sa/4.0/
 */
function hash(x, y) {
	let h = (x << 8) | y;
	h = ((h >> 16) ^ h) * 0x45d9f3b;
	h = ((h >> 16) ^ h) * 0x45d9f3b;
	h = (h >> 16) ^ h;
	return h & 0xff;
}

function printMaze() {
	maze.forEach((line) => console.log(line.join("")));
}
