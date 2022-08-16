// Copyright 2022 Code Intelligence GmbH
//
//  Licensed under the Apache License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License.
//  You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
//  Unless required by applicable law or agreed to in writing, software
//  distributed under the License is distributed on an "AS IS" BASIS,
//  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  See the License for the specific language governing permissions and
//  limitations under the License.

#include <future>
#include <iostream>

#include "shared/sanitizer_symbols.h"
#include "start_fuzzing_async.h"
#include "utils.h"

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

int kErrorExitCode = 77;

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
    std::cerr << "Unexpected Error: " << exception.what() << std::endl;

    // We call exit to immediately terminates the process without performing any
    // cleanup including libfuzzer exit handlers.
    _Exit(kErrorExitCode);
  }
  return 0;
}

// This function is the callback that gets executed in the addon's main thread
// (i.e., the JavaScript event loop thread) and thus we can call the JavaScript
// code and use the Node API to create JavaScript objects.
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

} // namespace

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
      [](Napi::Env env, FinalizerDataType *, AsyncFuzzTargetContext *ctx) {
        ctx->native_thread.join();
        ctx->deferred.Resolve(Napi::Boolean::New(env, true));
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

void StopFuzzingAsync(const Napi::CallbackInfo &info) {
  gLibfuzzerPrintCrashingInput();
  _Exit(kErrorExitCode);
}