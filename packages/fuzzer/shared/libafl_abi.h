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

constexpr std::size_t kCompareFeedbackMapSize = 1 << 16;
constexpr std::size_t kCompareLogEntryBytes = 32;
constexpr std::size_t kCompareLogMaxEntries = 1024;
constexpr std::size_t kFindingInfoArtifactBytes = 256;
constexpr std::size_t kFindingInfoSummaryBytes = 1024;

constexpr int kJazzerLibAflExecutionContinue = 0;
constexpr int kJazzerLibAflExecutionFinding = 1;
constexpr int kJazzerLibAflExecutionStop = 2;
constexpr int kJazzerLibAflExecutionFatal = 3;
constexpr int kJazzerLibAflExecutionTimeout = 4;

constexpr int kJazzerLibAflRuntimeOk = 0;
constexpr int kJazzerLibAflRuntimeFoundFinding = 1;
constexpr int kJazzerLibAflRuntimeStopped = 2;
constexpr int kJazzerLibAflRuntimeFatal = 3;
constexpr int kJazzerLibAflRuntimeFoundTimeout = 4;

enum class JazzerLibAflCompareKind : uint8_t {
  kInteger = 1,
  kStringEquality = 2,
  kStringContainment = 3,
};

extern "C" {
struct JazzerLibAflCompareLogEntry {
  uint8_t kind;
  uint8_t flags;
  uint8_t left_len;
  uint8_t right_len;
  uint64_t left_value;
  uint64_t right_value;
  uint8_t left_bytes[kCompareLogEntryBytes];
  uint8_t right_bytes[kCompareLogEntryBytes];
};

struct JazzerLibAflCompareLog {
  uint32_t used;
  uint32_t dropped;
  JazzerLibAflCompareLogEntry entries[kCompareLogMaxEntries];
};

struct JazzerLibAflFindingInfo {
  uint8_t has_value;
  char artifact[kFindingInfoArtifactBytes];
  char summary[kFindingInfoSummaryBytes];
};

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
  size_t edges_capacity;
  size_t *edges_size;
  uint8_t *cmp;
  size_t cmp_len;
  JazzerLibAflCompareLog *compare_log;
  JazzerLibAflFindingInfo *finding_info;
};

typedef int (*JazzerLibAflExecuteCallback)(void *user_data, const uint8_t *data,
                                           size_t size);

int jazzer_libafl_runtime_run(const JazzerLibAflRuntimeOptions *options,
                              const JazzerLibAflRuntimeSharedMaps *maps,
                              JazzerLibAflExecuteCallback execute_one,
                              void *user_data);
}

#if UINTPTR_MAX == UINT64_MAX
static_assert(sizeof(JazzerLibAflCompareLogEntry) == 88,
              "Unexpected JazzerLibAflCompareLogEntry layout");
static_assert(offsetof(JazzerLibAflCompareLogEntry, left_value) == 8,
              "Unexpected left_value offset");
static_assert(offsetof(JazzerLibAflCompareLogEntry, right_value) == 16,
              "Unexpected right_value offset");
static_assert(offsetof(JazzerLibAflCompareLogEntry, left_bytes) == 24,
              "Unexpected left_bytes offset");
static_assert(offsetof(JazzerLibAflCompareLogEntry, right_bytes) == 56,
              "Unexpected right_bytes offset");

static_assert(sizeof(JazzerLibAflCompareLog) == 90120,
              "Unexpected JazzerLibAflCompareLog layout");
static_assert(offsetof(JazzerLibAflCompareLog, entries) == 8,
              "Unexpected compare log entries offset");

static_assert(sizeof(JazzerLibAflFindingInfo) == 1281,
              "Unexpected JazzerLibAflFindingInfo layout");
static_assert(offsetof(JazzerLibAflFindingInfo, artifact) == 1,
              "Unexpected finding artifact offset");
static_assert(offsetof(JazzerLibAflFindingInfo, summary) == 257,
              "Unexpected finding summary offset");

static_assert(sizeof(JazzerLibAflRuntimeOptions) == 72,
              "Unexpected JazzerLibAflRuntimeOptions layout");
static_assert(offsetof(JazzerLibAflRuntimeOptions, corpus_directories) == 40,
              "Unexpected corpus_directories offset");
static_assert(offsetof(JazzerLibAflRuntimeOptions, dictionary_files) == 56,
              "Unexpected dictionary_files offset");

static_assert(sizeof(JazzerLibAflRuntimeSharedMaps) == 56,
              "Unexpected JazzerLibAflRuntimeSharedMaps layout");
static_assert(offsetof(JazzerLibAflRuntimeSharedMaps, cmp) == 24,
              "Unexpected cmp offset");
static_assert(offsetof(JazzerLibAflRuntimeSharedMaps, compare_log) == 40,
              "Unexpected compare_log offset");
static_assert(offsetof(JazzerLibAflRuntimeSharedMaps, finding_info) == 48,
              "Unexpected finding_info offset");
#endif
