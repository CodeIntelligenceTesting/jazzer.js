/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */
const targets = require("./fuzz-http");

it.fuzz("http.request", async (data) => {
	return targets.HttpRequestAllowed(data);
});

it.fuzz("udp.connect IPv6", async (data) => {
	return targets.udpIPv6ConnectAllowed(data);
});

it.fuzz("net.connect(options, callback)", async (data) => {
	return targets.netConnectOptions(data);
});

it.fuzz("udp.connect(port, host, callback)", async (data) => {
	return targets.udpConnect(data);
});
