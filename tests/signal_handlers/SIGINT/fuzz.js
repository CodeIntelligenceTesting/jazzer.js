/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

let i = 0;

module.exports.SIGINT_SYNC = (data) => {
	if (i === 1000) {
		console.log("kill with signal");
		process.kill(process.pid, "SIGINT");
	}
	if (i > 1000) {
		console.error("Signal has not stopped the fuzzing process");
	}
	i++;
};

module.exports.SIGINT_SYNC_endless_loop = (data) => {
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (i === 1000 || i === 1001) {
			process.kill(process.pid, "SIGINT");
		}
		if (i > 1001) {
			console.error("Signal has not stopped the fuzzing process");
		}
		i++;
	}
};

module.exports.SIGINT_ASYNC = async (data) => {
	// Raising SIGINT in async mode does not stop the fuzzer directly,
	// as the event is handled asynchronously in the event loop.
	if (i === 1000) {
		console.log("kill with signal");
		process.kill(process.pid, "SIGINT");
	}
	i++;
};

module.exports.SIGINT_ASYNC_endless_loop = async (data) => {
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (i === 1000 || i === 1001) {
			process.kill(process.pid, "SIGINT");
		}
		if (i > 1001) {
			console.error("Signal has not stopped the fuzzing process");
		}
		i++;
	}
};
