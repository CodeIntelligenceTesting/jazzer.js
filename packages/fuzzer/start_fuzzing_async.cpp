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

#include <exception>
#include <future>
#include <optional>

#include "napi.h"
#include "shared/libfuzzer.h"
#include "start_fuzzing_async.h"
#include "utils.h"

// Warning :)
//
// This code is a bit tricky. The problem is that we can't block the event loop
// when fuzzing asynchronous JS; if we do, the async target code either doesn't
// get executed, or we deadlock Node. What we do, therefore, is to run libfuzzer
// on a separate worker thread, signaling via a promise when it's done fuzzing.
// However, calls to JS are only allowed on the event loop's thread, so the
// fuzzer has to schedule those and wait for their result.
//
// In summary, we proceed roughly like this:
//
// 1. In the main thread, the user starts the fuzzer from JS; we launch
//    libfuzzer in a worker thread and return a JS promise.
//
// 2. On the worker thread libfuzzer calls our C++ fuzz target, which in turn
//    schedules a JS call to the user's real fuzz target and prepares a C++
//    promise to receive the result.
//
// 3. Back on the main thread, we call the user's JS fuzz target with the input
//    that the fuzzer has given us. The result is either a JS promise (for async
//    JS) or a JS value (for sync JS). If it's a JS value, we propagate it to
//    the worker thread via the C++ promise; if it's a JS promise, we schedule
//    continuations that do the same.
//
// 4. On the worker thread, we unwrap the result of calling the JS fuzz target.
//    If it's an error (i.e., the fuzzer has found a crash), we exit from the
//    worker and thus from libfuzzer; otherwise we hand control back to the
//    fuzzer.
//
// 5. When we exit from the fuzzer (either because it terminates or because it
//    has found a crash), we run a final completion function on the main thread.
//    The function fulfills the JS promise that we created in step 1, and we're
//    done.
//
// Isn't asynchronous code a joy to work with?
//

namespace {

// The data type to use each time we schedule a call to the JavaScript fuzz
// target. It includes the fuzzer-generated input and a promise to signal
// completion of the fuzz target. (We don't care about the actual return value.)
struct FuzzerInput {
  const uint8_t *buffer;
  size_t size;
  std::promise<void> promise;
};

// Some prototypes are necessary to resolve mutual references...
void CallJsFuzzCallback(Napi::Env env, Napi::Function jsFuzzCallback,
                        std::nullptr_t *, FuzzerInput *data);
int FuzzCallbackAsync(const uint8_t *Data, size_t Size);

// A wrapper around a JS function that allows us to call the function from our
// worker thread.
using FuzzTargetFunction =
    Napi::TypedThreadSafeFunction<std::nullptr_t, FuzzerInput,
                                  CallJsFuzzCallback>;

// Custom exception to signal that we're done fuzzing. We use it to escape from
// libfuzzer and get back to JS land; the JS exception that caused us to throw
// is stored in the worker because of limitations of Napi::Error (which can't be
// copied outside of the main thread).
class FuzzingDoneException : public std::exception {};

// This is an asynchronous version of libfuzzer. It runs on a Node worker thread
// and calls back into the main thread in order to invoke the JS fuzz target.
// See the comment at the top of this file for an overview of the asynchronous
// scenario.
//
// After creating the fuzzer, schedule it for execution with Queue(). The return
// value of ResultPromise() is a JS promise that will be resolved when the
// fuzzer terminates; any JS exceptions from the fuzz target will be forwarded
// to the promise.
class AsyncFuzzer : public Napi::AsyncWorker {
  // The basic idea of Napi::AsyncWorker is that you override the Execute()
  // method to do whatever work needs to be done in the worker thread (in our
  // case, libfuzzer's main loop). When Execute() is done, OnOK() or OnError()
  // are called, depending on whether the worker thread has thrown an exception.

public:
  // Construct the fuzzer with a JS fuzz target and a list of libfuzzer
  // command-line arguments.
  AsyncFuzzer(Napi::Env env, Napi::Function &&target,
              std::vector<std::string> &&fuzzer_args)
      : Napi::AsyncWorker(env),
        fuzz_target_(FuzzTargetFunction::New(env, target,
                                             "FuzzerAsyncTargetFunction",
                                             /* queue size = */ 1,
                                             /* reference count = */ 1)),
        fuzzer_args_(fuzzer_args), fuzzer_result_(env) {}

  virtual ~AsyncFuzzer() {
    // The thread-safe function needs to be destroyed explicitly.
    fuzz_target_.Release();
  }

