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

import assert from "assert";
import { SocketType as UDPSocketType } from "dgram";
import { TcpSocketConnectOpts } from "net";

import { reportAndThrowFinding } from "@jazzer.js/core";
import { registerBeforeHook } from "@jazzer.js/hooking";

import { bugDetectorConfigurations } from "../configuration";

export class SSRFConfig {
	private _permittedTCPConnections: Map<string, Set<number>> = new Map();
	private _permittedUDPConnections: Map<string, Set<number>> = new Map();

	/**
	 * Add a permitted TCP connection to the config.
	 * @param hostname - The hostname of the permitted connection.
	 * @param port - The port of the permitted connection.
	 */
	addPermittedTCPConnection(hostname: string, port: number): SSRFConfig {
		return this.addPermittedConnection(
			this._permittedTCPConnections,
			hostname,
			port,
		);
	}

	/**
	 * Check if a TCP connection is permitted.
	 * @param hostname - The hostname of the connection.
	 * @param port - The port of the connection.
	 */
	isPermittedTCPConnection(hostname: string, port?: string | number): boolean {
		// Even though ports should be numbers, node API allows strings as well.
		return this.isPermittedConnection(
			this._permittedTCPConnections,
			hostname,
			port,
		);
	}

	/**
	 * Add a permitted UDP connection to the config.
	 * @param hostname - The hostname of the permitted connection.
	 * @param port - The port of the permitted connection.
	 */
	addPermittedUDPConnection(hostname: string, port: number): SSRFConfig {
		return this.addPermittedConnection(
			this._permittedUDPConnections,
			hostname,
			port,
		);
	}

	/**
	 * Check if a UDP connection is permitted.
	 * @param hostname - The hostname of the connection.
	 * @param port - The port of the connection.
	 */
	isPermittedUDPConnection(hostname: string, port?: string | number): boolean {
		return this.isPermittedConnection(
			this._permittedUDPConnections,
			hostname,
			port,
		);
	}

	/**
	 * Clear all TCP connections allowed so far.
	 */
	clearPermittedTCPConnections(): SSRFConfig {
		this._permittedTCPConnections.clear();
		return this;
	}

	/**
	 * Clear all UDP connections allowed so far.
	 */
	clearPermittedUDPConnections(): SSRFConfig {
		this._permittedUDPConnections.clear();
		return this;
	}

	/**
	 * Clear all TCP and UDP connections allowed so far.
	 */
	clear(): SSRFConfig {
		this.clearPermittedTCPConnections();
		this.clearPermittedUDPConnections();
		return this;
	}

	private addPermittedConnection(
		permittedConnections: Map<string, Set<number>>,
		hostname: string,
		port: number,
	): SSRFConfig {
		assert(
			this.isValidPort(port),
			"Port must be an integer between 0 and 65535",
		);
		if (permittedConnections.has(hostname)) {
			const ports = permittedConnections.get(hostname);
			if (ports !== undefined && !ports.has(port)) {
				ports.add(port);
			}
		} else {
			const ports = new Set<number>();
			ports.add(port);
			permittedConnections.set(hostname, ports);
		}
		return this;
	}

	private isPermittedConnection(
		permittedConnections: Map<string, Set<number>>,
		hostname: string,
		port?: string | number,
	): boolean {
		if (typeof port === "string") {
			try {
				port = parseInt(port);
			} catch (e) {
				return true;
			}
		}
		// The original function should handle invalid ports (usually by an error).
		// SSRF should not be reported in that case.
		if (port === undefined || !this.isValidPort(port)) return true;

		return permittedConnections.get(hostname)?.has(port) ?? false;
	}

	private isValidPort(port?: number): boolean {
		return (
			typeof port === "number" &&
			port >= 0 &&
			port <= 65535 &&
			Number.isInteger(port)
		);
	}
}

const config = new SSRFConfig();

// Add this bug detector's config to the global Map configs.
bugDetectorConfigurations.set("ssrf", config);

registerBeforeHook("Socket.prototype.connect", "net", false, hookTCPSocket);
registerBeforeHook("Socket.prototype.connect", "dgram", false, hookUDPSocket);
registerBeforeHook("Socket.prototype.send", "dgram", false, hookUDPSocketSend);

