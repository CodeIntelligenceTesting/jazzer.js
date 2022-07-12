#pragma once

#include <napi.h>

// Export fuzzer callbacks.
//
// Add all our fuzzer callback functions to the list of the module's exports;
// these functions let JS target code provide feedback to libfuzzer or the
// native agent.
void RegisterCallbackExports(Napi::Env env, Napi::Object exports);
