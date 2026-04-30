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

#include "libafl_runtime.h"

#include "libafl_findings.h"
#include "libafl_options.h"
#include "libafl_regression.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cctype>
#include <chrono>
#include <condition_variable>
#include <csetjmp>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <functional>
#include <future>
#include <iomanip>
#include <iostream>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <system_error>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <io.h>
#include <process.h>
#define GetPID _getpid
#else
#include <unistd.h>
#define GetPID getpid
#endif

#include "shared/coverage.h"
#include "shared/libfuzzer.h"
#include "shared/tracing.h"
#include "utils.h"

namespace {
constexpr int kExecutionContinue = kJazzerLibAflExecutionContinue;
constexpr int kExecutionFinding = kJazzerLibAflExecutionFinding;
constexpr int kExecutionStop = kJazzerLibAflExecutionStop;
constexpr int kExecutionFatal = kJazzerLibAflExecutionFatal;
constexpr int kExecutionTimeout = kJazzerLibAflExecutionTimeout;

constexpr int kRuntimeOk = kJazzerLibAflRuntimeOk;
constexpr int kRuntimeFoundFinding = kJazzerLibAflRuntimeFoundFinding;
constexpr int kRuntimeStopped = kJazzerLibAflRuntimeStopped;
constexpr int kRuntimeFatal = kJazzerLibAflRuntimeFatal;
constexpr int kRuntimeFoundTimeout = kJazzerLibAflRuntimeFoundTimeout;

std::atomic_bool gLibAflRuntimeActive{false};

class ScopedLibAflRuntime {
public:
  ~ScopedLibAflRuntime() {
    gLibAflRuntimeActive.store(false, std::memory_order_release);
  }

  ScopedLibAflRuntime(const ScopedLibAflRuntime &) = delete;
  ScopedLibAflRuntime &operator=(const ScopedLibAflRuntime &) = delete;

private:
  friend std::unique_ptr<ScopedLibAflRuntime>
  AcquireLibAflRuntime(Napi::Env env);

  ScopedLibAflRuntime() = default;
};

class ScopedSignalHandler {
public:
  ScopedSignalHandler(int signum, void (*handler)(int))
      : signum_(signum), previous_handler_(std::signal(signum, handler)) {}

  ~ScopedSignalHandler() {
    if (previous_handler_ != SIG_ERR) {
      std::signal(signum_, previous_handler_);
    }
  }

  ScopedSignalHandler(const ScopedSignalHandler &) = delete;
  ScopedSignalHandler &operator=(const ScopedSignalHandler &) = delete;

private:
  int signum_;
  void (*previous_handler_)(int);
};

std::unique_ptr<ScopedLibAflRuntime> AcquireLibAflRuntime(Napi::Env env) {
  bool expected = false;
  if (!gLibAflRuntimeActive.compare_exchange_strong(
          expected, true, std::memory_order_acq_rel,
          std::memory_order_acquire)) {
    throw Napi::Error::New(
        env, "The LibAFL backend only supports one active run per process");
  }

  return std::unique_ptr<ScopedLibAflRuntime>(new ScopedLibAflRuntime());
}

struct SyncWatchdogState {
  std::thread thread;
  std::mutex mutex;
  std::condition_variable cv;
  bool should_stop = false;
  bool execution_armed = false;
  std::chrono::steady_clock::time_point deadline;
  std::vector<uint8_t> current_input;
};

struct SyncFuzzTargetContext {
  SyncFuzzTargetContext(Napi::Env env, Napi::Function target,
                        Napi::Function js_stop_callback, LibAflOptions options)
      : env(env), target(target), is_resolved(false),
        deferred(Napi::Promise::Deferred::New(env)),
        js_stop_callback(js_stop_callback), options(std::move(options)) {}

  Napi::Env env;
  Napi::Function target;
  bool is_resolved;
  Napi::Promise::Deferred deferred;
  Napi::Function js_stop_callback;
  LibAflOptions options;
  SyncWatchdogState watchdog;
  volatile std::sig_atomic_t signal_status = 0;
  volatile std::sig_atomic_t execution_active = 0;
  volatile std::sig_atomic_t sigints = 0;
  std::jmp_buf execution_context;
};

struct AsyncExecutionState {
  std::promise<int> promise;
  std::atomic<bool> settled = false;
  bool done_called = false;
  bool done_succeeded = false;
  bool callback_invocation_completed = false;
};

struct AsyncDataType {
  std::vector<uint8_t> data;
  std::shared_ptr<AsyncExecutionState> state;

