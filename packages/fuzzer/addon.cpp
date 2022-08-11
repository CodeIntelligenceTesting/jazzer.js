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

#include <future>
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

// The context of the typed thread-safe function we use to call the JavaScript
// fuzz target
struct AsyncFuzzTargetContext {
  explicit AsyncFuzzTargetContext(Napi::Env env)
      : deferred(Napi::Promise::Deferred::New(env)){};
  std::thread native_thread;
  Napi::Promise::Deferred deferred;

  AsyncFuzzTargetContext() = delete;
};

// The data type to use each time we schedule a call to the JavaScript fuzz
// target. It includes the fuzzer-generated input and a promise to wait for the
// promise returned by the fuzz target to be resolved or rejected.
struct DataType {
  const uint8_t *data;
  size_t size;
  std::promise<void *> *promise;

  DataType() = delete;
};

void CallJsFuzzCallback(Napi::Env env, Napi::Function jsFuzzCallback,
                        AsyncFuzzTargetContext *context, DataType *data);
using TSFN = Napi::TypedThreadSafeFunction<AsyncFuzzTargetContext, DataType,
                                           CallJsFuzzCallback>;
using FinalizerDataType = void;

TSFN gTSFN;

// Information about a JS fuzz target.
struct FuzzTargetInfo {
  Napi::Env env;
  Napi::Function target;
};

// The JS fuzz target. We need to store the function pointer in a global
// variable because libfuzzer doesn't give us a way to feed user-provided data
// to its target function.
std::optional<FuzzTargetInfo> gFuzzTarget;

int kErrorExitCode = 77;

// The libFuzzer callback when fuzzing synchronously
int FuzzCallbackSync(const uint8_t *Data, size_t Size) {
  // Create a new active scope so that handles for the buffer objects created in
  // this function will be associated with it. This makes sure that these
  // handles are only held live through the lifespan of this scope and gives
  // the garbage collector a chance to deallocate them between the fuzzer
  // iterations. Otherwise, new handles will be associated with the original
  // scope created by Node.js when calling StartFuzzing. The lifespan for this
  // default scope is tied to the lifespan of the native method call. The result
  // is that, by default, handles remain valid and the objects associated with
  // these handles will be held live for the lifespan of the native method call.
  // This would exhaust memory resources since we run in an endless fuzzing loop
  // and only return when a bug is found. See:
  // https://github.com/nodejs/node-addon-api/blob/35b65712c26a49285cdbe2b4d04e25a5eccbe719/doc/object_lifetime_management.md
  auto scope = Napi::HandleScope(gFuzzTarget->env);

  // TODO Do we really want to copy the data? The user isn't allowed to
  // modify it (else the fuzzer will abort); moreover, we don't know when
  // the JS buffer is going to be garbage-collected. But it would still be
  // nice for efficiency if we could use a pointer instead of copying.
  auto data = Napi::Buffer<uint8_t>::Copy(gFuzzTarget->env, Data, Size);
  gFuzzTarget->target.Call({data});
  return 0;
}

// The libFuzzer callback when fuzzing asynchronously
int FuzzCallbackAsync(const uint8_t *Data, size_t Size) {
  std::promise<void *> promise;
  auto input = DataType{Data, Size, &promise};

  auto future = promise.get_future();
  auto status = gTSFN.BlockingCall(&input);
  if (status != napi_ok) {
    Napi::Error::Fatal(
        "FuzzCallbackAsync",
        "Napi::TypedThreadSafeNapi::Function.BlockingCall() failed");
  }
  // Wait until the JavaScript fuzz target has finished
  try {
    future.get();
  } catch (std::exception &exception) {
    // We call exit to immediately terminates the process without performing any
    // cleanup including libfuzzer exit handlers.
    _Exit(kErrorExitCode);
  }
  return 0;
}

void CallJsFuzzCallback(Napi::Env env, Napi::Function jsFuzzCallback,
                        AsyncFuzzTargetContext *context, DataType *data) {
  if (env != nullptr) {
    auto buffer = Napi::Buffer<uint8_t>::Copy(env, data->data, data->size);
    auto result = jsFuzzCallback.Call({buffer});
    if (result.IsPromise()) {
      auto jsPromise = result.As<Napi::Object>();
      auto then = jsPromise.Get("then").As<Napi::Function>();
      then.Call(
          jsPromise,
          {Napi::Function::New<>(env,
                                 [=](const Napi::CallbackInfo &info) {
                                   data->promise->set_value(nullptr);
                                 }),
           Napi::Function::New<>(env, [=](const Napi::CallbackInfo &info) {
             context->deferred.Reject(info[0].As<Napi::Error>().Value());
             data->promise->set_exception(std::make_exception_ptr(
                 std::runtime_error("Exception is thrown in the fuzz target")));
           })});
    } else {
      data->promise->set_exception(std::make_exception_ptr(
          std::runtime_error("Fuzz target does not return a promise")));
    }
  } else {
    data->promise->set_exception(std::make_exception_ptr(
        std::runtime_error("Environment is shut down")));
  }
}

