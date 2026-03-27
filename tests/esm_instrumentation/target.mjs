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
 * A pure ES module with a string-literal comparison.  The compare
 * hooks replace the === with a traceStrCmp call that leaks the
 * literal to libFuzzer's mutation engine.  Without that feedback
 * a 16-byte random string cannot be found by brute force.
 */
export function checkSecret(s) {
	if (s === "a]3;d*F!pk29&bAc") {
		throw new Error("Found the ESM secret!");
	}
}
