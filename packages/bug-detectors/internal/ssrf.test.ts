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
import { bugDetectorConfigurations } from "../configuration";

import {
	hookTCPSocket,
	hookUDPSocket,
	hookUDPSocketSend,
	SSRFConfig,
} from "./ssrf";

// Since we expect several findings in some tests, if a finding is reported but not expected after a finding was
// thrown and caught before, Jest will print an unhelpful "Error: thrown: undefined" message. To avoid this, we
// mock the reportAndThrowFinding function to throw  a fixed string.

jest.mock("../../core", () => ({
	reportAndThrowFinding: (cause: unknown) => {
		throw cause;
	},
}));

// Permitted hosts and ports used by the TCP and UDP socket hooks tests.
bugDetectorConfigurations
	.get("ssrf")
	.addPermittedTCPConnection("localhost", 80)
	.addPermittedUDPConnection("localhost", 8080)
	.addPermittedUDPConnection("localhost", 9090)
	.addPermittedUDPConnection("::1", 9091);

// Used by UDP socket hook.
const typeIPv4 = { type: "udp4" };
const typeIPv6 = { type: "udp6" };

const symbolError =
	"Internal socket state is missing. This is a bug in the SSRF bug detector.";
describe("SSRF", () => {
	describe("SSRFConfig", () => {
		test("Allow TCP connections", () => {
			const config = new SSRFConfig()
				.addPermittedTCPConnection("localhost", 80)
				.addPermittedTCPConnection("localhost", 90);

			expect(config.isPermittedTCPConnection("localhost", 80)).toBeTruthy();
			expect(config.isPermittedTCPConnection("localhost", 85)).toBeFalsy();
			expect(config.isPermittedTCPConnection("localhost", 90)).toBeTruthy();

			// UDP
			expect(config.isPermittedUDPConnection("localhost", 80)).toBeFalsy();
			expect(config.isPermittedUDPConnection("localhost", 90)).toBeFalsy();

			// other hosts
			expect(config.isPermittedTCPConnection("1.2.3.4", 80)).toBeFalsy();
			expect(config.isPermittedTCPConnection("1.2.3.4", 90)).toBeFalsy();

			// localhost is not the same as 127.0.0.1 and the bug detector will not resolve host names.
			expect(config.isPermittedTCPConnection("127.0.0.1", 80)).toBeFalsy();
			expect(config.isPermittedTCPConnection("127.0.0.1", 90)).toBeFalsy();
		});

		test("Allow UDP connections", () => {
			const config = new SSRFConfig()
				.addPermittedUDPConnection("localhost", 8080)
				.addPermittedUDPConnection("localhost", 9090);

			expect(config.isPermittedUDPConnection("localhost", 8080)).toBeTruthy();
			expect(config.isPermittedUDPConnection("localhost", 85)).toBeFalsy();
			expect(config.isPermittedUDPConnection("localhost", 9090)).toBeTruthy();

			expect(config.isPermittedTCPConnection("localhost", 8080)).toBeFalsy();
			expect(config.isPermittedTCPConnection("localhost", 9080)).toBeFalsy();

			// other hosts
			expect(config.isPermittedUDPConnection("1.2.3.4", 8080)).toBeFalsy();
			expect(config.isPermittedUDPConnection("1.2.3.4", 9090)).toBeFalsy();

			// localhost is not the same as 127.0.0.1 and the bug detector will not resolve host names.
			expect(config.isPermittedUDPConnection("127.0.0.1", 8080)).toBeFalsy();
			expect(config.isPermittedUDPConnection("127.0.0.1", 9090)).toBeFalsy();
		});

		test("Allow TCP and UDP connections", () => {
			const config = new SSRFConfig()
				.addPermittedTCPConnection("localhost", 123)
				.addPermittedUDPConnection("localhost", 456);

			expect(config.isPermittedTCPConnection("localhost", 123)).toBeTruthy();
			expect(config.isPermittedUDPConnection("localhost", 123)).toBeFalsy();

			expect(config.isPermittedTCPConnection("localhost", 456)).toBeFalsy();
			expect(config.isPermittedUDPConnection("localhost", 456)).toBeTruthy();

			expect(config.isPermittedTCPConnection("localhost", 789)).toBeFalsy();
			expect(config.isPermittedUDPConnection("localhost", 789)).toBeFalsy();

			// other hosts
			expect(config.isPermittedTCPConnection("other host", 0)).toBeFalsy();
			expect(config.isPermittedUDPConnection("other host", 0)).toBeFalsy();
		});

		test("Clearing the config for TCP and UDP individually ", () => {
			const config = new SSRFConfig()
				.addPermittedTCPConnection("localhost", 123)
				.addPermittedUDPConnection("localhost", 456);

			expect(config.isPermittedTCPConnection("localhost", 123)).toBeTruthy();
			expect(config.isPermittedUDPConnection("localhost", 456)).toBeTruthy();

			config.clearPermittedUDPConnections();
			expect(config.isPermittedTCPConnection("localhost", 123)).toBeTruthy();
			expect(config.isPermittedUDPConnection("localhost", 456)).toBeFalsy();

			config.clearPermittedTCPConnections();
			expect(config.isPermittedTCPConnection("localhost", 123)).toBeFalsy();
			expect(config.isPermittedUDPConnection("localhost", 456)).toBeFalsy();
		});

		test("Clearing the config at once", () => {
			const config = new SSRFConfig();
			config.addPermittedTCPConnection("localhost", 1234);
			config.addPermittedUDPConnection("localhost", 5678);

			expect(config.isPermittedTCPConnection("localhost", 1234)).toBeTruthy();
			expect(config.isPermittedUDPConnection("localhost", 5678)).toBeTruthy();

			config.clear();
			expect(config.isPermittedTCPConnection("localhost", 1234)).toBeFalsy();
			expect(config.isPermittedUDPConnection("localhost", 5678)).toBeFalsy();
		});
	});

	describe("hookTCPSocket ", () => {
		test("Call TCP socket hook with ports as numbers", () => {
			// not allowed port and host
			expect(() =>
				hookTCPSocket(undefined, [8080, "local", "callback"], 0),
			).toThrow("Server Side Request Forgery");
			// not allowed port and host in options
			expect(() =>
				hookTCPSocket(
					undefined,
					[{ port: 8080, host: "local" }, "callback"],
					0,
				),
			).toThrow("Server Side Request Forgery");
			// allowed connection in options
			expect(() =>
				hookTCPSocket(
					undefined,
					[{ port: 80, host: "localhost" }, "callback"],
					0,
				),
			).not.toThrow();
			// allowed connection with explicit port and host
			expect(() =>
				hookTCPSocket(undefined, [80, "localhost", "callback"], 0),
			).not.toThrow();
		});

		test("Call TCP socket hook with ports as strings", () => {
			// not allowed port and host
			expect(() =>
				hookTCPSocket(undefined, ["81", "local", "callback"], 0),
			).toThrow("Server Side Request Forgery");
			// not allowed port and host in options
			expect(() =>
				hookTCPSocket(
					undefined,
					[{ port: "90", host: "local" }, "callback"],
					0,
				),
			).toThrow("Server Side Request Forgery");
			// allowed connection in options
			expect(() =>
				hookTCPSocket(
					undefined,
					[{ port: "80", host: "localhost" }, "callback"],
					0,
				),
			).not.toThrow();
			// allowed connection with explicit port and host
			expect(() =>
				hookTCPSocket(undefined, ["80", "localhost", "callback"], 0),
			).not.toThrow();
		});
	});

	describe("UDP", () => {
		describe("hookUDPSocket", () => {
			test("Call UDP socket hook with ports as numbers", () => {
				// Invalid parameters---original function will throw an error (not tested here).
				expect(() => hookUDPSocket(undefined, [], 0)).not.toThrow();
				// Type (IPv4 or 6) is only relevant when no host was provided.
				expect(() =>
					hookUDPSocket(typeIPv4, [9090, "localhost", "callback"], 0),
				).not.toThrow();
				expect(() =>
					hookUDPSocket(typeIPv6, [9091, "::1", "callback"], 0),
				).not.toThrow();
				expect(() =>
					hookUDPSocket(typeIPv4, [80, "127.0.0.1", "callback"], 0),
				).toThrow("Server Side Request Forgery");
			});

			test("Call UDP socket hook with ports as strings", () => {
				expect(() =>
					hookUDPSocket(typeIPv4, ["9090", "localhost", "callback"], 0),
				).not.toThrow();
				expect(() =>
					hookUDPSocket(typeIPv4, ["9091", "::1", "callback"], 0),
				).not.toThrow();
				expect(() =>
					hookUDPSocket(typeIPv6, ["9091", "::1", "callback"], 0),
				).not.toThrow();
				expect(() =>
					hookUDPSocket(typeIPv4, [81, "local", "callback"], 0),
				).toThrow("Server Side Request Forgery");
			});
		});

		describe("hookUDPSocketSend", () => {
			const thisPtr = {
				[Symbol("state symbol")]: { connectState: 0 },
			};

			test("Call UDP socket hook with ports as strings", () => {
				expect(() =>
					hookUDPSocketSend(
						{},
						[Buffer.from("unused"), "9091", "localhost", () => {}],
						0,
					),
				).toThrow(symbolError);
				expect(() =>
					hookUDPSocketSend(
						thisPtr,
						["hello", "9091", "localhost", () => {}],
						0,
					),
				).toThrow("Server Side Request Forgery");
				expect(() =>
					hookUDPSocketSend(
						thisPtr,
						["hello", "9090", "localhost", () => {}],
						0,
					),
				).not.toThrow();
				expect(() =>
					hookUDPSocketSend(thisPtr, ["hello", "9090", "::1", () => {}], 0),
				).toThrow("Server Side Request Forgery");
				expect(() =>
					hookUDPSocketSend(thisPtr, ["hello", "9091", "::1", () => {}], 0),
				).not.toThrow();
			});

			test("Call UDP socket hook with ports as numbers", () => {
				// Invalid thisPtr---original function will throw an error (not tested here).
				expect(() =>
					hookUDPSocketSend(
						{},
						[Buffer.from("unused"), 9091, "localhost", () => {}],
						0,
					),
				).toThrow(symbolError);
				expect(() =>
					hookUDPSocketSend(thisPtr, ["hello", 9091, "localhost", () => {}], 0),
				).toThrow("Server Side Request Forgery");
				expect(() =>
					hookUDPSocketSend(thisPtr, ["hello", 9090, "localhost", () => {}], 0),
				).not.toThrow();
				expect(() =>
					hookUDPSocketSend(thisPtr, ["hello", 9090, "::1", () => {}], 0),
				).toThrow("Server Side Request Forgery");
				expect(() =>
					hookUDPSocketSend(thisPtr, ["hello", 9091, "::1", () => {}], 0),
				).not.toThrow();
			});
		});
	});
});