  // Fix Napi::AsyncWorker to handle fuzzing errors correctly.
  void OnExecute(Napi::Env) override {
    // Normally, all exceptions in Execute() are caught, converted to a string
    // (losing the JS stack trace in the process), and propagated to OnError().
    // Since we don't want this to happen to JS exceptions from the fuzz target,
    // we store them explicitly (see target_error_) and use FuzzingDoneException
    // as a simple marker that we'd like to exit.
    try {
      Execute();
    } catch (const FuzzingDoneException &) {
      // Nothing to do; we just use this exception to break out of the
      // fuzzer.
    } catch (const std::exception &e) {
      SetError(e.what());
    }
  }

  // The worker thread: run libfuzzer.
  virtual void Execute() override {
    StartLibFuzzer(fuzzer_args_, FuzzCallbackAsync);
  }

  // On the main thread, handle completion of the fuzzer (including cases where
  // the fuzzer found an error in the JS fuzz target) by resolving the promise
  // that we expose through ResultPromise().
  void OnOK() override {
    if (target_error_.IsEmpty()) {
      fuzzer_result_.Resolve(Env().Undefined());
    } else {
      fuzzer_result_.Reject(target_error_.Value());
    }
  }

  // On the main thread, handle errors during fuzzing (but not JS exceptions
  // thrown by the JS fuzz target).
  void OnError(const Napi::Error &error) override {
    auto message =
        "Unexpected error in the fuzzer; this is most likely a bug: " +
        error.Message();
    Napi::Error::Fatal("Async fuzzer", message.c_str());
  }

  // Clean up; we need to override Napi::AsyncWorker's default behavior because
  // it would self-delete, whereas we store our fuzzer instance in a global
  // std::optional that we need to reset.
  void Destroy() override;

  // A JS promise that callers can use to wait for the fuzzer to finish; it
  // receives any JS errors thrown by the fuzz target.
  Napi::Promise ResultPromise() { return fuzzer_result_.Promise(); }

  // The thread-safe JS function representing the fuzz target; for internal use
  // by our libfuzzer target.
  FuzzTargetFunction TargetFunction() { return fuzz_target_; }

  // Record a JS error thrown by the fuzz target.
  void SetTargetError(const Napi::Error &e) {
    // Apparently, the copy assignment operator of Napi::Error is broken; let's
    // use the copy constructor instead.
    target_error_ = Napi::Error{e};
  }

private:
  // The thread-safe version of the JS fuzz target, used by our libfuzzer target
  // function to call into JS.
  Napi::TypedThreadSafeFunction<std::nullptr_t, FuzzerInput, CallJsFuzzCallback>
      fuzz_target_;

  // The arguments that we pass to libfuzzer when we start it.
  const std::vector<std::string> fuzzer_args_;

  // A promise representing the result of the entire fuzzing process; we expect
  // users to block on it in JS land.
  Napi::Promise::Deferred fuzzer_result_;

