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
#include "coverage.h"

#include <cstdio>
#include <string>
#include <unordered_map>
#include <vector>

extern "C" {
void __sanitizer_cov_8bit_counters_init(uint8_t *start, uint8_t *end);
void __sanitizer_cov_pcs_init(const uintptr_t *pcs_beg,
                              const uintptr_t *pcs_end);
}

namespace {
// We register an array of 8-bit coverage counters with libFuzzer. The array is
// populated from JavaScript using Buffer.
uint8_t *gCoverageCounters = nullptr;
size_t gCoverageCountersSize = 0;

// PC-Table is used by libfuzzer to keep track of program addresses
// corresponding to coverage counters. The flags determine whether the
// corresponding counter is the beginning of a function.
struct PCTableEntry {
  uintptr_t PC, PCFlags;
};

struct ModulePCTable {
  uintptr_t basePC;
  size_t numEntries;
  PCTableEntry *entries;
};

std::vector<ModulePCTable> gModulePCTables;
std::unordered_map<uintptr_t, size_t> gModulePCTableIndex;

// The array of supplementary information for coverage counters. Each entry
// corresponds to an entry in gCoverageCounters; since we don't know the actual
// addresses of our counters in JS land, we fill this table with fake
// information.
PCTableEntry *gPCEntries = nullptr;
} // namespace
void RegisterCoverageMap(const Napi::CallbackInfo &info) {
  if (info.Length() != 1) {
    throw Napi::Error::New(info.Env(),
                           "Need one argument: a pointer to the Buffer object");
  }
  if (!info[0].IsBuffer()) {
    throw Napi::Error::New(info.Env(), "Expected a Buffer");
  }

  auto buf = info[0].As<Napi::Buffer<uint8_t>>();

  gCoverageCounters = reinterpret_cast<uint8_t *>(buf.Data());
  gCoverageCountersSize = buf.Length();
  // Fill the PC table with fake entries. The only requirement is that the fake
  // addresses must not collide with the locations of real counters (e.g., from
  // instrumented C++ code). Therefore, we just use the address of the counter
  // itself - it's in a statically allocated memory region under our control.
  gPCEntries = new PCTableEntry[buf.Length()];
  for (std::size_t i = 0; i < buf.Length(); ++i) {
    gPCEntries[i] = {i, 0};
  }
}

void RegisterNewCounters(const Napi::CallbackInfo &info) {
  if (info.Length() != 2) {
    throw Napi::Error::New(
        info.Env(), "Need two arguments: the old and new number of counters");
  }

  auto old_num_counters = info[0].As<Napi::Number>().Int64Value();
  auto new_num_counters = info[1].As<Napi::Number>().Int64Value();

  if (gCoverageCounters == nullptr) {
    throw Napi::Error::New(info.Env(),
                           "RegisterCoverageMap should have been called first");
  }
  if (new_num_counters < old_num_counters) {
    throw Napi::Error::New(
        info.Env(),
        "new_num_counters must not be smaller than old_num_counters");
  }
  if (new_num_counters == old_num_counters) {
    return;
  }

  __sanitizer_cov_8bit_counters_init(gCoverageCounters + old_num_counters,
                                     gCoverageCounters + new_num_counters);
  __sanitizer_cov_pcs_init((uintptr_t *)(gPCEntries + old_num_counters),
                           (uintptr_t *)(gPCEntries + new_num_counters));
}

// Monotonically increasing fake PC so that each module's counters get
// unique program-counter entries that don't collide with the shared
// coverage map or with each other.
static uintptr_t gNextModulePC = 0x10000000;

// Register an independent coverage counter region for a single ES module.
// libFuzzer supports multiple disjoint counter regions; each call here
// hands it a fresh one.  Returns the base PC assigned to this module
// so the caller can pass it to RegisterPCLocations.
Napi::Value RegisterModuleCounters(const Napi::CallbackInfo &info) {
  if (info.Length() != 1 || !info[0].IsBuffer()) {
    throw Napi::Error::New(info.Env(),
                           "Need one argument: a Buffer of 8-bit counters");
  }

  auto buf = info[0].As<Napi::Buffer<uint8_t>>();
  auto size = buf.Length();
  if (size == 0) {
    return Napi::Number::New(info.Env(), 0);
  }

  auto basePC = gNextModulePC;
  auto *pcEntries = new PCTableEntry[size];
  for (std::size_t i = 0; i < size; ++i) {
    pcEntries[i] = {gNextModulePC++, 0};
  }

  __sanitizer_cov_8bit_counters_init(buf.Data(), buf.Data() + size);
  __sanitizer_cov_pcs_init(reinterpret_cast<uintptr_t *>(pcEntries),
                           reinterpret_cast<uintptr_t *>(pcEntries + size));
  gModulePCTableIndex[basePC] = gModulePCTables.size();
  gModulePCTables.push_back({basePC, size, pcEntries});

  return Napi::Number::New(info.Env(), static_cast<double>(basePC));
}