  AsyncDataType() = delete;
};

struct AsyncFuzzTargetContext {
  explicit AsyncFuzzTargetContext(
      Napi::Env env, LibAflOptions options,
      std::unique_ptr<ScopedLibAflRuntime> runtime_guard)
      : deferred(Napi::Promise::Deferred::New(env)),
        options(std::move(options)), runtime_guard(std::move(runtime_guard)) {}

  std::thread native_thread;
  Napi::Promise::Deferred deferred;
  Napi::Reference<Napi::Value> deferred_rejection;
  LibAflOptions options;
  std::unique_ptr<ScopedLibAflRuntime> runtime_guard;
  bool is_resolved = false;
  int run_status = kRuntimeOk;
  volatile std::sig_atomic_t execution_active = 0;
  volatile std::sig_atomic_t sigints = 0;
  std::jmp_buf execution_context;
};

using AsyncFinalizerDataType = void;
void CallJsFuzzCallback(Napi::Env env, Napi::Function js_fuzz_callback,
                        AsyncFuzzTargetContext *context, AsyncDataType *data);
using AsyncTsfn =
    Napi::TypedThreadSafeFunction<AsyncFuzzTargetContext, AsyncDataType,
                                  CallJsFuzzCallback>;

SyncFuzzTargetContext *gActiveSyncContext = nullptr;
AsyncFuzzTargetContext *gActiveAsyncContext = nullptr;
AsyncTsfn gAsyncTsfn;
JazzerLibAflFindingInfo gFindingInfo{};

void StoreDeferredRejection(AsyncFuzzTargetContext *context,
                            const Napi::Value &error) {
  if (!context->deferred_rejection.IsEmpty()) {
    return;
  }
  context->deferred_rejection = Napi::Persistent(error);
}

void SettleLibAflRun(Napi::Env env, Napi::Promise::Deferred &deferred,
                     bool &is_resolved, int status) {
  if (is_resolved) {
    return;
  }

  auto reject = [&](const char *message) {
    is_resolved = true;
    deferred.Reject(Napi::Error::New(env, message).Value());
  };

  switch (status) {
  case kRuntimeFatal:
    reject("The LibAFL backend failed internally");
    return;
  case kRuntimeFoundTimeout:
    reject("Exceeded timeout while executing one fuzz input");
    return;
  case kRuntimeFoundFinding:
    reject("The LibAFL backend found a crashing input");
    return;
  default:
    is_resolved = true;
    deferred.Resolve(env.Undefined());
    return;
  }
}

bool IsExecutionSettled(const std::shared_ptr<AsyncExecutionState> &state) {
  return state->settled.load(std::memory_order_acquire);
}

bool TryClaimExecution(const std::shared_ptr<AsyncExecutionState> &state) {
  bool expected = false;
  if (!state->settled.compare_exchange_strong(expected, true,
                                              std::memory_order_acq_rel,
                                              std::memory_order_acquire)) {
    return false;
  }
  return true;
}

void PublishExecutionStatus(const std::shared_ptr<AsyncExecutionState> &state,
                            int status) {
  state->promise.set_value(status);
}

bool TryPublishExecutionStatus(
    const std::shared_ptr<AsyncExecutionState> &state, int status) {
  if (!TryClaimExecution(state)) {
    return false;
  }
  PublishExecutionStatus(state, status);
  return true;
}

Napi::Value NormalizeAsyncError(Napi::Env env, const Napi::Value &error) {
  if (error.IsObject()) {
    return error;
  }
  return Napi::Error::New(env, error.ToString()).Value();
}

void ReportAsyncFinding(AsyncFuzzTargetContext *context, Napi::Env env,
                        const std::shared_ptr<AsyncExecutionState> &state,
                        const Napi::Value &error,
                        const std::vector<uint8_t> &input) {
  if (!TryClaimExecution(state)) {
    return;
  }

  auto normalized_error = NormalizeAsyncError(env, error);
  auto summary = std::string("The LibAFL backend found a crashing input");
  const auto artifact = WriteArtifact(context->options.artifact_prefix, "crash",
                                      input.data(), input.size(), false);
  try {
    summary = DescribeJsError(env, normalized_error);
  } catch (const std::exception &exception) {
    normalized_error =
        Napi::Error::New(env, std::string("Internal fuzzer error - ") +
                                  exception.what())
            .Value();
    summary = normalized_error.ToString().Utf8Value();
  }

  RecordFindingInfo(&gFindingInfo, artifact, summary);
  StoreDeferredRejection(context, normalized_error);
  PublishExecutionStatus(state, kExecutionFinding);
}

void ReportAsyncInternalError(AsyncFuzzTargetContext *context, Napi::Env env,
                              const std::shared_ptr<AsyncExecutionState> &state,
                              const std::string &message) {
  if (!TryClaimExecution(state)) {
    return;
  }

  StoreDeferredRejection(context, Napi::Error::New(env, message).Value());
  PublishExecutionStatus(state, kExecutionFatal);
}

void SettleAsyncLibAflRun(Napi::Env env, AsyncFuzzTargetContext *context) {
  if (context->is_resolved) {
    return;
  }

  if (!context->deferred_rejection.IsEmpty()) {
    context->is_resolved = true;
    context->deferred.Reject(context->deferred_rejection.Value());
    context->deferred_rejection.Reset();
    return;
  }

  SettleLibAflRun(env, context->deferred, context->is_resolved,
                  context->run_status);
}

void StartSyncWatchdog(SyncFuzzTargetContext *context) {
  if (context->options.timeout_millis == 0) {
    return;
  }

  context->watchdog.thread = std::thread([context]() {
    auto &watchdog = context->watchdog;
    std::unique_lock<std::mutex> lock(watchdog.mutex);
    while (true) {
      watchdog.cv.wait(lock, [&watchdog] {
        return watchdog.should_stop || watchdog.execution_armed;
      });

      if (watchdog.should_stop) {
        return;
      }

      const auto deadline = watchdog.deadline;
      const auto resumed =
          watchdog.cv.wait_until(lock, deadline, [&watchdog, deadline] {
            return watchdog.should_stop || !watchdog.execution_armed ||
                   watchdog.deadline != deadline;
          });
      if (resumed) {
        if (watchdog.should_stop) {
          return;
        }
        continue;
      }

      auto timed_out_input = watchdog.current_input;
      lock.unlock();
      ExitOnTimeout(&gFindingInfo, context->options.timeout_millis,
                    context->options.artifact_prefix, timed_out_input);
    }
  });
}

void ArmSyncWatchdog(SyncFuzzTargetContext *context, const uint8_t *data,
                     size_t size) {
  if (context->options.timeout_millis == 0) {
    return;
  }

  auto &watchdog = context->watchdog;
  std::lock_guard<std::mutex> lock(watchdog.mutex);
  watchdog.current_input.assign(data, data + size);
  watchdog.deadline =
      std::chrono::steady_clock::now() +
      std::chrono::milliseconds(context->options.timeout_millis);
  watchdog.execution_armed = true;
  watchdog.cv.notify_one();
}

void DisarmSyncWatchdog(SyncFuzzTargetContext *context) {
  if (context->options.timeout_millis == 0) {
    return;
  }

  auto &watchdog = context->watchdog;
  std::lock_guard<std::mutex> lock(watchdog.mutex);
  watchdog.execution_armed = false;
  watchdog.current_input.clear();
  watchdog.cv.notify_one();
}

void StopSyncWatchdog(SyncFuzzTargetContext *context) {
  if (context->options.timeout_millis == 0) {
    return;
  }

  auto &watchdog = context->watchdog;
  {
    std::lock_guard<std::mutex> lock(watchdog.mutex);
    watchdog.should_stop = true;
    watchdog.execution_armed = false;
  }
  watchdog.cv.notify_one();
  if (watchdog.thread.joinable()) {
    watchdog.thread.join();
  }
}

class ScopedSyncWatchdog {
public:
  ScopedSyncWatchdog(SyncFuzzTargetContext *context, const uint8_t *data,
                     size_t size)
      : context_(context) {
    ArmSyncWatchdog(context_, data, size);
  }

