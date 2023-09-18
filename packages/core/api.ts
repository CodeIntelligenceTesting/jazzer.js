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

import { fuzzer } from "@jazzer.js/fuzzer";

// Central place to export all public API functions to be used in fuzz targets,
// hooks and bug detectors. Don't use internal functions directly from those.

export {
	registerInstrumentationPlugin,
	instrumentationGuard,
} from "@jazzer.js/instrumentor";
export {
	registerAfterEachCallback,
	registerBeforeEachCallback,
} from "./callback";
export { addDictionary } from "./dictionary";
export { reportAndThrowFinding, reportFinding } from "./finding";
export {
	getJazzerJsGlobal,
	setJazzerJsGlobal,
	getOrSetJazzerJsGlobal,
} from "./globals";

export const guideTowardsEquality = fuzzer.tracer.guideTowardsEquality;
export const guideTowardsContainment = fuzzer.tracer.guideTowardsContainment;
export const exploreState = fuzzer.tracer.exploreState;

// Export jazzer object for backwards compatibility.
export const jazzer = {
	guideTowardsEquality: fuzzer.tracer.guideTowardsEquality,
	guideTowardsContainment: fuzzer.tracer.guideTowardsContainment,
	exploreState: fuzzer.tracer.exploreState,
};
