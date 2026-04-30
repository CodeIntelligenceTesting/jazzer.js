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
#include <string>
#include <vector>

#include <napi.h>

#include "shared/libafl_abi.h"

struct LibAflOptions {
  enum class Mode {
    kFuzzing,
    kRegression,
  };

  Mode mode = Mode::kFuzzing;
  uint64_t runs = 0;
  uint64_t seed = 1;
  size_t max_len = 4096;
  uint64_t timeout_millis = 5000;
  uint64_t max_total_time_seconds = 0;
  std::string artifact_prefix;
  std::vector<std::string> corpus_directories;
  std::vector<std::string> dictionary_files;
};

LibAflOptions ParseLibAflOptions(Napi::Env env, const Napi::Object &js_opts);
JazzerLibAflRuntimeSharedMaps
SharedMapsForLibAflRuntime(Napi::Env env,
                           JazzerLibAflFindingInfo *finding_info);
