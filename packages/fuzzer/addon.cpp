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

#include <iostream>
#include <optional>
#include <string>
#include <vector>

// The entry point to Node's C++ API.
#include <napi.h>

// Definitions from compiler-rt, including libfuzzer's entrypoint and the
// sanitizer runtime's initialization function.
#include <fuzzer/FuzzerDefs.h>
#include <ubsan/ubsan_init.h>

#include "shared/callbacks.h"

namespace {

// Information about a JS fuzz target.
struct FuzzTargetInfo {
  Napi::Env env;
  Napi::Function target;
};

// The JS fuzz target. We need to store the function pointer in a global
// variable because libfuzzer doesn't give us a way to feed user-provided data
// to its target function.
std::optional<FuzzTargetInfo> gFuzzTarget;

int FuzzCallback(const uint8_t *Data, size_t Size) {
  gFuzzTarget->target.Call(
      // TODO Do we really want to copy the data? The user isn't allowed to
      // modify it (else the fuzzer will abort); moreover, we don't know when
      // the JS buffer is going to be garbage-collected. But it would still be
      // nice for efficiency if we could use a pointer instead of copying.
      {Napi::Buffer<uint8_t>::Copy(gFuzzTarget->env, Data, Size)});
  return 0;
}

} // namespace

// A basic sanity check: ask the Node API for version information and print it.
void PrintVersion(const Napi::CallbackInfo &info) {
  auto napi_version = Napi::VersionManagement::GetNapiVersion(info.Env());
  auto node_version = Napi::VersionManagement::GetNodeVersion(info.Env());
  std::cout << "Jazzer.js running on Node " << node_version->major
            << " using Node-API version " << napi_version << std::endl;
}

// Start libfuzzer with a JS fuzz target.
//
// This is a JS-enabled version of libfuzzer's main function (see FuzzerMain.cpp
// in the compiler-rt source). Its only parameter is the fuzz target, which must
// be a JS function taking a single data argument; the fuzz target's return
// value is ignored.
void StartFuzzing(const Napi::CallbackInfo &info) {
  if (info.Length() != 2 || !info[0].IsFunction() || !info[1].IsArray()) {
    Napi::Error::New(info.Env(),
                     "Need two arguments, which must be the fuzz target "
                     "function and an array of libfuzzer arguments")
        .ThrowAsJavaScriptException();
  }

  std::vector<std::string> fuzzer_args;
  for (auto [_, fuzzer_arg] : info[1].As<Napi::Array>()) {
    auto val = static_cast<Napi::Value>(fuzzer_arg);
    if (!val.IsString()) {
      Napi::Error::New(info.Env(), "libfuzzer arguments have to be strings")
          .ThrowAsJavaScriptException();
    }

    fuzzer_args.push_back(val.As<Napi::String>().Utf8Value());
  }

  // Store the JS fuzz target and corresponding environment globally, so that
  // our C++ fuzz target can use them to call back into JS.
  gFuzzTarget = {info.Env(), info[0].As<Napi::Function>()};

  // Prepare a fake command line and start the fuzzer. This is made slightly
  // awkward by the fact that libfuzzer requires the string data to be mutable
  // and expects a C-style array of pointers.
  std::string progname{"jazzer"};
  std::vector<char *> fuzzer_arg_pointers;
  fuzzer_arg_pointers.push_back(progname.data());
  for (auto &arg : fuzzer_args)
    fuzzer_arg_pointers.push_back(arg.data());

  int argc = fuzzer_arg_pointers.size();
  char **argv = fuzzer_arg_pointers.data();
  fuzzer::FuzzerDriver(&argc, &argv, FuzzCallback);

  // Explicitly reset the global function pointer because the JS function
  // reference that it's currently holding will become invalid when we return.
  gFuzzTarget = {};
}

// Initialize the module by populating its JS exports with pointers to our C++
// functions.
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  // Clang always links the sanitizer runtime when "-fsanitize=fuzzer" is
  // specified on the command line; the runtime contains functionality for
  // coverage tracking and crash data collection that the fuzzer needs.
  // Normally, it self-initializes via an entry in the .preinit_array section of
  // the ELF binary, but this approach doesn't work in shared objects like our
  // plugin. We therefore disable the .preinit_array entry in our CMakeLists.txt
  // and instead call the initialization function here.
  __ubsan::InitAsStandaloneIfNecessary();

  exports["printVersion"] = Napi::Function::New<PrintVersion>(env);
  exports["startFuzzing"] = Napi::Function::New<StartFuzzing>(env);

  RegisterCallbackExports(env, exports);
  return exports;
}

NODE_API_MODULE(jazzerjs, Init)