// ── PC-to-source symbolization ───────────────────────────────────
//
// Thread safety
// ~~~~~~~~~~~~~
// These data structures are written by RegisterPCLocations (called from
// the JS event-loop thread via N-API) and read by SymbolizePC (called by
// libFuzzer via __sanitizer_symbolize_pc).
//
// In sync mode both paths share the same thread, so there is no race.
//
// In async mode libFuzzer runs on a dedicated native thread.  There is
// no explicit lock protecting gStringTable / gCjsLocations /
// gEsmLocations, yet the access is still safe:
//
//   JS thread                         libFuzzer thread
//   ─────────                         ────────────────
//   CallJsFuzzCallback()              FuzzCallbackAsync()
//     fuzz target runs                  TSFN.BlockingCall(…)
//     (may load modules →               future.get()  ← BLOCKS
//      RegisterPCLocations writes)
//     promise->set_value(…)           ← unblocks
//                                     returns to Fuzzer::RunOne
//                                     TPC.UpdateObservedPCs()
//                                       → PrintPC → SymbolizePC (reads)
//
// std::promise::set_value happens-before std::future::get returns
// (C++ [futures.state] §33.10.5), so every write made by the JS
// thread during a fuzzer iteration is visible to the native thread
// when it resumes and calls the symbolizer.
//
// This guarantee is implicit.  It would break if module registration
// ever happened outside the synchronous scope of a TSFN callback
// (e.g. from a Node.js worker thread or a detached timer).
//
// Async-signal safety: libFuzzer installs signal handlers for SIGBUS,
// SIGABRT, etc., whose crash path calls PrintFinalStats →
// PrintCoverage → DescribePC → __sanitizer_symbolize_pc.  DescribePC
// uses a try_to_lock mutex that returns "<can not symbolize>" on
// contention, but std::mutex::try_lock is itself not async-signal-safe.
// This is a pre-existing libFuzzer limitation, not specific to
// jazzer.js.  jazzer.js overrides SIGINT and SIGSEGV with its own
// handlers that do not call the symbolizer.

namespace {

struct PCLocation {
  uint32_t fileIdx;
  uint32_t funcIdx;
  uint32_t line;
  uint32_t col;
};

// Deduplicated string table shared across all modules.  The vector
// provides O(1) indexed access in SymbolizePC; the map provides O(1)
// amortized deduplication in internString.
std::vector<std::string> gStringTable;
std::unordered_map<std::string, uint32_t> gStringIndex;
// CJS location entries indexed directly by edge ID (PC = edge ID).
std::vector<PCLocation> gCjsLocations;
// ESM location entries indexed by (pc - ESM_BASE).
std::vector<PCLocation> gEsmLocations;
constexpr uintptr_t ESM_BASE = 0x10000000;

uint32_t internString(const std::string &s) {
  auto it = gStringIndex.find(s);
  if (it != gStringIndex.end()) return it->second;
  auto idx = static_cast<uint32_t>(gStringTable.size());
  gStringTable.push_back(s);
  gStringIndex.emplace(s, idx);
  return idx;
}

ModulePCTable *findModulePCTable(uintptr_t basePC) {
  auto it = gModulePCTableIndex.find(basePC);
  if (it == gModulePCTableIndex.end()) return nullptr;
  return &gModulePCTables[it->second];
}

// Undo libFuzzer's GetNextInstructionPc before lookup.
uintptr_t toPCTablePC(uintptr_t symbolizerPC) {
#if defined(__aarch64__) || defined(__arm__)
  return symbolizerPC - 4;
#else
  return symbolizerPC - 1;
#endif
}

} // namespace

