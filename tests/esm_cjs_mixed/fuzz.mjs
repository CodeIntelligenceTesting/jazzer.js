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
 * ESM fuzz target that imports from BOTH a CJS module and an ESM
 * module.  Each function checks a 10-characters random string literal:
 *
 *   - cjs-check.cjs  verifies bytes  0..9  (hookRequire path)
 *   - esm-check.mjs  verifies bytes 10..19  (ESM loader path)
 *
 * Both functions are called unconditionally so that both compare
 * hooks fire on every fuzzing iteration, feeding libFuzzer
 * dictionary entries from both instrumentation paths.
 */

import { checkCjs } from "./cjs-check.cjs";
import { checkEsm } from "./esm-check.mjs";
import { FuzzedDataProvider } from "@jazzer.js/core";

export function fuzz(data) {
	const fdp = new FuzzedDataProvider(data);
	const cjsOk = checkCjs(fdp.consumeString(10));
	const esmOk = checkEsm(fdp.consumeString(10));
	if (cjsOk && esmOk) {
		throw new Error("Found the mixed CJS+ESM secret!");
	}
}
