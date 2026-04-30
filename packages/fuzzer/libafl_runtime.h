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
#include <napi.h>

#include "shared/tracing.h"

extern "C" {
struct JazzerLibAflRuntimeOptions {
  uint64_t runs;
  uint64_t seed;
  size_t max_len;
  uint64_t timeout_millis;
  uint64_t max_total_time_seconds;
  const char **corpus_directories;
  size_t corpus_directories_len;
  const char **dictionary_files;
  size_t dictionary_files_len;
};

struct JazzerLibAflRuntimeSharedMaps {
  uint8_t *edges;
  size_t edges_len;
  uint8_t *cmp;
  size_t cmp_len;
  JazzerLibAflCompareLog *compare_log;
};

typedef int (*JazzerLibAflExecuteCallback)(void *user_data, const uint8_t *data,
                                           size_t size);

int jazzer_libafl_runtime_run(const JazzerLibAflRuntimeOptions *options,
                              const JazzerLibAflRuntimeSharedMaps *maps,
                              JazzerLibAflExecuteCallback execute_one,
                              void *user_data);
}

Napi::Value StartLibAfl(const Napi::CallbackInfo &info);
Napi::Value StartLibAflAsync(const Napi::CallbackInfo &info);
