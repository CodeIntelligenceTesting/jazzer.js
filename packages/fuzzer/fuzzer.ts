/*
 * Copyright 2022 Code Intelligence GmbH
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

import { addon, NativeAddon } from "./addon";
import { CoverageTracker } from "./coverage";
import { traceAndReturn, traceNumberCmp, traceStrCmp } from "./trace";

export type {
	FuzzTarget,
	FuzzTargetAsyncOrValue,
	FuzzTargetCallback,
} from "./addon";

export interface Fuzzer {
	nativeAddon: NativeAddon;
	coverageTracker: CoverageTracker;
	traceStrCmp: typeof traceStrCmp;
	traceNumberCmp: typeof traceNumberCmp;
	traceAndReturn: typeof traceAndReturn;
}

export const fuzzer: Fuzzer = {
	nativeAddon: addon,
	coverageTracker: new CoverageTracker(),
	traceStrCmp,
	traceNumberCmp,
	traceAndReturn,
};

export type { CoverageTracker } from "./coverage";
