/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
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
