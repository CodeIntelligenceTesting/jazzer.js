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

#include "libafl_options.h"

#include "shared/coverage.h"
#include "shared/tracing.h"

LibAflOptions ParseLibAflOptions(Napi::Env env, const Napi::Object &js_opts) {
  LibAflOptions parsed;

  const auto mode = js_opts.Get("mode");
  const auto runs = js_opts.Get("runs");
  const auto seed = js_opts.Get("seed");
  const auto max_len = js_opts.Get("maxLen");
  const auto timeout_millis = js_opts.Get("timeoutMillis");
  const auto max_total_time_seconds = js_opts.Get("maxTotalTimeSeconds");
  const auto artifact_prefix = js_opts.Get("artifactPrefix");
  const auto corpus_directories = js_opts.Get("corpusDirectories");
  const auto dictionary_files = js_opts.Get("dictionaryFiles");

  if (!mode.IsUndefined() && !mode.IsString()) {
    throw Napi::Error::New(
        env, "The LibAFL options object expects mode to be 'fuzzing' or "
             "'regression'");
  }

  if (!runs.IsNumber() || !seed.IsNumber() || !max_len.IsNumber() ||
      !timeout_millis.IsNumber() || !max_total_time_seconds.IsNumber() ||
      !artifact_prefix.IsString() || !corpus_directories.IsArray() ||
      !dictionary_files.IsArray()) {
    throw Napi::Error::New(
        env, "The LibAFL backend expects an options object with mode, runs, "
             "seed, maxLen, timeoutMillis, maxTotalTimeSeconds, "
             "artifactPrefix, corpusDirectories, and dictionaryFiles");
  }

  if (mode.IsString()) {
    const auto mode_value = mode.As<Napi::String>().Utf8Value();
    if (mode_value == "regression") {
      parsed.mode = LibAflOptions::Mode::kRegression;
    } else if (mode_value == "fuzzing") {
      parsed.mode = LibAflOptions::Mode::kFuzzing;
    } else {
      throw Napi::Error::New(
          env, "The LibAFL options object expects mode to be 'fuzzing' or "
               "'regression'");
    }
  }

  const auto runs_value = runs.As<Napi::Number>().Int64Value();
  const auto seed_value = seed.As<Napi::Number>().Int64Value();
  const auto max_len_value = max_len.As<Napi::Number>().Int64Value();
  const auto timeout_millis_value =
      timeout_millis.As<Napi::Number>().Int64Value();
  const auto max_total_time_seconds_value =
      max_total_time_seconds.As<Napi::Number>().Int64Value();

  if (runs_value < 0 || seed_value < 0 || max_len_value < 0 ||
      timeout_millis_value < 0 || max_total_time_seconds_value < 0) {
    throw Napi::Error::New(
        env, "The LibAFL options object does not allow negative values");
  }

  parsed.runs = static_cast<uint64_t>(runs_value);
  parsed.seed = static_cast<uint64_t>(seed_value);
  parsed.max_len = static_cast<size_t>(max_len_value);
  parsed.timeout_millis = static_cast<uint64_t>(timeout_millis_value);
  parsed.max_total_time_seconds =
      static_cast<uint64_t>(max_total_time_seconds_value);
  parsed.artifact_prefix = artifact_prefix.As<Napi::String>().Utf8Value();

  const auto dirs = corpus_directories.As<Napi::Array>();
  for (uint32_t i = 0; i < dirs.Length(); ++i) {
    auto dir = dirs.Get(i);
    if (!dir.IsString()) {
      throw Napi::Error::New(
          env, "LibAFL corpusDirectories entries must be strings");
    }
    parsed.corpus_directories.push_back(dir.As<Napi::String>().Utf8Value());
  }

  const auto dicts = dictionary_files.As<Napi::Array>();
  for (uint32_t i = 0; i < dicts.Length(); ++i) {
    auto dict = dicts.Get(i);
    if (!dict.IsString()) {
      throw Napi::Error::New(env,
                             "LibAFL dictionaryFiles entries must be strings");
    }
    parsed.dictionary_files.push_back(dict.As<Napi::String>().Utf8Value());
  }

  if (parsed.max_len == 0) {
    throw Napi::Error::New(env, "The LibAFL backend requires maxLen to be > 0");
  }
  if (parsed.timeout_millis == 0) {
    throw Napi::Error::New(
        env, "The LibAFL backend requires timeoutMillis to be > 0");
  }

  return parsed;
}

JazzerLibAflRuntimeSharedMaps
SharedMapsForLibAflRuntime(Napi::Env env,
                           JazzerLibAflFindingInfo *finding_info) {
  auto *edges = CoverageCounters();
  const auto edges_capacity = CoverageCountersCapacity();
  auto *edges_size = CoverageCountersSizePointer();
  auto *cmp = CompareFeedbackMap();
  const auto cmp_len = CompareFeedbackMapSize();
  auto *compare_log = CompareLog();

  if (edges == nullptr || edges_capacity == 0 || edges_size == nullptr ||
      cmp == nullptr || cmp_len == 0 || compare_log == nullptr ||
      finding_info == nullptr) {
    throw Napi::Error::New(
        env,
        "Coverage maps were not initialized before the LibAFL backend started");
  }

  return {edges,   edges_capacity, edges_size,  cmp,
          cmp_len, compare_log,    finding_info};
}