export function hookTCPSocket(_thisPtr: unknown, args: unknown[], _id: number) {
	if (args.length === 1) {
		const firstArgument = args[0];

		if (firstArgument !== null && typeof firstArgument === "object") {
			const options = firstArgument as TcpSocketConnectOpts;
			let host = options.host;
			let port = options.port;

			if (firstArgument instanceof Array) {
				if (host === undefined) {
					host = firstArgument[0].host || "localhost";
				}
				if (port === undefined) {
					port = firstArgument[0].port;
				}
			}
			detectSSRF(port, host, "Attempted connection via TCP");
		}
	} else if (args.length === 2) {
		// connect(options: SocketConnectOpts, connectionListener?: () => void): this;
		const firstArgument = args[0];
		if (typeof firstArgument === "object" && firstArgument !== null) {
			const options = firstArgument as TcpSocketConnectOpts;
			detectSSRF(options.port, options.host, "Attempted connection via TCP");
		}
	} else if (args.length === 3) {
		// connect(port: number, host: string, connectionListener?: () => void): this;
		detectSSRF(args[0], args[1], "Attempted connection via TCP");
	}
}

type ConnectState = { connectState: number };

interface UDPSocket {
	type?: UDPSocketType;
	[key: symbol]: ConnectState;
}

function getConnectionState(socket: UDPSocket): ConnectState {
	for (const symbol of Object.getOwnPropertySymbols(socket)) {
		if (symbol.toString() === "Symbol(state symbol)") {
			return socket[symbol];
		}
	}
	throw new Error(
		"Internal socket state is missing. This is a bug in the SSRF bug detector.",
	);
}

export function hookUDPSocket(thisPtr: unknown, args: unknown[], _id: number) {
	const socket = thisPtr as UDPSocket;
	if (socket?.type === undefined) return;

	// Type is only used to determine the default host.
	const defaultHost = socket.type === "udp4" ? "127.0.0.1" : "::1";
	const host = typeof args[1] === "string" ? args[1] : defaultHost;
	detectSSRF(args[0], host, "Attempted connection via UDP", true);
}

// Connection-less send using UDP sockets.
export function hookUDPSocketSend(
	thisPtr: UDPSocket,
	args: unknown[],
	_id: number,
) {
	const state = getConnectionState(thisPtr);

	const offset = args[1];
	const length = args[2];
	let port = args[3];
	let host = args[4];

	const CONNECT_STATE_CONNECTED = 2;

	// This follows the same logic as the send function in the dgram module (dgram.js)
	// to obtain port and address
	if (state.connectState === CONNECT_STATE_CONNECTED) {
		if (typeof length === "number") {
			if (typeof port === "function") {
				port = undefined;
			}
		}
		if (port || host) {
			// When already connected, the original function will throw an error, so we're done here.
			return;
		}
	} else {
		if (!host && !(port && typeof port !== "function")) {
			port = offset;
			host = length;
		}
	}

	if (typeof host === "function") {
		host = undefined;
	} else if (host && typeof host !== "string") {
		return;
	}

	detectSSRF(port, host, "Attempted a connectionless send via UDP", true);
}

function detectSSRF(
	port: unknown,
	host: unknown,
	message: string,
	isUDP = false,
) {
	if (typeof port === "number" || typeof port === "string") {
		// The string check below is necessary for JavaScript, where the user can pass
		// hostnames of any type. In that case, we want the original function
		// to throw an error, and thus return from here.
		// Since we don't validate hostnames, strings that are not valid host names or valid
		// but adjusted internally (e.g. "123" will be internally converted to "0.0.0.123")
		// will be reported as SSRF findings. We treat every hostname that is a string as valid.
		if (typeof host === "string") {
			if (
				isUDP
					? !config.isPermittedUDPConnection(host, port)
					: !config.isPermittedTCPConnection(host, port)
			) {
				reportAndThrowFinding(
					`Server Side Request Forgery (SSRF)\n` +
						"     " +
						message +
						` to '${host}' on port: '${port}'\n`,
				);
			}
		}
	}
}
