/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const {
	getBugDetectorConfiguration,
} = require("../../../packages/bug-detectors");

getBugDetectorConfiguration("ssrf")?.addPermittedTCPConnection(
	"localhost",
	8080,
);
