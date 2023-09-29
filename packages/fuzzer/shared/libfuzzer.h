// Copyright 2022 Code Intelligence GmbH
//
//  Licensed under the Apache License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License.
//  You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
//  Unless required by applicable law or agreed to in writing, software
//  distributed under the License is distributed on an "AS IS" BASIS,
//  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  See the License for the specific language governing permissions and
//  limitations under the License.

#pragma once

namespace libfuzzer {
// A libFuzzer-registered callback that outputs the crashing input and
// optionally fuzzing stats, but does not include a stack trace.
extern void (*PrintCrashingInput)();

const int EXIT_OK_CODE = 0;
const int EXIT_ERROR_CODE = 77;

// Possible return values for the libFuzzer callback to continue or abort
// the fuzzer loop.
const int RETURN_CONTINUE = 0;
const int RETURN_EXIT = -2;
} // namespace libfuzzer
