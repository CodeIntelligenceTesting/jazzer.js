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

#include <cstddef>
#include <cstdint>
#include <cstring>

extern "C" {
void __sanitizer_cov_8bit_counters_init(uint8_t *start, uint8_t *end);
void __sanitizer_cov_pcs_init(const uintptr_t *pcs_beg,
                              const uintptr_t *pcs_end);
}

namespace {
// Shared coverage counter buffer populated from JavaScript using Buffer.
// It is preallocated on the JavaScript side; registerNewCounters grows the
// active prefix that the fuzzing backends should observe.
uint8_t *gCoverageCounters = nullptr;
std::size_t gCoverageCountersCapacity = 0;
std::size_t gCoverageCountersSize = 0;

// PC-Table is used by libFuzzer to keep track of program addresses
// corresponding to coverage counters. The flags determine whether the
// corresponding counter is the beginning of a function; we don't currently use
// it.
struct PCTableEntry {
  uintptr_t PC, PCFlags;
};
static_assert(sizeof(PCTableEntry) == 2 * sizeof(uintptr_t),
              "PCTableEntry must match sanitizer PC table layout");

void RegisterCounterRange(uint8_t *start, uint8_t *end) {
  if (start >= end) {
    return;
  }

  auto num_counters = static_cast<std::size_t>(end - start);

  // libFuzzer requires an array containing the instruction addresses
  // associated with the coverage counters. Since these JavaScript counters are
  // synthetic and not associated with real code, we create PC entries with the
  // flag set to 0 to indicate they are not real function-entry PCs. The PC
  // value is set to the local counter index for identification purposes.
  //
  // Intentionally never freed: libFuzzer holds a raw pointer to this table via
  // __sanitizer_cov_pcs_init and may read it at any time.
  auto *pc_entries = new PCTableEntry[num_counters];
  for (std::size_t i = 0; i < num_counters; ++i) {
    pc_entries[i] = {i, 0};
  }

  auto *pc_entries_end = pc_entries + num_counters;
  __sanitizer_cov_8bit_counters_init(start, end);
  __sanitizer_cov_pcs_init(reinterpret_cast<const uintptr_t *>(pc_entries),
                           reinterpret_cast<const uintptr_t *>(pc_entries_end));
}
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
  gCoverageCountersCapacity = buf.Length();
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
  if (static_cast<std::size_t>(new_num_counters) > gCoverageCountersCapacity) {
    throw Napi::Error::New(info.Env(),
                           "new_num_counters exceeds the coverage map size");
  }
  if (new_num_counters == old_num_counters) {
    return;
  }

  RegisterCounterRange(gCoverageCounters + old_num_counters,
                       gCoverageCounters + new_num_counters);
  gCoverageCountersSize = static_cast<std::size_t>(new_num_counters);
}

uint8_t *CoverageCounters() { return gCoverageCounters; }

std::size_t CoverageCountersCapacity() { return gCoverageCountersCapacity; }

std::size_t CoverageCountersSize() { return gCoverageCountersSize; }

std::size_t *CoverageCountersSizePointer() { return &gCoverageCountersSize; }

void ClearCoverageCounters() {
  if (gCoverageCounters == nullptr || gCoverageCountersSize == 0) {
    return;
  }

  std::memset(gCoverageCounters, 0, gCoverageCountersSize);
}
