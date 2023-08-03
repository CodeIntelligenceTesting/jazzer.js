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
const host = "localhost";
const hostIPv6 = "::1";

const okPort = 8080;
const okPortHttps = 8181;
const notOkPort = 9090;
const notOkPortHttps = 9191;

const okPortIPv6 = 6060;

const okMessage = "Connection allowed.";
const notOkMessage = "Connection not allowed.";

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
};