  ~ScopedSyncWatchdog() { DisarmSyncWatchdog(context_); }

private:
  SyncFuzzTargetContext *context_;
};

void SyncSigintHandler(int signum) {
  auto *context = gActiveSyncContext;
  if (context == nullptr) {
    _Exit(libfuzzer::RETURN_CONTINUE);
  }

  context->signal_status = signum;
  if (context->sigints > 0) {
    _Exit(libfuzzer::RETURN_CONTINUE);
  }
  context->sigints++;
}

void SyncErrorSignalHandler(int signum) {
  auto *context = gActiveSyncContext;
  if (context == nullptr || context->execution_active == 0) {
    _Exit(libfuzzer::EXIT_ERROR_SEGV);
  }

  context->signal_status = signum;
  std::longjmp(context->execution_context, signum);
}

int ExecuteSyncInput(void *user_data, const uint8_t *data, size_t size) {
  auto *context = static_cast<SyncFuzzTargetContext *>(user_data);
  auto scope = Napi::HandleScope(context->env);
  ScopedSyncWatchdog watchdog(context, data, size);

  ClearCoverageCounters();
  ClearCompareFeedbackMap();

  try {
    auto buffer = Napi::Buffer<uint8_t>::Copy(context->env, data, size);
    // Initialize the jump target before signal handlers can treat this
    // invocation as actively executing user code.
    const auto signal_status = setjmp(context->execution_context);
    context->execution_active = 1;
    if (signal_status == 0) {
      auto result = context->target.Call({buffer});
      if (result.IsPromise()) {
        AsyncReturnsHandler();
      } else {
        SyncReturnsHandler();
      }
    }
    context->execution_active = 0;
  } catch (const Napi::Error &error) {
    context->execution_active = 0;
    if (!context->is_resolved) {
      const auto artifact = WriteArtifact(context->options.artifact_prefix,
                                          "crash", data, size, false);
      RecordFindingInfo(&gFindingInfo, artifact,
                        DescribeJsError(context->env, error.Value()));
      context->is_resolved = true;
      context->deferred.Reject(error.Value());
    }
    return kExecutionFinding;
  } catch (const std::exception &exception) {
    context->execution_active = 0;
    ExitWithUnexpectedError(exception);
  }

  if (context->signal_status != 0) {
    if (context->signal_status == SIGSEGV) {
      std::cerr << "==" << static_cast<unsigned long>(GetPID())
                << "== Segmentation Fault" << std::endl;
      libfuzzer::PrintCrashingInput();
      _Exit(libfuzzer::EXIT_ERROR_SEGV);
    }

    auto exit_code = Napi::Number::New(context->env, 0);
    if (context->signal_status != SIGINT) {
      exit_code = Napi::Number::New(context->env, context->signal_status);
    }

    context->js_stop_callback.Call({exit_code});
    context->signal_status = 0;
    return kExecutionStop;
  }

  return kExecutionContinue;
}

void CallJsFuzzCallback(Napi::Env env, Napi::Function js_fuzz_callback,
                        AsyncFuzzTargetContext *context, AsyncDataType *input) {
  auto state = input->state;
  const auto current_input = input->data;

  try {
    if (context->sigints > 0) {
      TryPublishExecutionStatus(state, kExecutionStop);
      return;
    }

    // Initialize the jump target before signal handlers can treat this
    // invocation as actively executing user code.
    const auto signal_status = setjmp(context->execution_context);
    context->execution_active = 1;
    if (signal_status == SIGSEGV) {
      context->execution_active = 0;
      std::cerr << "==" << static_cast<unsigned long>(GetPID())
                << "== Segmentation Fault" << std::endl;
      libfuzzer::PrintCrashingInput();
      _Exit(libfuzzer::EXIT_ERROR_SEGV);
    }

    if (env == nullptr) {
      context->execution_active = 0;
      TryPublishExecutionStatus(state, kExecutionFatal);
      return;
    }

    auto buffer = Napi::Buffer<uint8_t>::Copy(env, current_input.data(),
                                              current_input.size());
    auto parameter_count = js_fuzz_callback.As<Napi::Object>()
                               .Get("length")
                               .As<Napi::Number>()
                               .Int32Value();

    if (parameter_count > 1) {
      auto done = Napi::Function::New(env, [=](const Napi::CallbackInfo &info) {
        if (IsExecutionSettled(state)) {
          return;
        }

        if (state->done_called) {
          auto error =
              Napi::Error::New(env, "Expected done to be called once, but it "
                                    "was called multiple times.")
                  .Value();
          ReportAsyncFinding(context, env, state, error, current_input);
          return;
        }

        state->done_called = true;
        const auto has_error =
            info.Length() > 0 && !(info[0].IsNull() || info[0].IsUndefined());
        if (has_error) {
          ReportAsyncFinding(context, env, state, info[0], current_input);
          return;
        }

        if (state->callback_invocation_completed) {
          TryPublishExecutionStatus(state, kExecutionContinue);
        } else {
          state->done_succeeded = true;
        }
      });

      auto result = js_fuzz_callback.Call({buffer, done});
      state->callback_invocation_completed = true;
      context->execution_active = 0;
      if (result.IsPromise()) {
        AsyncReturnsHandler();
        auto error =
            Napi::Error::New(env, "Internal fuzzer error - Either async or "
                                  "done callback based fuzz tests allowed.")
                .Value();
        ReportAsyncFinding(context, env, state, error, current_input);
      } else {
        SyncReturnsHandler();
        if (state->done_succeeded) {
          TryPublishExecutionStatus(state, kExecutionContinue);
        }
      }
      return;
    }

    auto result = js_fuzz_callback.Call({buffer});
    context->execution_active = 0;
    if (result.IsPromise()) {
      AsyncReturnsHandler();
      auto js_promise = result.As<Napi::Object>();
      auto then = js_promise.Get("then").As<Napi::Function>();
      then.Call(js_promise,
                {Napi::Function::New(env,
                                     [=](const Napi::CallbackInfo &) {
                                       TryPublishExecutionStatus(
                                           state, kExecutionContinue);
                                     }),
                 Napi::Function::New(env, [=](const Napi::CallbackInfo &info) {
                   auto error =
                       info.Length() > 0
                           ? info[0]
                           : Napi::Error::New(env, "Unknown promise rejection")
                                 .Value();
                   ReportAsyncFinding(context, env, state, error,
                                      current_input);
                 })});
    } else {
      SyncReturnsHandler();
      TryPublishExecutionStatus(state, kExecutionContinue);
    }
  } catch (const Napi::Error &error) {
    context->execution_active = 0;
    ReportAsyncFinding(context, env, state, error.Value(), current_input);
  } catch (const std::exception &exception) {
    context->execution_active = 0;
    ReportAsyncInternalError(
        context, env, state,
        std::string("Internal fuzzer error - ").append(exception.what()));
  }
}

void AsyncSigintHandler(int signum) {
  auto *context = gActiveAsyncContext;
  if (context == nullptr) {
    _Exit(libfuzzer::RETURN_CONTINUE);
  }

  if (context->sigints > 0) {
    _Exit(libfuzzer::RETURN_CONTINUE);
  }
  context->sigints = signum;
}

void AsyncErrorSignalHandler(int signum) {
  auto *context = gActiveAsyncContext;
  if (context == nullptr || context->execution_active == 0) {
    _Exit(libfuzzer::EXIT_ERROR_SEGV);
  }

  std::longjmp(context->execution_context, signum);
}

int ExecuteAsyncInput(void *user_data, const uint8_t *data, size_t size) {
  auto *context = static_cast<AsyncFuzzTargetContext *>(user_data);

  ClearCoverageCounters();
  ClearCompareFeedbackMap();

  auto execution_state = std::make_shared<AsyncExecutionState>();
  auto *input = new AsyncDataType{
      std::vector<uint8_t>(data, data + size),
      execution_state,
  };

  auto future = execution_state->promise.get_future();
  auto status = gAsyncTsfn.BlockingCall(input);
  if (status != napi_ok) {
    delete input;
    Napi::Error::Fatal("StartLibAflAsync",
                       "TypedThreadSafeFunction.BlockingCall() failed");
  }

  if (context->options.timeout_millis > 0) {
    auto timeout = std::chrono::milliseconds(context->options.timeout_millis);
    if (future.wait_for(timeout) == std::future_status::timeout) {
      ExitOnTimeout(&gFindingInfo, context->options.timeout_millis,
                    context->options.artifact_prefix, input->data);
    }
  }

  try {
    auto result = future.get();
    delete input;
    return result;
  } catch (const std::exception &exception) {
    delete input;
    ExitWithUnexpectedError(exception);
  }
}

int RunLibAflRuntime(const LibAflOptions &options,
                     const JazzerLibAflRuntimeSharedMaps &maps,
                     JazzerLibAflExecuteCallback execute_one, void *user_data) {
  std::vector<const char *> corpus_directories;
  corpus_directories.reserve(options.corpus_directories.size());
  for (const auto &directory : options.corpus_directories) {
    corpus_directories.push_back(directory.c_str());
  }

  std::vector<const char *> dictionary_files;
  dictionary_files.reserve(options.dictionary_files.size());
  for (const auto &dictionary : options.dictionary_files) {
    dictionary_files.push_back(dictionary.c_str());
  }

  JazzerLibAflRuntimeOptions runtime_options{
      options.runs,
      options.seed,
      options.max_len,
      options.timeout_millis,
      options.max_total_time_seconds,
      corpus_directories.empty() ? nullptr : corpus_directories.data(),
      corpus_directories.size(),
      dictionary_files.empty() ? nullptr : dictionary_files.data(),
      dictionary_files.size(),
  };
  return jazzer_libafl_runtime_run(&runtime_options, &maps, execute_one,
                                   user_data);
}
} // namespace

