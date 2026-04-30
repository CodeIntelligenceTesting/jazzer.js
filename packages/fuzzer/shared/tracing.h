// Copyright 2022 Code Intelligence GmbH
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

constexpr std::size_t kCompareFeedbackMapSize = 1 << 16;
constexpr std::size_t kCompareLogEntryBytes = 32;
constexpr std::size_t kCompareLogMaxEntries = 1024;

enum class JazzerLibAflCompareKind : uint8_t {
  kInteger = 1,
  kStringEquality = 2,
  kStringContainment = 3,
};

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

void TraceUnequalStrings(const Napi::CallbackInfo &info);
void TraceStringContainment(const Napi::CallbackInfo &info);
void TraceIntegerCompare(const Napi::CallbackInfo &info);
void TracePcIndir(const Napi::CallbackInfo &info);

void ClearCompareFeedbackMap(const Napi::CallbackInfo &info);
Napi::Value CountNonZeroCompareFeedbackSlots(const Napi::CallbackInfo &info);
Napi::Value CountCompareLogEntries(const Napi::CallbackInfo &info);
Napi::Value CountDroppedCompareLogEntries(const Napi::CallbackInfo &info);

uint8_t *CompareFeedbackMap();
std::size_t CompareFeedbackMapSize();
void ClearCompareFeedbackMap();
JazzerLibAflCompareLog *CompareLog();
void ClearCompareLog();
