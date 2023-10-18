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

const dgram = require("dgram");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const {
	FuzzTestBuilder,
	FuzzingExitCode,
	JestRegressionExitCode,
} = require("../helpers.js");

const {
	host,
	hostIPv6,
	okPort,
	okPortHttps,
	okPortIPv6,
	notOkPort,
	notOkPortHttps,
	okMessage,
	notOkMessage,
	ssrfFindingMessage,
} = require("./ssrf/connection-settings.js");

describe("SSRF", () => {
	let endpoints;

	beforeAll(async () => {
		endpoints = [
			[http.createServer, host, okPort, okMessage],
			[http.createServer, host, notOkPort, notOkMessage],
			[https.createServer, host, okPortHttps, okMessage],
			[https.createServer, host, notOkPortHttps, notOkMessage],
			[dgram.createSocket, host, okPort, okMessage, false],
			[dgram.createSocket, host, notOkPort, notOkMessage, false],
			[dgram.createSocket, hostIPv6, okPortIPv6, okMessage, false, true],
		].map(
			async ([createServerFn, host, port, message, isTCP, udpType]) =>
				await createServer(createServerFn, host, port, message, isTCP, udpType),
		);
	});

	afterAll((done) => {
		Promise.all(endpoints).then((servers) => {
			servers.forEach((server) => {
				server.close();
				server.unref();
			});
			done();
		});
	});

	const bugDetectorDirectory = path.join(__dirname, "ssrf");
	let fuzzTestBuilder;

	describe("Not permitted connections", () => {
		beforeEach(() => {
			fuzzTestBuilder = new FuzzTestBuilder()
				.dir(bugDetectorDirectory)
				.fuzzFile("fuzz-http.js")
				.runs(0)
				.sync(false);
		});

		it("http.get(options, callback)", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("HttpGetOptionsCallback")
				.build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("http.get(url, callback)", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("HttpGetUrlCallback")
				.build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("http.get(url with no port, callback)", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("HttpGetUrlNoPort")
				.build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("http.get(nothing, callback)", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("HttpGetUrlNoAnything")
				.build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("http.request(options, callback)", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("HttpRequestOptionsCallback")
				.build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("http.request(url, callback)", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("HttpRequestUrlCallback")
				.build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("http.request(url with no port, callback)", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("HttpRequestUrlNoPort")
				.build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("net.connect(port, host, callback)", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("netConnectPortHost")
				.build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("net.connect(options, callback)", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("netConnectOptions")
				.build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("net Socket.connect(port, host, callback)", async () => {
			const fuzzTest = fuzzTestBuilder.fuzzEntryPoint("socketConnect").build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("net Socket.connect(options, callback)", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("socketConnectWithOptions")
				.build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("tls.connect(options, callback)", async () => {
			const fuzzTest = fuzzTestBuilder.fuzzEntryPoint("TlsConnect").build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("https.get(options, callback)", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("HttpsGetOptions")
				.build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("http2.connect(options, callback)", async () => {
			const fuzzTest = fuzzTestBuilder.fuzzEntryPoint("Http2Connect").build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		it("udp.connect(port, host, callback)", async () => {
			const fuzzTest = fuzzTestBuilder.fuzzEntryPoint("udpConnect").build();
			await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
				FuzzingExitCode,
			);
			expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
		});

		describe("Jest tests", () => {
			beforeEach(() => {
				fuzzTestBuilder = new FuzzTestBuilder()
					.dir(bugDetectorDirectory)
					.jestTestFile("tests.fuzz.js")
					.sync(false);
			});

			it("net.connect(options, callback)", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("net.connect\\(options, callback\\)")
					.build();
				await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
					JestRegressionExitCode,
				);
				expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
			});

			it("udp.connect(port, host, callback)", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("udp.connect\\(port, host, callback\\)")
					.build();
				await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
					JestRegressionExitCode,
				);
				expect(fuzzTest.stderr).toContain(ssrfFindingMessage);
			});
		});
	});

	describe("Permitted connections", () => {
		beforeEach(() => {
			fuzzTestBuilder = new FuzzTestBuilder()
				.dir(bugDetectorDirectory)
				.fuzzFile("fuzz-http.js")
				.runs(1)
				.customHooks([
					path.join(bugDetectorDirectory, "allow-ok-ports.config.js"),
				])
				.sync(false);
		});

		it("http.request", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("HttpRequestAllowed")
				.build();
			await fuzzTest.executeWithPromise();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("http.get", async () => {
			const fuzzTest = fuzzTestBuilder.fuzzEntryPoint("HttpGetAllowed").build();
			await fuzzTest.executeWithPromise();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("https.get", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("HttpsGetAllowed")
				.build();
			await fuzzTest.executeWithPromise();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("http2.connect", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("Http2ConnectAllowed")
				.build();
			await fuzzTest.executeWithPromise();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("net.connect", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("netConnectAllowed")
				.build();
			await fuzzTest.executeWithPromise();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("udp.connect", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("udpConnectAllowed")
				.build();
			await fuzzTest.executeWithPromise();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("udp.send connectionless", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("udpSendConnectionlessAllowed")
				.build();
			await fuzzTest.executeWithPromise();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("udp.connect IPv6", async () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("udpIPv6ConnectAllowed")
				.build();
			await fuzzTest.executeWithPromise();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		describe("Jest tests", () => {
			beforeEach(() => {
				fuzzTestBuilder = new FuzzTestBuilder()
					.dir(bugDetectorDirectory)
					.jestTestFile("tests.fuzz.js")
					.customHooks([
						path.join(bugDetectorDirectory, "allow-ok-ports.config.js"),
					])
					.sync(false);
			});

			it("http.request", async () => {
				const fuzzTest = fuzzTestBuilder.jestTestName("http.request").build();
				await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
					JestRegressionExitCode,
				);
				expect(fuzzTest.stderr).toContain(okMessage);
			});

			it("udp.connect IPv6", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("udp.connect IPv6")
					.build();
				await expect(fuzzTest.executeWithPromise()).rejects.toThrowError(
					JestRegressionExitCode,
				);
				expect(fuzzTest.stderr).toContain(okMessage);
			});
		});
	});
});
async function createServer(
	createServerFn,
	host,
	port,
	message,
	isTCP = true,
	useIPv6 = false,
) {
	const options = {
		key: fs.readFileSync(path.join(__dirname, "ssrf", "key.pem")),
		cert: fs.readFileSync(path.join(__dirname, "ssrf", "cert.pem")),
		port: port,
		host: host,
	};
	let startedListening = false;
	let server;

	if (isTCP) {
		server = createServerFn(options, (req, res) => {
			res.writeHead(200, { "Content-Type": "text/plain" });
			res.write(message);
			res.end();
		});

		server.listen(port, host, () => {
			startedListening = true;
		});

		server.on("connect", (req, socket, head) => {
			console.log("connect");
		});

		process.on("uncaughtException", function (err) {
			console.log(err);
		});

		server.on("close", () => {});

		// wait for the server to start listening
		while (!startedListening) {
			// give away control to the event loop to prevent blocking
			await new Promise((resolve) => setTimeout(resolve, 1));
		}
	} else {
		// UDP
		const udpType = useIPv6 ? "udp6" : "udp4";
		server = createServerFn(udpType, (msg, rinfo) => {
			server.send(message, rinfo.port, rinfo.address, (err) => {
				if (err) {
					console.log(err);
				}
			});
		});
		server.bind(options);
	}

	return server;
}