Napi::Value StartLibAfl(const Napi::CallbackInfo &info) {
  if (info.Length() != 3 || !info[0].IsFunction() || !info[1].IsObject() ||
      !info[2].IsFunction()) {
    throw Napi::Error::New(
        info.Env(),
        "Need three arguments, which must be the fuzz target function, a "
        "LibAFL options object, and a stop callback");
  }

  auto options = ParseLibAflOptions(info.Env(), info[1].As<Napi::Object>());
  auto runtime_guard = AcquireLibAflRuntime(info.Env());
  ClearFindingInfo(&gFindingInfo);
  auto maps = SharedMapsForLibAflRuntime(info.Env(), &gFindingInfo);

  SyncFuzzTargetContext context(info.Env(), info[0].As<Napi::Function>(),
                                info[2].As<Napi::Function>(),
                                std::move(options));
  gActiveSyncContext = &context;

  StartSyncWatchdog(&context);

  auto status = kRuntimeOk;
  {
    ScopedSignalHandler sigint_handler(SIGINT, SyncSigintHandler);
    ScopedSignalHandler sigsegv_handler(SIGSEGV, SyncErrorSignalHandler);

    if (context.options.mode == LibAflOptions::Mode::kRegression) {
      status = ReplayRegressionInputs(
          context.options, [&context](const uint8_t *data, size_t size) {
            return ExecuteSyncInput(&context, data, size);
          });
    } else {
      status =
          RunLibAflRuntime(context.options, maps, ExecuteSyncInput, &context);
    }
  }

  StopSyncWatchdog(&context);
  gActiveSyncContext = nullptr;

  SettleLibAflRun(info.Env(), context.deferred, context.is_resolved, status);

  return context.deferred.Promise();
}

