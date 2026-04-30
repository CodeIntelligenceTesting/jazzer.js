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

#include "libafl_findings.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>

#ifdef _WIN32
#include <process.h>
#define GetPID _getpid
#else
#include <unistd.h>
#define GetPID getpid
#endif

#include "shared/libfuzzer.h"

namespace {
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
} // namespace

void ClearFindingInfo(JazzerLibAflFindingInfo *finding_info) {
  if (finding_info == nullptr) {
    return;
  }

  std::memset(finding_info, 0, sizeof(*finding_info));
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

std::string DescribeTimeout(uint64_t timeout_millis) {
  return "timeout after " + std::to_string(timeout_millis) + " ms";
}

void RecordFindingInfo(JazzerLibAflFindingInfo *finding_info,
                       const std::string &artifact,
                       const std::string &summary) {
  if (finding_info == nullptr) {
    return;
  }

  finding_info->has_value = 1;
  CopyFindingField(finding_info->artifact, sizeof(finding_info->artifact),
                   artifact);
  CopyFindingField(finding_info->summary, sizeof(finding_info->summary),
                   summary);
}

std::string WriteArtifact(const std::string &artifact_prefix,
                          const std::string &kind, const uint8_t *data,
                          size_t size, bool emit_info) {
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

[[noreturn]] void ExitOnTimeout(JazzerLibAflFindingInfo *finding_info,
                                uint64_t timeout_millis,
                                const std::string &artifact_prefix,
                                const std::vector<uint8_t> &input) {
  std::cerr << "ERROR: Exceeded timeout of " << timeout_millis
            << " ms for one fuzz target execution." << std::endl;
  const auto artifact =
      WriteArtifact(artifact_prefix, "timeout", input.data(), input.size());
  RecordFindingInfo(finding_info, artifact, DescribeTimeout(timeout_millis));
  _Exit(libfuzzer::EXIT_ERROR_TIMEOUT);
}

[[noreturn]] void ExitWithUnexpectedError(const std::exception &exception) {
  std::cerr << "==" << static_cast<unsigned long>(GetPID())
            << "== Jazzer.js: Unexpected Error: " << exception.what()
            << std::endl;
  libfuzzer::PrintCrashingInput();
  _Exit(libfuzzer::EXIT_ERROR_CODE);
}