void StartLibFuzzer(const std::vector<std::string> &args,
                    fuzzer::UserCallback fuzzCallback) {
  // Prepare a fake command line and start the fuzzer. This is made
  // slightly awkward by the fact that libfuzzer requires the string data
  // to be mutable and expects a C-style array of pointers.
  std::string progname{"jazzer"};
  std::vector<char *> fuzzer_arg_pointers;
  fuzzer_arg_pointers.push_back(progname.data());
  for (auto &arg : args)
    fuzzer_arg_pointers.push_back((char *)arg.data());

  int argc = fuzzer_arg_pointers.size();
  char **argv = fuzzer_arg_pointers.data();

  // Start the libFuzzer loop in a separate thread in order not to block
  // JavaScript event loop
  fuzzer::FuzzerDriver(&argc, &argv, fuzzCallback);
}

std::vector<std::string> LibFuzzerArgs(Napi::Env env, Napi::Array jsArgs) {
  std::vector<std::string> fuzzer_args;
  for (auto [_, fuzzer_arg] : jsArgs) {
    auto val = static_cast<Napi::Value>(fuzzer_arg);
    if (!val.IsString()) {
      Napi::Error::New(env, "libfuzzer arguments have to be strings")
          .ThrowAsJavaScriptException();
    }

    fuzzer_args.push_back(val.As<Napi::String>().Utf8Value());
  }
  return std::move(fuzzer_args);
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
// This is a JS-enabled version of libfuzzer main function (see FuzzerMain.cpp
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

  auto fuzzer_args = LibFuzzerArgs(info.Env(), info[1].As<Napi::Array>());

  // Store the JS fuzz target and corresponding environment globally, so that
  // our C++ fuzz target can use them to call back into JS.
  gFuzzTarget = {info.Env(), info[0].As<Napi::Function>()};

  StartLibFuzzer(fuzzer_args, FuzzCallbackSync);
  // Explicitly reset the global function pointer because the JS
  // function reference that it's currently holding will become invalid
  // when we return.
  gFuzzTarget = {};
}


// Start libfuzzer with a JS fuzz target asynchronously.
//
// This is a JS-enabled version of libfuzzer main function (see FuzzerMain.cpp
// in the compiler-rt source). Its only parameter is the fuzz target, which must
// be a JS function taking a single data argument; the fuzz target's return
// value is ignored.
//
// In order not to block JavaScript event loop, we start libfuzzer in a separate
// thread and use a typed thread-safe function to manage calls to the JavaScript
// fuzz target which can only happen in the addon's main thread. This function
// returns a promise so that the JavaScript code can use `catch()` to check when
// the promise is rejected.
Napi::Value StartFuzzingAsync(const Napi::CallbackInfo &info) {
  if (info.Length() != 2 || !info[0].IsFunction() || !info[1].IsArray()) {
    Napi::Error::New(info.Env(),
                     "Need two arguments, which must be the fuzz target "
                     "function and an array of libfuzzer arguments")
        .ThrowAsJavaScriptException();
  }

  auto fuzzer_args = LibFuzzerArgs(info.Env(), info[1].As<Napi::Array>());

  // Store the JS fuzz target and corresponding environment globally, so that
  // our C++ fuzz target can use them to call back into JS.
  auto *context = new AsyncFuzzTargetContext(info.Env());

  gTSFN = TSFN::New(
      info.Env(),
      info[0]
          .As<Napi::Function>(), // JavaScript fuzz target called asynchronously
      "FuzzerAsyncAddon",
      0,       // Unlimited Queue
      1,       // Only one thread will use this initially
      context, // context
      [](Napi::Env, FinalizerDataType *, AsyncFuzzTargetContext *ctx) {
        ctx->native_thread.join();
        delete ctx;
      });

  context->native_thread = std::thread(
      [](std::vector<std::string> fuzzer_args, AsyncFuzzTargetContext *ctx) {
        StartLibFuzzer(fuzzer_args, FuzzCallbackAsync);
        gTSFN.Release();
      },
      std::move(fuzzer_args), context);
  return context->deferred.Promise();
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
  exports["startFuzzingAsync"] = Napi::Function::New<StartFuzzingAsync>(env);

  RegisterCallbackExports(env, exports);
  return exports;
}

NODE_API_MODULE(jazzerjs, Init)