Napi::Value StartLibAflAsync(const Napi::CallbackInfo &info) {
  if (info.Length() != 2 || !info[0].IsFunction() || !info[1].IsObject()) {
    throw Napi::Error::New(info.Env(),
                           "Need two arguments, which must be the fuzz target "
                           "function and a LibAFL options object");
  }

  auto options = ParseLibAflOptions(info.Env(), info[1].As<Napi::Object>());
  auto runtime_guard = AcquireLibAflRuntime(info.Env());
  ClearFindingInfo(&gFindingInfo);
  auto maps = SharedMapsForLibAflRuntime(info.Env(), &gFindingInfo);
  auto context = std::make_unique<AsyncFuzzTargetContext>(
      info.Env(), std::move(options), std::move(runtime_guard));

  gAsyncTsfn = AsyncTsfn::New(
      info.Env(), info[0].As<Napi::Function>(), "LibAflAsyncAddon", 0, 1,
      context.get(),
      [](Napi::Env env, AsyncFinalizerDataType *, AsyncFuzzTargetContext *ctx) {
        Napi::HandleScope scope(env);
        ctx->native_thread.join();
        ctx->runtime_guard.reset();
        SettleAsyncLibAflRun(env, ctx);
        delete ctx;
      });

  auto *context_ptr = context.get();
  context_ptr->native_thread = std::thread(
      [maps](AsyncFuzzTargetContext *ctx) {
        gActiveAsyncContext = ctx;
        {
          ScopedSignalHandler sigsegv_handler(SIGSEGV, AsyncErrorSignalHandler);
          ScopedSignalHandler sigint_handler(SIGINT, AsyncSigintHandler);

          if (ctx->options.mode == LibAflOptions::Mode::kRegression) {
            ctx->run_status = ReplayRegressionInputs(
                ctx->options, [ctx](const uint8_t *data, size_t size) {
                  return ExecuteAsyncInput(ctx, data, size);
                });
          } else {
            ctx->run_status =
                RunLibAflRuntime(ctx->options, maps, ExecuteAsyncInput, ctx);
          }
        }
        gActiveAsyncContext = nullptr;
        gAsyncTsfn.Release();
      },
      context_ptr);

  auto promise = context_ptr->deferred.Promise();
  context.release();
  return promise;
}
