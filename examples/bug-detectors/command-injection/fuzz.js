/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const root = require("global-modules-path");

const { FuzzedDataProvider } = require("@jazzer.js/core");

module.exports.fuzz = function (data) {
	const provider = new FuzzedDataProvider(data);
	const str1 = provider.consumeString(provider.consumeIntegralInRange(1, 20));
	const str2 = provider.consumeRemainingAsString();
	root.getPath(str1, str2);
};
