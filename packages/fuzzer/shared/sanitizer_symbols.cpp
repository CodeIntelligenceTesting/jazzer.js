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

#include <unistd.h>
#include <stdio.h>
#include <iostream>
#include "sanitizer_symbols.h"


namespace libfuzzer {
void (*PrintCrashingInput)() = nullptr;
}

// Used by libFuzzer to set the callback to be called immediately before
// death on error. The libfuzzer death callback dumps the crashing input
// and prints final stats.
extern "C" [[maybe_unused]] void
__sanitizer_set_death_callback(void (*callback)()) {
  libfuzzer::PrintCrashingInput = callback;
}

// TODO: on Windows use "nul" instead
std::string LogFile("/dev/null");

void setLogFile(std::string logFile) {
  LogFile = logFile;
}

// Suppress libFuzzer warnings about missing sanitizer methods
extern "C" [[maybe_unused]] int __sanitizer_acquire_crash_state() { return 1; }
extern "C" [[maybe_unused]] void __sanitizer_print_stack_trace() {}
extern "C" [[maybe_unused]] void __sanitizer_set_report_fd(void* fd) {
  std::cout << "---------------------------------------------------------------------------Log file: " << LogFile << std::endl;
  FILE* Temp = fopen(LogFile.data(), "w");
  if (!Temp)
    return;
  dup2(fileno(Temp), reinterpret_cast<unsigned long>(fd));
  }
