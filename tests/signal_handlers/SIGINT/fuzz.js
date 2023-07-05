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

let i = 0;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.SIGINT_SYNC = (data) => {
	if (i === 1000) {
		console.log("kill with SIGINT");
		process.kill(process.pid, "SIGINT");
	}
	if (i > 1000) {
		console.log("SIGINT has not stopped the fuzzing process");
	}
	i++;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
module.exports.SIGINT_ASYNC = (data) => {
	// Raising SIGINT in async mode does not stop the fuzzer directly,
	// as the event is handled asynchronously in the event loop.
	if (i === 1000) {
		console.log("kill with SIGINT");
		process.kill(process.pid, "SIGINT");
	}
	i++;
};