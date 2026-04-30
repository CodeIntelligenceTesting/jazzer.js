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

#include "libafl_runtime.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cctype>
#include <chrono>
#include <condition_variable>
#include <csetjmp>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <functional>
#include <future>
#include <iomanip>
#include <iostream>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <system_error>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <io.h>
#include <process.h>
#define GetPID _getpid
#else
#include <unistd.h>
#define GetPID getpid
#endif

#include "shared/coverage.h"
#include "shared/libfuzzer.h"
#include "shared/tracing.h"
#include "utils.h"

namespace {
constexpr int kExecutionContinue = 0;
constexpr int kExecutionFinding = 1;
constexpr int kExecutionStop = 2;
constexpr int kExecutionFatal = 3;
constexpr int kExecutionTimeout = 4;

constexpr int kRuntimeOk = 0;
constexpr int kRuntimeFoundFinding = 1;
constexpr int kRuntimeStopped = 2;
constexpr int kRuntimeFatal = 3;
constexpr int kRuntimeFoundTimeout = 4;

struct ParsedRuntimeOptions {
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

std::string FormatDuration(std::chrono::steady_clock::duration duration) {
  const auto total_seconds =
      std::chrono::duration_cast<std::chrono::seconds>(duration).count();
  const auto hours = total_seconds / 3600;
  const auto minutes = (total_seconds % 3600) / 60;
  const auto seconds = total_seconds % 60;

  std::ostringstream stream;
  if (hours > 0) {
    stream << hours << "h " << minutes << "m " << seconds << "s";
  } else if (minutes > 0) {
    stream << minutes << "m " << seconds << "s";
  } else {
    stream << seconds << "s";
  }
  return stream.str();
}

std::string FormatRunLimit(uint64_t runs) {
  if (runs == 0) {
    return "unlimited";
  }

  return std::to_string(runs);
}

std::string FormatTotalTimeLimit(uint64_t max_total_time_seconds) {
  if (max_total_time_seconds == 0) {
    return "unlimited";
  }

  return FormatDuration(std::chrono::seconds(max_total_time_seconds));
}

bool ShouldColorizeOutput() {
  if (std::getenv("NO_COLOR") != nullptr) {
    return false;
  }

  const auto *term = std::getenv("TERM");
  if (term != nullptr && std::string(term) == "dumb") {
    return false;
  }

#ifdef _WIN32
  return _isatty(_fileno(stderr)) != 0;
#else
  return isatty(fileno(stderr)) != 0;
#endif
}

std::string StartMarker() {
  if (!ShouldColorizeOutput()) {
    return "[>]";
  }

  return "\x1b[34m[>]\x1b[0m";
}

std::string FormatInitedField(const std::string &label,
                              const std::string &value) {
  const auto first = value.find_first_not_of(' ');
  const auto trimmed = first == std::string::npos
                           ? std::string_view("")
                           : std::string_view(value).substr(first);
  std::ostringstream stream;
  stream << "    " << std::left << std::setw(15) << label << ' ' << trimmed;
  return stream.str();
}

std::string EmptyEdgesMetric() { return "   -/   - (  -%)"; }

void PrintRegressionStart(const ParsedRuntimeOptions &options,
                          size_t replay_inputs) {
  std::cerr
      << StartMarker() << " INITED\n"
      << FormatInitedField("mode:", "regression") << '\n'
      << FormatInitedField("seed:", std::to_string(options.seed)) << '\n'
      << FormatInitedField("loaded_inputs:", std::to_string(replay_inputs))
      << '\n'
      << FormatInitedField("edges:", EmptyEdgesMetric()) << '\n'
      << FormatInitedField("timeout:",
                           std::to_string(options.timeout_millis) + " ms")
      << '\n'
      << FormatInitedField("max_len:", std::to_string(options.max_len)) << '\n'
      << FormatInitedField("runs:", FormatRunLimit(options.runs)) << '\n'
      << FormatInitedField("max_total_time:",
                           FormatTotalTimeLimit(options.max_total_time_seconds))
      << std::endl;
}

void PrintRegressionDone(std::chrono::steady_clock::time_point started_at,
                         uint64_t executions, size_t replay_inputs) {
  const auto elapsed = std::chrono::steady_clock::now() - started_at;
  const auto elapsed_seconds = std::chrono::duration<double>(elapsed).count();
  const auto execs_per_sec = elapsed_seconds > 0.0
                                 ? executions / elapsed_seconds
                                 : static_cast<double>(executions);

  std::cerr << "[libafl::done] mode: regression, run time: "
            << FormatDuration(elapsed) << ", replay_inputs: " << replay_inputs
            << ", executions: " << executions
            << ", exec/sec: " << static_cast<uint64_t>(execs_per_sec)
            << std::endl;
}

struct SyncWatchdogState {
  std::thread thread;
  std::mutex mutex;
  std::condition_variable cv;
  bool should_stop = false;
  bool execution_armed = false;
  std::chrono::steady_clock::time_point deadline;
  std::vector<uint8_t> current_input;
};

struct SyncFuzzTargetContext {
  SyncFuzzTargetContext(Napi::Env env, Napi::Function target,
                        Napi::Function js_stop_callback,
                        ParsedRuntimeOptions options)
      : env(env), target(target), is_resolved(false),
        deferred(Napi::Promise::Deferred::New(env)),
        js_stop_callback(js_stop_callback), options(std::move(options)) {}

