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
const http = require("http");

const server = http.createServer(function (req, res) {
	try {
		// Extract the target URL from the request.
		const target = new URL(
			req.url,
			"http://code-intelligence.com",
		).searchParams.get("target");
		if (!target) return;
		// Connecting to user-controlled target:
		http
			.get(target, (res) => {
				console.log(`statusCode: ${res.statusCode}`);
			})
			.on("error", (error) => {});
	} catch (e) {
		// ignore errors
	}
});

server.on("connection", function (socket) {
	socket.setTimeout(3000);
	socket.on("timeout", function () {
		process.exit(0);
	});
});

server.on("error", (err) => {
	console.log(err);
});

server.listen(8080, "localhost");

const baseRequest = "?target=http://invalid.com";

module.exports.fuzz = async function (data) {
	try {
		// TODO: remove after the fuzzer supports string comparison of the case where both are variables.
		// A hack to make the fuzzer pick up string comparison between two variables.
		// Comparing two variables will not be instrumented and thus not picked up by value profiler!
		if (
			data.toString().substring(0, baseRequest.length) !==
			"?target=http://invalid.com"
		) {
			return;
		}

		// Send a raw request to the server.
		http.get("http://localhost:8080/" + data.toString(), (res) => {});
	} catch (e) {
		// ignore
	}
};
