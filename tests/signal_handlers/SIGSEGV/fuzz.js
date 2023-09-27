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

const native = require("native-signal");

const RUN_ON_ITERATION = 1000;

let i = 0;

module.exports.SIGSEGV_SYNC = (data) => {
	if (i === RUN_ON_ITERATION) {
		console.log("kill with signal");
		process.kill(process.pid, "SIGSEGV");
	}
	if (i > RUN_ON_ITERATION) {
		console.log("Signal has not stopped the fuzzing process");
	}
	i++;
};

module.exports.SIGSEGV_ASYNC = (data) => {
	// Raising SIGSEGV in async mode does not stop the fuzzer directly,
	// as the event is handled asynchronously in the event loop.
	if (i === RUN_ON_ITERATION) {
		console.log("kill with signal");
		process.kill(process.pid, "SIGSEGV");
	}
	i++;
};

module.exports.NATIVE_SIGSEGV_SYNC = (data) => {
	if (i === RUN_ON_ITERATION) {
		native.sigsegv(0);
	}
	if (i > RUN_ON_ITERATION) {
		console.log("Signal has not stopped the fuzzing process");
	}
	i++;
};

module.exports.NATIVE_SIGSEGV_ASYNC = async (data) => {
	if (i === RUN_ON_ITERATION) {
		native.sigsegv(0);
	}
	i++;
};
