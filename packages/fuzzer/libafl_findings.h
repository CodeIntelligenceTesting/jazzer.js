// Copyright 2026 Code Intelligence GmbH
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

#pragma once

#include <cstddef>
#include <cstdint>

#include <exception>

#include <string>
#include <vector>

#include <napi.h>

#include "shared/libafl_abi.h"

void ClearFindingInfo(JazzerLibAflFindingInfo *finding_info);
std::string DescribeJsError(Napi::Env env, const Napi::Value &error);
std::string DescribeTimeout(uint64_t timeout_millis);
void RecordFindingInfo(JazzerLibAflFindingInfo *finding_info,
                       const std::string &artifact, const std::string &summary);
std::string WriteArtifact(const std::string &artifact_prefix,
                          const std::string &kind, const uint8_t *data,
                          size_t size, bool emit_info = true);
[[noreturn]] void ExitOnTimeout(JazzerLibAflFindingInfo *finding_info,
                                uint64_t timeout_millis,
                                const std::string &artifact_prefix,
                                const std::vector<uint8_t> &input);
[[noreturn]] void ExitWithUnexpectedError(const std::exception &exception);
