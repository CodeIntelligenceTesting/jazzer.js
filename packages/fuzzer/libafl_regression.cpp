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

#include "libafl_regression.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <system_error>
#include <vector>

#ifdef _WIN32
#include <io.h>
#else
#include <unistd.h>
#endif

#include "shared/libafl_abi.h"

namespace {
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

void PrintRegressionStart(const LibAflOptions &options, size_t replay_inputs) {
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

bool ReachedMaxTotalTime(const LibAflOptions &options,
                         std::chrono::steady_clock::time_point started_at) {
  if (options.max_total_time_seconds == 0) {
    return false;
  }
  return std::chrono::steady_clock::now() - started_at >=
         std::chrono::seconds(options.max_total_time_seconds);
}
} // namespace

int ReplayRegressionInputs(
    const LibAflOptions &options,
    const std::function<int(const uint8_t *, size_t)> &execute_one) {
  std::vector<std::filesystem::path> corpus_files;
  if (!CollectRegressionCorpusFiles(options.corpus_directories,
                                    &corpus_files)) {
    return kJazzerLibAflRuntimeFatal;
  }

  const auto started_at = std::chrono::steady_clock::now();
  const auto replay_inputs = corpus_files.size() + 1;
  uint64_t executions = 0;
  static constexpr uint8_t kEmptyInputByte = 0;
  std::vector<uint8_t> current_input;

  PrintRegressionStart(options, replay_inputs);

  auto execute_input = [&](const uint8_t *data, size_t size) -> int {
    if (options.runs != 0 && executions >= options.runs) {
      return kJazzerLibAflRuntimeOk;
    }
    if (ReachedMaxTotalTime(options, started_at)) {
      return kJazzerLibAflRuntimeStopped;
    }

    const auto status = execute_one(data, size);
    executions++;
    switch (status) {
    case kJazzerLibAflExecutionContinue:
      return kJazzerLibAflRuntimeOk;
    case kJazzerLibAflExecutionFinding:
      return kJazzerLibAflRuntimeFoundFinding;
    case kJazzerLibAflExecutionStop:
      return kJazzerLibAflRuntimeStopped;
    case kJazzerLibAflExecutionFatal:
      return kJazzerLibAflRuntimeFatal;
    case kJazzerLibAflExecutionTimeout:
      return kJazzerLibAflRuntimeFoundTimeout;
    default:
      std::cerr << "[libafl] fatal: unknown execution status: " << status
                << std::endl;
      return kJazzerLibAflRuntimeFatal;
    }
  };

  auto status = execute_input(&kEmptyInputByte, 0);
  if (status != kJazzerLibAflRuntimeOk) {
    if (status == kJazzerLibAflRuntimeStopped) {
      PrintRegressionDone(started_at, executions, replay_inputs);
    }
    return status;
  }

  for (const auto &file_path : corpus_files) {
    if (!ReadRegressionInput(file_path, options.max_len, &current_input)) {
      return kJazzerLibAflRuntimeFatal;
    }

    const auto *data =
        current_input.empty() ? &kEmptyInputByte : current_input.data();
    status = execute_input(data, current_input.size());
    if (status != kJazzerLibAflRuntimeOk) {
      if (status == kJazzerLibAflRuntimeStopped) {
        PrintRegressionDone(started_at, executions, replay_inputs);
      }
      return status;
    }
  }

  PrintRegressionDone(started_at, executions, replay_inputs);
  return kJazzerLibAflRuntimeOk;
}