  Napi::Env env;
  Napi::Function target;
  bool is_resolved;
  Napi::Promise::Deferred deferred;
  Napi::Function js_stop_callback;
  ParsedRuntimeOptions options;
  SyncWatchdogState watchdog;
  volatile std::sig_atomic_t signal_status = 0;
  volatile int sigints = 0;
  std::jmp_buf execution_context;
};

struct AsyncExecutionState {
  std::promise<int> promise;
  std::atomic<bool> settled = false;
};

struct AsyncDataType {
  std::vector<uint8_t> data;
  std::shared_ptr<AsyncExecutionState> state;

  AsyncDataType() = delete;
};

struct AsyncFuzzTargetContext {
  explicit AsyncFuzzTargetContext(Napi::Env env, ParsedRuntimeOptions options)
      : deferred(Napi::Promise::Deferred::New(env)),
        options(std::move(options)) {}

  std::thread native_thread;
  Napi::Promise::Deferred deferred;
  ParsedRuntimeOptions options;
  bool is_resolved = false;
  bool is_done_called = false;
  int run_status = kRuntimeOk;
  volatile int sigints = 0;
  std::jmp_buf execution_context;
};

using AsyncFinalizerDataType = void;
void CallJsFuzzCallback(Napi::Env env, Napi::Function js_fuzz_callback,
                        AsyncFuzzTargetContext *context, AsyncDataType *data);
using AsyncTsfn =
    Napi::TypedThreadSafeFunction<AsyncFuzzTargetContext, AsyncDataType,
                                  CallJsFuzzCallback>;

SyncFuzzTargetContext *gActiveSyncContext = nullptr;
AsyncFuzzTargetContext *gActiveAsyncContext = nullptr;
AsyncTsfn gAsyncTsfn;
JazzerLibAflFindingInfo gFindingInfo{};

void ClearFindingInfo() { std::memset(&gFindingInfo, 0, sizeof(gFindingInfo)); }

void CopyFindingField(char *destination, size_t destination_size,
                      const std::string &value) {
  if (destination == nullptr || destination_size == 0) {
    return;
  }

  std::memset(destination, 0, destination_size);
  const auto copied = std::min(destination_size - 1, value.size());
  if (copied > 0) {
    std::memcpy(destination, value.data(), copied);
  }
}

std::string CollapseWhitespace(const std::string &value) {
  std::string collapsed;
  collapsed.reserve(value.size());

  bool previous_was_space = false;
  for (const auto character : value) {
    if (std::isspace(static_cast<unsigned char>(character)) != 0) {
      if (!collapsed.empty() && !previous_was_space) {
        collapsed.push_back(' ');
      }
      previous_was_space = true;
      continue;
    }

    collapsed.push_back(character);
    previous_was_space = false;
  }

  if (!collapsed.empty() && collapsed.back() == ' ') {
    collapsed.pop_back();
  }

  return collapsed;
}

std::string TrimStackFrame(const std::string &frame) {
  const auto first = frame.find_first_not_of(" \t");
  if (first == std::string::npos) {
    return "";
  }

  auto trimmed = frame.substr(first);
  constexpr char kAtPrefix[] = "at ";
  if (trimmed.rfind(kAtPrefix, 0) == 0) {
    trimmed.erase(0, sizeof(kAtPrefix) - 1);
  }

  if (!trimmed.empty() && trimmed.back() == ')') {
    const auto open_paren = trimmed.rfind('(');
    if (open_paren != std::string::npos && open_paren + 1 < trimmed.size()) {
      return trimmed.substr(open_paren + 1, trimmed.size() - open_paren - 2);
    }
  }

  return trimmed;
}

std::string DescribeJsError(Napi::Env env, const Napi::Value &error) {
  std::string summary = error.ToString().Utf8Value();
  if (!error.IsObject()) {
    return CollapseWhitespace(summary);
  }

  const auto stack_value = error.As<Napi::Object>().Get("stack");
  if (!stack_value.IsString()) {
    return CollapseWhitespace(summary);
  }

  std::istringstream stream(stack_value.As<Napi::String>().Utf8Value());
  std::string line;
  std::getline(stream, line);
  while (std::getline(stream, line)) {
    const auto frame = TrimStackFrame(line);
    if (frame.empty()) {
      continue;
    }
    summary.append(" in ").append(frame);
    break;
  }

  return CollapseWhitespace(summary);
}

void RecordFindingInfo(const std::string &artifact,
                       const std::string &summary) {
  gFindingInfo.has_value = 1;
  CopyFindingField(gFindingInfo.artifact, sizeof(gFindingInfo.artifact),
                   artifact);
  CopyFindingField(gFindingInfo.summary, sizeof(gFindingInfo.summary), summary);
}

std::string DigestInput(const uint8_t *data, size_t size) {
  uint64_t hash = 1469598103934665603ULL;
  for (size_t i = 0; i < size; ++i) {
    hash ^= static_cast<uint64_t>(data[i]);
    hash *= 1099511628211ULL;
  }

  std::array<uint32_t, 5> words{};
  for (auto &word : words) {
    hash ^= hash >> 33;
    hash *= 0xff51afd7ed558ccdULL;
    hash ^= hash >> 33;
    hash *= 0xc4ceb9fe1a85ec53ULL;
    hash ^= hash >> 33;
    word = static_cast<uint32_t>(hash);
  }

  std::ostringstream stream;
  stream << std::hex << std::setfill('0');
  for (const auto word : words) {
    stream << std::setw(8) << word;
  }
  return stream.str();
}

std::filesystem::path ArtifactPath(const std::string &artifact_prefix,
                                   const std::string &kind,
                                   const std::string &digest) {
  const auto filename = kind + "-" + digest;

  if (artifact_prefix.empty()) {
    return std::filesystem::current_path() / filename;
  }

  const auto has_directory_semantics =
      artifact_prefix.back() == '/' || artifact_prefix.back() == '\\';
  std::filesystem::path prefix_path(artifact_prefix);
  if (has_directory_semantics || (std::filesystem::exists(prefix_path) &&
                                  std::filesystem::is_directory(prefix_path))) {
    return prefix_path / filename;
  }

  return std::filesystem::path(artifact_prefix + filename);
}

std::string WriteArtifact(const std::string &artifact_prefix,
                          const std::string &kind, const uint8_t *data,
                          size_t size, bool emit_info = true) {
  if (data == nullptr && size != 0) {
    return "";
  }

  try {
    const auto digest = DigestInput(data, size);
    const auto artifact_path = ArtifactPath(artifact_prefix, kind, digest);

    if (!artifact_path.parent_path().empty()) {
      std::filesystem::create_directories(artifact_path.parent_path());
    }

    std::ofstream output(artifact_path,
                         std::ios::binary | std::ios::out | std::ios::trunc);
    if (!output.is_open()) {
      std::cerr << "ERROR: Failed to open artifact file '"
                << artifact_path.string() << "'" << std::endl;
      return "";
    }

    if (size > 0) {
      output.write(reinterpret_cast<const char *>(data),
                   static_cast<std::streamsize>(size));
    }
    if (!output.good()) {
      std::cerr << "ERROR: Failed to write artifact file '"
                << artifact_path.string() << "'" << std::endl;
      return "";
    }

    if (emit_info) {
      std::cerr << "INFO: Wrote " << kind << " input to "
                << artifact_path.string() << std::endl;
    }
    return artifact_path.filename().string();
  } catch (const std::exception &exception) {
    std::cerr << "ERROR: Failed to persist " << kind
              << " artifact: " << exception.what() << std::endl;
    return "";
  }
}

[[noreturn]] void ExitOnTimeout(uint64_t timeout_millis,
                                const std::string &artifact_prefix,
                                const std::vector<uint8_t> &input) {
  std::cerr << "ERROR: Exceeded timeout of " << timeout_millis
            << " ms for one fuzz target execution." << std::endl;
  WriteArtifact(artifact_prefix, "timeout", input.data(), input.size());
  _Exit(libfuzzer::EXIT_ERROR_TIMEOUT);
}

[[noreturn]] void ExitWithUnexpectedError(const std::exception &exception) {
  std::cerr << "==" << static_cast<unsigned long>(GetPID())
            << "== Jazzer.js: Unexpected Error: " << exception.what()
            << std::endl;
  libfuzzer::PrintCrashingInput();
  _Exit(libfuzzer::EXIT_ERROR_CODE);
}

void RejectDeferredIfNeeded(AsyncFuzzTargetContext *context,
                            const Napi::Value &error) {
  if (context->is_resolved) {
    return;
  }
  context->deferred.Reject(error);
  context->is_resolved = true;
}

bool TrySetExecutionStatus(const std::shared_ptr<AsyncExecutionState> &state,
                           int status) {
  bool expected = false;
  if (!state->settled.compare_exchange_strong(expected, true,
                                              std::memory_order_acq_rel,
                                              std::memory_order_acquire)) {
    return false;
  }
  state->promise.set_value(status);
  return true;
}

void ReportAsyncFinding(AsyncFuzzTargetContext *context, Napi::Env env,
                        const std::shared_ptr<AsyncExecutionState> &state,
                        const Napi::Value &error,
                        const std::vector<uint8_t> &input) {
  if (TrySetExecutionStatus(state, kExecutionFinding)) {
    const auto artifact =
        WriteArtifact(context->options.artifact_prefix, "crash", input.data(),
                      input.size(), false);
    RecordFindingInfo(artifact, DescribeJsError(env, error));
  }
  RejectDeferredIfNeeded(context, error);
}

ParsedRuntimeOptions ParseRuntimeOptions(Napi::Env env,
                                         const Napi::Object &js_opts) {
  ParsedRuntimeOptions parsed;

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
      parsed.mode = ParsedRuntimeOptions::Mode::kRegression;
    } else if (mode_value == "fuzzing") {
      parsed.mode = ParsedRuntimeOptions::Mode::kFuzzing;
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

JazzerLibAflRuntimeSharedMaps SharedMapsForRuntime(Napi::Env env) {
  auto *edges = CoverageCounters();
  const auto edges_capacity = CoverageCountersCapacity();
  auto *edges_size = CoverageCountersSizePointer();
  auto *cmp = CompareFeedbackMap();
  const auto cmp_len = CompareFeedbackMapSize();
  auto *compare_log = CompareLog();
  auto *finding_info = &gFindingInfo;

  if (edges == nullptr || edges_capacity == 0 || edges_size == nullptr ||
      cmp == nullptr || cmp_len == 0 || compare_log == nullptr ||
      finding_info == nullptr) {
    throw Napi::Error::New(
        env,
        "Coverage maps were not initialized before the LibAFL backend started");
  }

  return {edges, edges_capacity, edges_size, cmp,
          cmp_len, compare_log, finding_info};
}

bool CollectRegressionCorpusFiles(
    const std::vector<std::string> &corpus_directories,
    std::vector<std::filesystem::path> *files) {
  for (const auto &directory : corpus_directories) {
    const std::filesystem::path directory_path(directory);
    std::error_code error;

    if (!std::filesystem::exists(directory_path, error)) {
      if (error) {
        std::cerr << "[libafl] fatal: failed to access corpus directory '"
                  << directory_path.string() << "': " << error.message()
                  << std::endl;
      } else {
        std::cerr << "[libafl] fatal: corpus directory does not exist: '"
                  << directory_path.string() << "'" << std::endl;
      }
      return false;
    }

    if (!std::filesystem::is_directory(directory_path, error)) {
      if (error) {
        std::cerr << "[libafl] fatal: failed to inspect corpus directory '"
                  << directory_path.string() << "': " << error.message()
                  << std::endl;
      } else {
        std::cerr << "[libafl] fatal: corpus path is not a directory: '"
                  << directory_path.string() << "'" << std::endl;
      }
      return false;
    }

    std::filesystem::recursive_directory_iterator iterator(
        directory_path,
        std::filesystem::directory_options::skip_permission_denied, error);
    const auto end = std::filesystem::recursive_directory_iterator();
    if (error) {
      std::cerr << "[libafl] fatal: failed to iterate corpus directory '"
                << directory_path.string() << "': " << error.message()
                << std::endl;
      return false;
    }

    for (; iterator != end; iterator.increment(error)) {
      if (error) {
        std::cerr << "[libafl] fatal: failed to iterate corpus directory '"
                  << directory_path.string() << "': " << error.message()
                  << std::endl;
        return false;
      }

      const auto is_regular_file = iterator->is_regular_file(error);
      if (error) {
        std::cerr << "[libafl] fatal: failed to inspect corpus entry '"
                  << iterator->path().string() << "': " << error.message()
                  << std::endl;
        return false;
      }
      if (is_regular_file) {
        files->push_back(iterator->path());
      }
    }
  }

  std::sort(files->begin(), files->end());
  return true;
}

bool ReadRegressionInput(const std::filesystem::path &file_path, size_t max_len,
                         std::vector<uint8_t> *input) {
  input->clear();
  std::ifstream stream(file_path, std::ios::binary);
  if (!stream.is_open()) {
    std::cerr << "[libafl] fatal: failed to open corpus input '"
              << file_path.string() << "'" << std::endl;
    return false;
  }

  constexpr size_t kChunkSize = 4096;
  std::array<char, kChunkSize> buffer{};
  while (stream.good() && input->size() < max_len) {
    const auto remaining = max_len - input->size();
    const auto to_read = static_cast<std::streamsize>(
        std::min<size_t>(remaining, buffer.size()));
    stream.read(buffer.data(), to_read);
    const auto bytes_read = stream.gcount();
    if (bytes_read <= 0) {
      break;
    }
    input->insert(input->end(), buffer.begin(), buffer.begin() + bytes_read);
  }

  if (stream.bad()) {
    std::cerr << "[libafl] fatal: failed to read corpus input '"
              << file_path.string() << "'" << std::endl;
    return false;
  }

  return true;
}

bool ReachedMaxTotalTime(const ParsedRuntimeOptions &options,
                         std::chrono::steady_clock::time_point started_at) {
  if (options.max_total_time_seconds == 0) {
    return false;
  }
  return std::chrono::steady_clock::now() - started_at >=
         std::chrono::seconds(options.max_total_time_seconds);
}

int ReplayRegressionInputs(
    const ParsedRuntimeOptions &options,
    const std::function<int(const uint8_t *, size_t)> &execute_one) {
  std::vector<std::filesystem::path> corpus_files;
  if (!CollectRegressionCorpusFiles(options.corpus_directories,
                                    &corpus_files)) {
    return kRuntimeFatal;
  }

  const auto started_at = std::chrono::steady_clock::now();
  const auto replay_inputs = corpus_files.size() + 1;
  uint64_t executions = 0;
  static constexpr uint8_t kEmptyInputByte = 0;
  std::vector<uint8_t> current_input;

  PrintRegressionStart(options, replay_inputs);

  auto execute_input = [&](const uint8_t *data, size_t size) -> int {
    if (options.runs != 0 && executions >= options.runs) {
      return kRuntimeOk;
    }
    if (ReachedMaxTotalTime(options, started_at)) {
      return kRuntimeStopped;
    }

    const auto status = execute_one(data, size);
    executions++;
    switch (status) {
    case kExecutionContinue:
      return kRuntimeOk;
    case kExecutionFinding:
      return kRuntimeFoundFinding;
    case kExecutionStop:
      return kRuntimeStopped;
    case kExecutionFatal:
      return kRuntimeFatal;
    case kExecutionTimeout:
      return kRuntimeFoundTimeout;
    default:
      std::cerr << "[libafl] fatal: unknown execution status: " << status
                << std::endl;
      return kRuntimeFatal;
    }
  };

  auto status = execute_input(&kEmptyInputByte, 0);
  if (status != kRuntimeOk) {
    if (status == kRuntimeStopped) {
      PrintRegressionDone(started_at, executions, replay_inputs);
    }
    return status;
  }

  for (const auto &file_path : corpus_files) {
    if (!ReadRegressionInput(file_path, options.max_len, &current_input)) {
      return kRuntimeFatal;
    }

    const auto *data =
        current_input.empty() ? &kEmptyInputByte : current_input.data();
    status = execute_input(data, current_input.size());
    if (status != kRuntimeOk) {
      if (status == kRuntimeStopped) {
        PrintRegressionDone(started_at, executions, replay_inputs);
      }
      return status;
    }
  }

  PrintRegressionDone(started_at, executions, replay_inputs);
  return kRuntimeOk;
}

void StartSyncWatchdog(SyncFuzzTargetContext *context) {
  if (context->options.timeout_millis == 0) {
    return;
  }

  context->watchdog.thread = std::thread([context]() {
    auto &watchdog = context->watchdog;
    std::unique_lock<std::mutex> lock(watchdog.mutex);
    while (true) {
      watchdog.cv.wait(lock, [&watchdog] {
        return watchdog.should_stop || watchdog.execution_armed;
      });

      if (watchdog.should_stop) {
        return;
      }

      const auto deadline = watchdog.deadline;
      const auto resumed =
          watchdog.cv.wait_until(lock, deadline, [&watchdog, deadline] {
            return watchdog.should_stop || !watchdog.execution_armed ||
                   watchdog.deadline != deadline;
          });
      if (resumed) {
        if (watchdog.should_stop) {
          return;
        }
        continue;
      }

      auto timed_out_input = watchdog.current_input;
      lock.unlock();
      ExitOnTimeout(context->options.timeout_millis,
                    context->options.artifact_prefix, timed_out_input);
    }
  });
}

void ArmSyncWatchdog(SyncFuzzTargetContext *context, const uint8_t *data,
                     size_t size) {
  if (context->options.timeout_millis == 0) {
    return;
  }

  auto &watchdog = context->watchdog;
  std::lock_guard<std::mutex> lock(watchdog.mutex);
  watchdog.current_input.assign(data, data + size);
  watchdog.deadline =
      std::chrono::steady_clock::now() +
      std::chrono::milliseconds(context->options.timeout_millis);
  watchdog.execution_armed = true;
  watchdog.cv.notify_one();
}

void DisarmSyncWatchdog(SyncFuzzTargetContext *context) {
  if (context->options.timeout_millis == 0) {
    return;
  }

  auto &watchdog = context->watchdog;
  std::lock_guard<std::mutex> lock(watchdog.mutex);
  watchdog.execution_armed = false;
  watchdog.current_input.clear();
  watchdog.cv.notify_one();
}

void StopSyncWatchdog(SyncFuzzTargetContext *context) {
  if (context->options.timeout_millis == 0) {
    return;
  }

  auto &watchdog = context->watchdog;
  {
    std::lock_guard<std::mutex> lock(watchdog.mutex);
    watchdog.should_stop = true;
    watchdog.execution_armed = false;
  }
  watchdog.cv.notify_one();
  if (watchdog.thread.joinable()) {
    watchdog.thread.join();
  }
}

class ScopedSyncWatchdog {
public:
  ScopedSyncWatchdog(SyncFuzzTargetContext *context, const uint8_t *data,
                     size_t size)
      : context_(context) {
    ArmSyncWatchdog(context_, data, size);
  }

  ~ScopedSyncWatchdog() { DisarmSyncWatchdog(context_); }

private:
  SyncFuzzTargetContext *context_;
};

void SyncSigintHandler(int signum) {
  std::cerr << std::endl;
  gActiveSyncContext->signal_status = signum;
  if (gActiveSyncContext->sigints > 0) {
    _Exit(libfuzzer::RETURN_CONTINUE);
  }
  gActiveSyncContext->sigints++;
}

void SyncErrorSignalHandler(int signum) {
  gActiveSyncContext->signal_status = signum;
  std::longjmp(gActiveSyncContext->execution_context, signum);
}

int ExecuteSyncInput(void *user_data, const uint8_t *data, size_t size) {
  auto *context = static_cast<SyncFuzzTargetContext *>(user_data);
  auto scope = Napi::HandleScope(context->env);
  ScopedSyncWatchdog watchdog(context, data, size);

  ClearCoverageCounters();
  ClearCompareFeedbackMap();

  try {
    auto buffer = Napi::Buffer<uint8_t>::Copy(context->env, data, size);
    if (setjmp(context->execution_context) == 0) {
      auto result = context->target.Call({buffer});
      if (result.IsPromise()) {
        AsyncReturnsHandler();
      } else {
        SyncReturnsHandler();
      }
    }
  } catch (const Napi::Error &error) {
    if (!context->is_resolved) {
      const auto artifact = WriteArtifact(context->options.artifact_prefix,
                                          "crash", data, size, false);
      RecordFindingInfo(artifact, DescribeJsError(context->env, error.Value()));
      context->is_resolved = true;
      context->deferred.Reject(error.Value());
    }
    return kExecutionFinding;
  } catch (const std::exception &exception) {
    ExitWithUnexpectedError(exception);
  }

  if (context->signal_status != 0) {
    if (context->signal_status == SIGSEGV) {
      std::cerr << "==" << static_cast<unsigned long>(GetPID())
                << "== Segmentation Fault" << std::endl;
      libfuzzer::PrintCrashingInput();
      _Exit(libfuzzer::EXIT_ERROR_SEGV);
    }

    auto exit_code = Napi::Number::New(context->env, 0);
    if (context->signal_status != SIGINT) {
      exit_code = Napi::Number::New(context->env, context->signal_status);
    }

    context->js_stop_callback.Call({exit_code});
    context->signal_status = 0;
    return kExecutionStop;
  }

  return kExecutionContinue;
}

void CallJsFuzzCallback(Napi::Env env, Napi::Function js_fuzz_callback,
                        AsyncFuzzTargetContext *context, AsyncDataType *input) {
  auto state = input->state;
  const auto current_input = input->data;

  try {
    if (context->sigints > 0) {
      TrySetExecutionStatus(state, kExecutionStop);
      context->deferred.Resolve(env.Undefined());
      context->is_resolved = true;
      return;
    }

    if (setjmp(context->execution_context) == SIGSEGV) {
      std::cerr << "==" << static_cast<unsigned long>(GetPID())
                << "== Segmentation Fault" << std::endl;
      libfuzzer::PrintCrashingInput();
      _Exit(libfuzzer::EXIT_ERROR_SEGV);
    }

    if (env == nullptr) {
      TrySetExecutionStatus(state, kExecutionFatal);
      return;
    }

    auto buffer = Napi::Buffer<uint8_t>::Copy(env, current_input.data(),
                                              current_input.size());
    auto parameter_count = js_fuzz_callback.As<Napi::Object>()
                               .Get("length")
                               .As<Napi::Number>()
                               .Int32Value();

    if (parameter_count > 1) {
      context->is_done_called = false;
      auto done = Napi::Function::New(env, [=](const Napi::CallbackInfo &info) {
        if (context->is_resolved) {
          return;
        }

        if (context->is_done_called) {
          auto error =
              Napi::Error::New(env, "Expected done to be called once, but it "
                                    "was called multiple times.")
                  .Value();
          ReportAsyncFinding(context, env, state, error, current_input);
          return;
        }

        context->is_done_called = true;
        const auto has_error =
            info.Length() > 0 && !(info[0].IsNull() || info[0].IsUndefined());
        if (has_error) {
          auto error = info[0];
          if (!error.IsObject()) {
            error = Napi::Error::New(env, error.ToString()).Value();
          }
          ReportAsyncFinding(context, env, state, error, current_input);
        } else {
          TrySetExecutionStatus(state, kExecutionContinue);
        }
      });

      auto result = js_fuzz_callback.Call({buffer, done});
      if (result.IsPromise()) {
        AsyncReturnsHandler();
        auto error =
            Napi::Error::New(env, "Internal fuzzer error - Either async or "
                                  "done callback based fuzz tests allowed.")
                .Value();
        ReportAsyncFinding(context, env, state, error, current_input);
      } else {
        SyncReturnsHandler();
      }
      return;
    }

    auto result = js_fuzz_callback.Call({buffer});
    if (result.IsPromise()) {
      AsyncReturnsHandler();
      auto js_promise = result.As<Napi::Object>();
      auto then = js_promise.Get("then").As<Napi::Function>();
      then.Call(js_promise,
                {Napi::Function::New(env,
                                     [=](const Napi::CallbackInfo &) {
                                       TrySetExecutionStatus(
                                           state, kExecutionContinue);
                                     }),
                 Napi::Function::New(env, [=](const Napi::CallbackInfo &info) {
                   auto error =
                       info.Length() > 0
                           ? info[0]
                           : Napi::Error::New(env, "Unknown promise rejection")
                                 .Value();
                   if (!error.IsObject()) {
                     error = Napi::Error::New(env, error.ToString()).Value();
                   }
                   ReportAsyncFinding(context, env, state, error,
                                      current_input);
                 })});
    } else {
      SyncReturnsHandler();
      TrySetExecutionStatus(state, kExecutionContinue);
    }
  } catch (const Napi::Error &error) {
    ReportAsyncFinding(context, env, state, error.Value(), current_input);
  } catch (const std::exception &exception) {
    TrySetExecutionStatus(state, kExecutionFatal);
    auto message =
        std::string("Internal fuzzer error - ").append(exception.what());
    RejectDeferredIfNeeded(context, Napi::Error::New(env, message).Value());
  }
}

void AsyncSigintHandler(int signum) {
  std::cerr << std::endl;
  if (gActiveAsyncContext->sigints > 0) {
    _Exit(libfuzzer::RETURN_CONTINUE);
  }
  gActiveAsyncContext->sigints = signum;
}

void AsyncErrorSignalHandler(int signum) {
  std::longjmp(gActiveAsyncContext->execution_context, signum);
}

int ExecuteAsyncInput(void *user_data, const uint8_t *data, size_t size) {
  auto *context = static_cast<AsyncFuzzTargetContext *>(user_data);

  ClearCoverageCounters();
  ClearCompareFeedbackMap();

  auto execution_state = std::make_shared<AsyncExecutionState>();
  auto *input = new AsyncDataType{
      std::vector<uint8_t>(data, data + size),
      execution_state,
  };

  auto future = execution_state->promise.get_future();
  auto status = gAsyncTsfn.BlockingCall(input);
  if (status != napi_ok) {
    delete input;
    Napi::Error::Fatal("StartLibAflAsync",
                       "TypedThreadSafeFunction.BlockingCall() failed");
  }

  if (context->options.timeout_millis > 0) {
    auto timeout = std::chrono::milliseconds(context->options.timeout_millis);
    if (future.wait_for(timeout) == std::future_status::timeout) {
      ExitOnTimeout(context->options.timeout_millis,
                    context->options.artifact_prefix, input->data);
    }
  }

  try {
    auto result = future.get();
    delete input;
    return result;
  } catch (const std::exception &exception) {
    delete input;
    ExitWithUnexpectedError(exception);
  }
}
} // namespace

Napi::Value StartLibAfl(const Napi::CallbackInfo &info) {
  if (info.Length() != 3 || !info[0].IsFunction() || !info[1].IsObject() ||
      !info[2].IsFunction()) {
    throw Napi::Error::New(
        info.Env(),
        "Need three arguments, which must be the fuzz target function, a "
        "LibAFL options object, and a stop callback");
  }

  auto options = ParseRuntimeOptions(info.Env(), info[1].As<Napi::Object>());
  auto maps = SharedMapsForRuntime(info.Env());

  SyncFuzzTargetContext context(info.Env(), info[0].As<Napi::Function>(),
                                info[2].As<Napi::Function>(),
                                std::move(options));
  gActiveSyncContext = &context;

  StartSyncWatchdog(&context);
  signal(SIGINT, SyncSigintHandler);
  signal(SIGSEGV, SyncErrorSignalHandler);

  auto status = kRuntimeOk;
  if (context.options.mode == ParsedRuntimeOptions::Mode::kRegression) {
    status = ReplayRegressionInputs(
        context.options, [&context](const uint8_t *data, size_t size) {
          return ExecuteSyncInput(&context, data, size);
        });
  } else {
    std::vector<const char *> corpus_directories;
    corpus_directories.reserve(context.options.corpus_directories.size());
    for (const auto &directory : context.options.corpus_directories) {
      corpus_directories.push_back(directory.c_str());
    }
    std::vector<const char *> dictionary_files;
    dictionary_files.reserve(context.options.dictionary_files.size());
    for (const auto &dictionary : context.options.dictionary_files) {
      dictionary_files.push_back(dictionary.c_str());
    }

    JazzerLibAflRuntimeOptions runtime_options{
        context.options.runs,
        context.options.seed,
        context.options.max_len,
        context.options.timeout_millis,
        context.options.max_total_time_seconds,
        corpus_directories.empty() ? nullptr : corpus_directories.data(),
        corpus_directories.size(),
        dictionary_files.empty() ? nullptr : dictionary_files.data(),
        dictionary_files.size(),
    };
    status = jazzer_libafl_runtime_run(&runtime_options, &maps,
                                       ExecuteSyncInput, &context);
  }

  signal(SIGINT, SIG_DFL);
  signal(SIGSEGV, SIG_DFL);
  StopSyncWatchdog(&context);
  gActiveSyncContext = nullptr;

  if (status == kRuntimeFatal && !context.is_resolved) {
    context.is_resolved = true;
    context.deferred.Reject(
        Napi::Error::New(info.Env(), "The LibAFL backend failed internally")
            .Value());
  } else if (status == kRuntimeFoundTimeout && !context.is_resolved) {
    context.is_resolved = true;
    context.deferred.Reject(
        Napi::Error::New(info.Env(),
                         "Exceeded timeout while executing one fuzz input")
            .Value());
  } else if (status == kRuntimeFoundFinding && !context.is_resolved) {
    context.is_resolved = true;
    context.deferred.Reject(
        Napi::Error::New(info.Env(),
                         "The LibAFL backend found a crashing input")
            .Value());
  }

  if (!context.is_resolved) {
    context.deferred.Resolve(context.env.Undefined());
  }

  return context.deferred.Promise();
}

Napi::Value StartLibAflAsync(const Napi::CallbackInfo &info) {
  if (info.Length() != 2 || !info[0].IsFunction() || !info[1].IsObject()) {
    throw Napi::Error::New(info.Env(),
                           "Need two arguments, which must be the fuzz target "
                           "function and a LibAFL options object");
  }

  auto options = ParseRuntimeOptions(info.Env(), info[1].As<Napi::Object>());
  auto maps = SharedMapsForRuntime(info.Env());
  auto *context = new AsyncFuzzTargetContext(info.Env(), std::move(options));

  gAsyncTsfn = AsyncTsfn::New(
      info.Env(), info[0].As<Napi::Function>(), "LibAflAsyncAddon", 0, 1,
      context,
      [](Napi::Env env, AsyncFinalizerDataType *, AsyncFuzzTargetContext *ctx) {
        ctx->native_thread.join();
        if (ctx->run_status == kRuntimeFatal && !ctx->is_resolved) {
          ctx->deferred.Reject(
              Napi::Error::New(env, "The LibAFL backend failed internally")
                  .Value());
        } else if (ctx->run_status == kRuntimeFoundTimeout &&
                   !ctx->is_resolved) {
          ctx->deferred.Reject(
              Napi::Error::New(
                  env, "Exceeded timeout while executing one fuzz input")
                  .Value());
        } else if (ctx->run_status == kRuntimeFoundFinding &&
                   !ctx->is_resolved) {
          ctx->deferred.Reject(
              Napi::Error::New(env, "The LibAFL backend found a crashing input")
                  .Value());
        } else if (!ctx->is_resolved) {
          ctx->deferred.Resolve(env.Undefined());
        }
        delete ctx;
      });

  context->native_thread = std::thread(
      [maps](AsyncFuzzTargetContext *ctx) {
        gActiveAsyncContext = ctx;
        signal(SIGSEGV, AsyncErrorSignalHandler);
        signal(SIGINT, AsyncSigintHandler);

        if (ctx->options.mode == ParsedRuntimeOptions::Mode::kRegression) {
          ctx->run_status = ReplayRegressionInputs(
              ctx->options, [ctx](const uint8_t *data, size_t size) {
                return ExecuteAsyncInput(ctx, data, size);
              });
        } else {
          std::vector<const char *> corpus_directories;
          corpus_directories.reserve(ctx->options.corpus_directories.size());
          for (const auto &directory : ctx->options.corpus_directories) {
            corpus_directories.push_back(directory.c_str());
          }
          std::vector<const char *> dictionary_files;
          dictionary_files.reserve(ctx->options.dictionary_files.size());
          for (const auto &dictionary : ctx->options.dictionary_files) {
            dictionary_files.push_back(dictionary.c_str());
          }

          JazzerLibAflRuntimeOptions runtime_options{
              ctx->options.runs,
              ctx->options.seed,
              ctx->options.max_len,
              ctx->options.timeout_millis,
              ctx->options.max_total_time_seconds,
              corpus_directories.empty() ? nullptr : corpus_directories.data(),
              corpus_directories.size(),
              dictionary_files.empty() ? nullptr : dictionary_files.data(),
              dictionary_files.size(),
          };
          ctx->run_status = jazzer_libafl_runtime_run(&runtime_options, &maps,
                                                      ExecuteAsyncInput, ctx);
        }
        signal(SIGINT, SIG_DFL);
        signal(SIGSEGV, SIG_DFL);
        gActiveAsyncContext = nullptr;
        gAsyncTsfn.Release();
      },
      context);

  return context->deferred.Promise();
}
