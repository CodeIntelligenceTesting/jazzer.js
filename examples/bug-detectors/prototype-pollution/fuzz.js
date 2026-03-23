/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const protobuf = require("protobufjs");

module.exports.fuzz = async function (data) {
	try {
		protobuf.parse(data.toString());
	} catch (e) {
		// ignore
	}
};
