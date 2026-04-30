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

#include "tracing.h"

#include <algorithm>
#include <array>
#include <cstring>

// We expect these symbols to exist in the current plugin, provided either by
// libfuzzer or by the native agent.
extern "C" {
void __sanitizer_weak_hook_strcmp(void *called_pc, const char *s1,
                                  const char *s2, int result);
void __sanitizer_weak_hook_strstr(void *called_pc, const char *s1,
                                  const char *s2, const char *result);
void __sanitizer_cov_trace_const_cmp8_with_pc(uintptr_t called_pc,
                                              uint64_t arg1, uint64_t arg2);
void __sanitizer_cov_trace_pc_indir_with_pc(void *caller_pc, uintptr_t callee);
}

namespace {
constexpr std::size_t kCompareFeedbackMapSize = 1 << 16;
std::array<uint8_t, kCompareFeedbackMapSize> gCompareFeedbackMap{};

void RecordCompareFeedback(uint64_t value) {
  auto index = static_cast<std::size_t>(value % kCompareFeedbackMapSize);
  auto &slot = gCompareFeedbackMap[index];
  slot = slot == 255 ? 1 : static_cast<uint8_t>(slot + 1);
}

void RecordStringFeedback(uint64_t id, const std::string &first,
                          const std::string &second) {
  uint64_t hash = id * 0x9e3779b185ebca87ULL;
  const auto limit = std::min<std::size_t>({first.size(), second.size(), 32});
  hash ^= static_cast<uint64_t>(first.size()) << 32;
  hash ^= static_cast<uint64_t>(second.size()) << 1;
  for (std::size_t i = 0; i < limit; ++i) {
    hash ^= static_cast<uint64_t>(static_cast<unsigned char>(first[i]))
            << ((i % 8) * 8);
    hash ^= static_cast<uint64_t>(static_cast<unsigned char>(second[i]))
            << (((i + 3) % 8) * 8);
    RecordCompareFeedback(hash + i);
  }
  RecordCompareFeedback(hash);
}
} // namespace

// Record a comparison between two strings in the target that returned unequal.
void TraceUnequalStrings(const Napi::CallbackInfo &info) {
  if (info.Length() != 3) {
    throw Napi::Error::New(info.Env(),
                           "Need three arguments: the trace ID and the two "
                           "compared strings");
  }

  auto id = info[0].As<Napi::Number>().Int64Value();
  auto s1 = info[1].As<Napi::String>().Utf8Value();
  auto s2 = info[2].As<Napi::String>().Utf8Value();

  RecordStringFeedback(id, s1, s2);

  // strcmp returns zero on equality, and libfuzzer doesn't care about the
  // result beyond whether it's zero or not.
  __sanitizer_weak_hook_strcmp((void *)id, s1.c_str(), s2.c_str(), 1);
}

// Record a substring check to find the first occurrence of the byte string
// needle in the byte string pointed to by haystack
void TraceStringContainment(const Napi::CallbackInfo &info) {
  if (info.Length() != 3) {
    throw Napi::Error::New(
        info.Env(), "Need three arguments: the trace ID and the two strings");
  }

  auto id = info[0].As<Napi::Number>().Int64Value();
  auto needle = info[1].As<Napi::String>().Utf8Value();
  auto haystack = info[2].As<Napi::String>().Utf8Value();

  RecordStringFeedback(id, needle, haystack);

  // libFuzzer currently ignores the result, which allows us to simply pass a
  // valid but arbitrary pointer here instead of performing an actual strstr
  // operation.
  __sanitizer_weak_hook_strstr((void *)id, needle.c_str(), haystack.c_str(),
                               needle.c_str());
}

void TraceIntegerCompare(const Napi::CallbackInfo &info) {
  if (info.Length() != 3) {
    throw Napi::Error::New(
        info.Env(),
        "Need three arguments: the trace ID and the two compared numbers");
  }

  auto id = info[0].As<Napi::Number>().Int64Value();
  auto arg1 = info[1].As<Napi::Number>().Int64Value();
  auto arg2 = info[2].As<Napi::Number>().Int64Value();
  RecordCompareFeedback(static_cast<uint64_t>(id) ^ static_cast<uint64_t>(arg1) ^
                        (static_cast<uint64_t>(arg2) << 1));
  __sanitizer_cov_trace_const_cmp8_with_pc(id, arg1, arg2);
}

void TracePcIndir(const Napi::CallbackInfo &info) {
  if (info.Length() != 2) {
    throw Napi::Error::New(info.Env(),
                           "Need two arguments: the PC value & the trace ID");
  }

  auto id = info[0].As<Napi::Number>().Int64Value();
  auto state = info[1].As<Napi::Number>().Int64Value();
  RecordCompareFeedback(static_cast<uint64_t>(id) ^
                        (static_cast<uint64_t>(state) << 1));
  __sanitizer_cov_trace_pc_indir_with_pc((void *)id, state);
}

void ClearCompareFeedbackMap(const Napi::CallbackInfo &info) {
  if (info.Length() != 0) {
    throw Napi::Error::New(info.Env(), "This function does not accept arguments");
  }

  ClearCompareFeedbackMap();
}

Napi::Value CountNonZeroCompareFeedbackSlots(const Napi::CallbackInfo &info) {
  if (info.Length() != 0) {
    throw Napi::Error::New(info.Env(), "This function does not accept arguments");
  }

  const auto count = static_cast<double>(std::count_if(
      gCompareFeedbackMap.begin(), gCompareFeedbackMap.end(),
      [](uint8_t value) { return value != 0; }));
  return Napi::Number::New(info.Env(), count);
}

uint8_t *CompareFeedbackMap() { return gCompareFeedbackMap.data(); }

std::size_t CompareFeedbackMapSize() { return gCompareFeedbackMap.size(); }

void ClearCompareFeedbackMap() {
  std::memset(gCompareFeedbackMap.data(), 0, gCompareFeedbackMap.size());
}
