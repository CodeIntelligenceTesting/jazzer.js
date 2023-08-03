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
const http2 = require("http2");
const https = require("https");
const net = require("net");
const tls = require("tls");

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
} = require("./connection-settings.js");

const url = "http://" + host;
const allowedUrlWithPort = url + ":" + okPort.toString();
const allowedHttpsUrlWithPort =
	"https://" + host + ":" + okPortHttps.toString();

const notAllowedUrlWithPort = url + ":" + notOkPort.toString();

module.exports.HttpGetOptionsCallback = async function (data) {
	const options = {
		host: host,
		port: notOkPort,
		path: "/HttpGetOptionsCallback",
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
	};

	let done = false;
	http
		.get(options, function (res) {
			console.log(notOkMessage);
			done = true;
		})
		.end();
};

module.exports.HttpGetUrlCallback = async function (data) {
	http
		.get(notAllowedUrlWithPort + "/HttpGetUrlCallback", function (res) {
			console.log(notOkMessage);
		})
		.end();
};

module.exports.HttpGetUrlNoPort = function (data) {
	http
		.get(url + "/HttpGetUrlNoPort", function (res) {
			console.log(notOkMessage);
		})
		.end();
};

module.exports.HttpGetUrlNoAnything = function (data) {
	http
		.get({}, function (res) {
			console.log(notOkMessage);
		})
		.end();
};

module.exports.HttpRequestOptionsCallback = function (data) {
	const options = {
		host: host,
		port: notOkPort,
		path: "/HttpRequestOptionsCallback",
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
	};

	http
		.request(options, function (res) {
			console.log(notOkMessage);
		})
		.end();
};

module.exports.HttpRequestUrlCallback = function (data) {
	http
		.request(notAllowedUrlWithPort + "/HttpRequestUrlCallback", function (res) {
			console.log(notOkMessage);
		})
		.end();
};

module.exports.HttpRequestUrlNoPort = function (data) {
	http
		.request(url + "/HttpRequestUrlNoPort", function (res) {
			console.log(notOkMessage);
		})
		.end();
};

module.exports.netConnectPortHost = async function (data) {
	net.connect(notOkPort, host, function () {
		console.log(notOkMessage);
	});
};

module.exports.netConnectOptions = async function (data) {
	const options = {
		host: host,
		port: notOkPort,
	};
	net.connect(options, function () {
		console.log(notOkMessage);
	});
};

module.exports.socketConnect = async function (data) {
	const socket = new net.Socket();
	socket.connect(notOkPort, host, function () {
		console.log(notOkMessage);
	});
};

module.exports.socketConnectWithOptions = async function (data) {
	const options = {
		host: host,
		port: notOkPort,
	};
	const socket = new net.Socket();
	socket.connect(options, function () {
		console.log(notOkMessage);
	});
};

module.exports.TlsConnect = async function (data) {
	const options = {
		ca: [fs.readFileSync("cert.pem")],
		host: host,
		port: notOkPortHttps,
	};
	try {
		tls
			.connect(options, function (res) {
				console.log(notOkMessage);
			})
			.end();
	} catch (e) {
		console.log(e);
	}
};

module.exports.HttpsGetOptions = async function (data) {
	let output = "";
	let done = false;
	const options = {
		ca: [fs.readFileSync("cert.pem")],
		host: host,
		port: notOkPortHttps,
		path: "/" + "HttpsGetOptions",
	};
	https
		.get(options, function (res) {
			res.on("data", function (d) {
				output += d;
			});
			res.on("end", function () {
				console.log(output);
				done = true;
			});
		})
		.end();
};

module.exports.Http2Connect = async function (data) {
	const options = {};
	let output = "";
	let done = false;
	http2.connect(notAllowedUrlWithPort, options, function (res) {
		res.on("data", function (d) {
			output += d;
		});
		res.on("end", function () {
			console.log(output);
			done = true;
		});
	});
};

module.exports.udpConnect = async function (data) {
	const client = dgram.createSocket("udp4");
	client.connect(notOkPort, host, function (err) {
		client.send("hello!", (err) => {
			// receive a message from the server
			client.on("message", function (msg, info) {
				console.log("Data received from server : " + msg.toString());
				console.log(
					"Received %d bytes from %s:%d\n",
					msg.length,
					info.address,
					info.port,
				);
				client.close();
			});
		});
	});
};

module.exports.HttpRequestAllowed = async function (data) {
	// Options to be used by request
	const options = {
		host: "",
		port: okPort,
		path: "/HttpRequestAllowed",
	};
	let output = "";
	let done = false;
	http
		.request(options, function (res) {
			res.on("data", function (d) {
				output += d;
			});
			res.on("end", function () {
				console.log(output);
				done = true;
			});
		})
		.end();
};

module.exports.HttpGetAllowed = async function (data) {
	let output = "";
	let done = false;
	http
		.get(allowedUrlWithPort + "/HttpGetAllowed", function (res) {
			res.on("data", function (d) {
				output += d;
			});
			res.on("end", function () {
				console.log(output);
				done = true;
			});
		})
		.end();
};

module.exports.HttpsGetAllowed = async function (data) {
	let output = "";
	let done = false;
	const options = {
		ca: [fs.readFileSync("cert.pem")],
		host: host,
		port: okPortHttps,
		path: "/HttpsGetAllowed",
	};
	https
		.get(options, function (res) {
			res.on("data", function (d) {
				output += d;
			});
			res.on("end", function () {
				console.log(output);
				done = true;
			});
		})
		.end();
};

module.exports.Http2ConnectAllowed = async function (data) {
	// Not sure why this particular protocol wants http:// instead of https://
	http2.connect(url + ":" + okPortHttps, {}, function (res) {
		console.log(okMessage);
	});
};

module.exports.netConnectAllowed = async function (data) {
	net
		.connect(okPort, host, function (res) {
			console.log(okMessage);
		})
		.end();
};

module.exports.udpConnectAllowed = async function (data) {
	const client = dgram.createSocket("udp4");
	client.connect(okPort, host, function (err) {
		client.send("hello!", (err) => {
			// receive a message from the server
			client.on("message", function (msg, info) {
				console.log("Data received from server : " + msg.toString());
				console.log(
					"Received %d bytes from %s:%d\n",
					msg.length,
					info.address,
					info.port,
				);
				client.close();
			});
		});
	});
};

module.exports.udpSendConnectionlessAllowed = async function (data) {
	const client = dgram.createSocket("udp4");
	client.send("hello!", okPort, host, (err) => {
		// receive a message from the server
		client.on("message", function (msg, info) {
			console.log("Data received from server : " + msg.toString());
			console.log(
				"Received %d bytes from %s:%d\n",
				msg.length,
				info.address,
				info.port,
			);
			client.close();
		});
	});
};

module.exports.udpIPv6ConnectAllowed = async function (data) {
	const client = dgram.createSocket("udp6");
	client.connect(6060, hostIPv6, function (err) {
		client.send("hello!", (err) => {
			// receive a message from the server
			client.on("message", function (msg, info) {
				console.log("Data received from server : " + msg.toString());
				console.log(
					"Received %d bytes from %s:%d\n",
					msg.length,
					info.address,
					info.port,
				);
				client.close();
			});
		});
	});
};
