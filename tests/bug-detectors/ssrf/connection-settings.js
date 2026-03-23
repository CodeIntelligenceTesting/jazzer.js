/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */
const host = "localhost";
const hostIPv6 = "::1";

const okPort = 8080;
const okPortHttps = 8181;
const notOkPort = 9090;
const notOkPortHttps = 9191;

const okPortIPv6 = 6060;

const okMessage = "Connection allowed.";
const notOkMessage = "SSRF sanitizer does not work!";
const ssrfFindingMessage = "Server Side Request Forgery (SSRF)";

module.exports = {
	host,
	hostIPv6,
	okPort,
	okPortHttps,
	notOkPort,
	notOkPortHttps,
	okPortIPv6,
	okMessage,
	notOkMessage,
	ssrfFindingMessage,
};