  // Any JS error thrown by the fuzz target. We can't use the error-propagating
  // mechanism of Napi::AsyncWorker here because it only preserves the error
  // message while the stack trace is lost.
  Napi::Error target_error_;
};

// The only instance of the fuzzer; since libfuzzer has lots of global state, we
// can't run multiple fuzzers in parallel. The global variable is used by our
// C++ fuzz target to call into JS land, invoking the user's target code.
std::optional<AsyncFuzzer> gFuzzer;

void AsyncFuzzer::Destroy() { gFuzzer.reset(); }

// This is the fuzz target that we present to libfuzzer when fuzzing
// asynchronous JS code. It queues a call to the JS target and waits for it to
// complete before returning to libfuzzer.
int FuzzCallbackAsync(const uint8_t *Data, size_t Size) {
  FuzzerInput input{Data, Size};

  if (auto status = gFuzzer->TargetFunction().BlockingCall(&input);
      status != napi_ok) {
    Napi::Error::Fatal(
        "FuzzCallbackAsync",
        "Napi::TypedThreadSafeNapi::Function.BlockingCall() failed");
  }

  // Wait until the JavaScript fuzz target has finished; this will re-raise any
  // C++ errors that might have occurred unexpectedly. Note, however, that JS
  // errors from the fuzz target are stored in the fuzzer and signaled with the
  // dummy FuzzingDoneException.
  input.promise.get_future().get();

  return 0;
}

// Set an instance of FuzzingDoneException on the promise or terminate with a
// Node error; this function can only be called on the main thread.
template <typename T>
void SetPromiseFuzzingDoneExceptionOrDie(std::promise<T> &p) {
  try {
    p.set_exception(std::make_exception_ptr(FuzzingDoneException{}));
  } catch (...) {
    Napi::Error::Fatal("Async fuzzer",
                       "Failed to propagate a target crash; this is most "
                       "likely a bug"); // does not return
  }
}

// This function is the callback that gets executed in Node's main thread (i.e.,
// the JavaScript event loop thread) and thus we can call the JavaScript code
// and use the Node API to create JavaScript objects.
void CallJsFuzzCallback(Napi::Env env, Napi::Function jsFuzzCallback,
                        std::nullptr_t *, FuzzerInput *data) {
  if (env == nullptr) {
    Napi::Error::Fatal("Async fuzzer",
                       "Asynchronous work has been canceled unexpectedly; this "
                       "is most likely a bug"); // does not return
  }

  try {
    auto buffer = Napi::Buffer<uint8_t>::Copy(env, data->buffer, data->size);
    auto result = jsFuzzCallback.Call({buffer});

    // Users should be able to fuzz both synchronous and asynchronous code, so
    // we need to handle direct return values as well as promises.
    if (result.IsPromise()) {
      auto jsPromise = result.As<Napi::Object>();
      Napi::Value then = jsPromise["then"];
      then.As<Napi::Function>().Call(
          jsPromise,
          {// On success, resolve the promise.
           Napi::Function::New<>(env,
                                 [data](const Napi::CallbackInfo &info) {
                                   data->promise.set_value();
                                 }),
           // On error, record the error and set our FuzzingDoneException to
           // stop the fuzzer.
           Napi::Function::New<>(env, [=](const Napi::CallbackInfo &info) {
             gFuzzer->SetTargetError(info[0].As<Napi::Error>());
             SetPromiseFuzzingDoneExceptionOrDie(data->promise);
           })});
    } else {
      // Any non-promise return value means that the JS fuzz target has executed
      // without an error; JS errors would have been thrown as Napi::Error.
      data->promise.set_value();
    }
  } catch (const Napi::Error &e) {
    // The fuzz target is a synchronous function that has thrown a JS error;
    // let's record the error and stop the fuzzer.
    gFuzzer->SetTargetError(e);
    SetPromiseFuzzingDoneExceptionOrDie(data->promise);
  } catch (...) {
    // Any other exception is most likely a bug that shouldn't happen. We can't
    // do much, so we just terminate Node with an appropriate error message.
    Napi::Error::Fatal(
        "Async fuzzer",
        "Unexpected error while calling the fuzz target; this is most "
        "likely a bug"); // does not return
  }
}

} // namespace

// Start libfuzzer with a JS fuzz target asynchronously.
//
// This is a JS-enabled version of libfuzzer's main function (see FuzzerMain.cpp
// in the compiler-rt source). It takes the fuzz target, which must be a JS
// function taking a single data argument, as its first parameter; the fuzz
// target's return value is ignored. The second argument is an array of
// (command-line) arguments to pass to libfuzzer.
//
// In order not to block JavaScript event loop, we start libfuzzer in a separate
// thread and use a typed thread-safe function to manage calls to the JavaScript
// fuzz target which can only happen in the addon's main thread. This function
// returns a promise so that the JavaScript code can use `catch()` to check when
// the promise is rejected.
Napi::Value StartFuzzingAsync(const Napi::CallbackInfo &info) {
  if (info.Length() != 2 || !info[0].IsFunction() || !info[1].IsArray()) {
    throw Napi::Error::New(info.Env(),
                           "Need two arguments, which must be the fuzz target "
                           "function and an array of libfuzzer arguments");
  }

  // Store the fuzzer globally, so that we can use it from the worker thread.
  gFuzzer.emplace(info.Env(), info[0].As<Napi::Function>(),
                  LibFuzzerArgs(info.Env(), info[1].As<Napi::Array>()));
  gFuzzer->Queue();
  return gFuzzer->ResultPromise();
}

void StopFuzzingAsync(const Napi::CallbackInfo &) {
  libfuzzer::PrintCrashingInput();
  // We call _Exit to immediately terminate the process without performing any
  // cleanup including libfuzzer exit handlers. These handlers print information
  // about the native libfuzzer target which is neither relevant nor actionable
  // for JavaScript developers. We provide the relevant crash information
  // such as the error message and stack trace in Jazzer.js CLI.
  _Exit(libfuzzer::ExitErrorCode);
}
