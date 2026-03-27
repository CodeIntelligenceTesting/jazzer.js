/*
 * Copyright 2026 Code Intelligence GmbH
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

/**
 * CJS module — instrumented via hookRequire (require.extensions).
 *
 * The 10-byte random string cannot be brute-forced; the fuzzer
 * needs the CJS compare hooks to discover it.
 */
function checkCjs(s) {
	return s === "r4Tp!mZ@8s";
}

module.exports = { checkCjs: checkCjs };