// Called from JS: registerPCLocations(filename, funcNames[], entries[], pcBase)
// entries is a flat Int32Array:
// [edgeId, line, col, funcIdx, isFuncEntry, ...]
// pcBase: for ESM pass the value returned by registerModuleCounters;
//         for CJS pass 0 (edge IDs are already global PCs).
void RegisterPCLocations(const Napi::CallbackInfo &info) {
  auto env = info.Env();
  if (info.Length() != 4) {
    throw Napi::Error::New(env, "Expected 4 arguments: filename, "
                                "funcNames[], entries (Int32Array), pcBase");
  }

  auto filename = info[0].As<Napi::String>().Utf8Value();
  auto funcArray = info[1].As<Napi::Array>();
  auto entries = info[2].As<Napi::TypedArray>();
  auto pcBase =
      static_cast<uintptr_t>(info[3].As<Napi::Number>().Int64Value());

  uint32_t fileIdx = internString(filename);

  // Intern function names.
  std::vector<uint32_t> funcIndices(funcArray.Length());
  for (uint32_t i = 0; i < funcArray.Length(); ++i) {
    auto name = funcArray.Get(i).As<Napi::String>().Utf8Value();
    funcIndices[i] = internString(name);
  }

  auto *data = static_cast<int32_t *>(
      entries.As<Napi::Int32Array>().Data());
  auto length = entries.ElementLength();

  bool isEsm = pcBase >= ESM_BASE;
  auto baseOffset = isEsm ? pcBase - ESM_BASE : pcBase;
  auto &locations = isEsm ? gEsmLocations : gCjsLocations;
  auto *modulePCTable = isEsm ? findModulePCTable(pcBase) : nullptr;

  for (size_t i = 0; i + 4 < length; i += 5) {
    auto edgeId = static_cast<uint32_t>(data[i]);
    auto line = static_cast<uint32_t>(data[i + 1]);
    auto col = static_cast<uint32_t>(data[i + 2]);
    auto localFuncIdx = static_cast<uint32_t>(data[i + 3]);
    bool isFuncEntry = data[i + 4] != 0;

    auto idx = baseOffset + edgeId;
    if (idx >= locations.size()) {
      locations.resize(idx + 1);
    }

    uint32_t globalFuncIdx =
        localFuncIdx < funcIndices.size() ? funcIndices[localFuncIdx] : 0;
    locations[idx] = {fileIdx, globalFuncIdx, line, col};

    if (!isFuncEntry) continue;

    if (isEsm) {
      if (modulePCTable != nullptr && edgeId < modulePCTable->numEntries) {
        modulePCTable->entries[edgeId].PCFlags |= 1;
      }
    } else if (gPCEntries != nullptr && edgeId < gCoverageCountersSize) {
      gPCEntries[edgeId].PCFlags |= 1;
    }
  }
}

void SymbolizePC(uintptr_t pc, const char *fmt, char *out_buf,
                 size_t out_buf_size) {
  if (out_buf_size == 0) return;

  auto origPC = toPCTablePC(pc);

  const char *file = "<unknown>";
  const char *func = "<unknown>";
  uint32_t line = 0, col = 0;

  const PCLocation *loc = nullptr;
  if (origPC >= ESM_BASE && origPC - ESM_BASE < gEsmLocations.size()) {
    loc = &gEsmLocations[origPC - ESM_BASE];
  } else if (origPC < ESM_BASE && origPC < gCjsLocations.size()) {
    loc = &gCjsLocations[origPC];
  }
  if (loc && loc->line != 0) {
    file = gStringTable[loc->fileIdx].c_str();
    func = gStringTable[loc->funcIdx].c_str();
    line = loc->line;
    col = loc->col;
  }

  size_t pos = 0;
  // remaining() reserves one byte for the null terminator, so snprintf
  // calls pass remaining()+1 as the buffer size (snprintf counts the
  // null in its size parameter but we exclude it from remaining()).
  auto remaining = [&]() { return out_buf_size - pos - 1; };
  auto advance = [&](int n) { if (n > 0) pos += std::min(static_cast<size_t>(n), remaining()); };

  for (const char *f = fmt; *f && remaining() > 0; ++f) {
    if (*f == '%' && *(f + 1)) {
      ++f;
      switch (*f) {
      case 'p':
        // Virtual PCs are meaningless and %L already prints the file path.
        // Eat the trailing space so the output doesn't start with "  in".
        if (*(f + 1) == ' ') ++f;
        break;
      case 'F':
        advance(snprintf(out_buf + pos, remaining() + 1, "in %s", func));
        break;
      case 'L':
        advance(snprintf(out_buf + pos, remaining() + 1, "%s:%u:%u",
                         file, line, col));
        break;
      case 's':
        advance(snprintf(out_buf + pos, remaining() + 1, "%s", file));
        break;
      case 'l':
        advance(snprintf(out_buf + pos, remaining() + 1, "%u", line));
        break;
      case 'c':
        advance(snprintf(out_buf + pos, remaining() + 1, "%u", col));
        break;
      default:
        if (remaining() >= 2) {
          out_buf[pos++] = '%';
          out_buf[pos++] = *f;
        }
        break;
      }
    } else {
      out_buf[pos++] = *f;
    }
  }
  out_buf[pos] = '\0';
}
