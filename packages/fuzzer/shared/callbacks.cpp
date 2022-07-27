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

#include "callbacks.h"
#include "coverage_tracker.h"

// We expect these symbols to exist in the current plugin, provided either by
// libfuzzer or by the native agent.
extern "C" {
void __sanitizer_weak_hook_strcmp(void *called_pc, const char *s1,
                                  const char *s2, int result);
void __sanitizer_cov_trace_const_cmp8_with_pc(uintptr_t called_pc,
                                              uint64_t arg1, uint64_t arg2);
}

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

  // strcmp returns zero on equality, and libfuzzer doesn't care about the
  // result beyond whether it's zero or not.
  __sanitizer_weak_hook_strcmp((void *)id, s1.c_str(), s2.c_str(), 1);
}

void TraceIntegerCompare(const Napi::CallbackInfo &info) {
  if (info.Length() != 3) {
    Napi::Error::New(
        info.Env(),
        "Need three arguments: the trace ID and the two compared numbers")
        .ThrowAsJavaScriptException();
  }

  auto id = info[0].As<Napi::Number>().Int64Value();
  auto arg1 = info[1].As<Napi::Number>().Int64Value();
  auto arg2 = info[2].As<Napi::Number>().Int64Value();
  __sanitizer_cov_trace_const_cmp8_with_pc(id, arg1, arg2);
}

void RegisterCallbackExports(Napi::Env env, Napi::Object exports) {
  exports["registerCoverageMap"] =
      Napi::Function::New<RegisterCoverageMap>(env);
  exports["registerNewCounters"] =
      Napi::Function::New<RegisterNewCounters>(env);
  exports["traceUnequalStrings"] =
      Napi::Function::New<TraceUnequalStrings>(env);
  exports["traceIntegerCompare"] =
      Napi::Function::New<TraceIntegerCompare>(env);
}
