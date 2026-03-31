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

#include <iostream>

extern "C" {
void __sanitizer_cov_8bit_counters_init(uint8_t *start, uint8_t *end);
void __sanitizer_cov_pcs_init(const uintptr_t *pcs_beg,
                              const uintptr_t *pcs_end);
}

namespace {
// We register an array of 8-bit coverage counters with libFuzzer. The array is
// populated from JavaScript using Buffer.
uint8_t *gCoverageCounters = nullptr;

// PC-Table is used by libfuzzer to keep track of program addresses
// corresponding to coverage counters. The flags determine whether the
// corresponding counter is the beginning of a function; we don't currently use
// it.
struct PCTableEntry {
  uintptr_t PC, PCFlags;
};

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
//
// With PCFlags=0, libFuzzer's core feedback loop (CollectFeatures) does
// not read the PC value — it works purely from counter indices.  Unique
// PCs are still needed for forward-compatibility: __sanitizer_symbolize_pc
// support, __sanitizer_cov_get_observed_pcs for external tool integration,
// and -print_pcs cosmetic output all depend on distinct PC values.
static uintptr_t gNextModulePC = 0x10000000;

// Register an independent coverage counter region for a single ES module.
// libFuzzer supports multiple disjoint counter regions; each call here
// hands it a fresh one.
void RegisterModuleCounters(const Napi::CallbackInfo &info) {
  if (info.Length() != 1 || !info[0].IsBuffer()) {
    throw Napi::Error::New(info.Env(),
                           "Need one argument: a Buffer of 8-bit counters");
  }

  auto buf = info[0].As<Napi::Buffer<uint8_t>>();
  auto size = buf.Length();
  if (size == 0) {
    return;
  }

  // Intentionally never freed: libFuzzer holds a raw pointer to this table
  // (via __sanitizer_cov_pcs_init) and may read it at any time — during the
  // fuzz loop, coverage printing, or crash handling.  The CJS path (line 59)
  // uses the same pattern.  Module count is bounded by project size, so the
  // cumulative allocation is negligible.
  auto *pcEntries = new PCTableEntry[size];
  for (std::size_t i = 0; i < size; ++i) {
    pcEntries[i] = {gNextModulePC++, 0};
  }

  __sanitizer_cov_8bit_counters_init(buf.Data(), buf.Data() + size);
  __sanitizer_cov_pcs_init(reinterpret_cast<uintptr_t *>(pcEntries),
                           reinterpret_cast<uintptr_t *>(pcEntries + size));
}
