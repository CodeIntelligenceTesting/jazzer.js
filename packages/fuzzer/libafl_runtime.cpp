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
  volatile int sigints = 0;
  std::jmp_buf execution_context;
};

struct AsyncExecutionState {
  std::promise<int> promise;
  std::atomic<bool> settled = false;
};

struct AsyncDataType {
  std::vector<uint8_t> data;
  std::shared_ptr<AsyncExecutionState> state;

  AsyncDataType() = delete;
};

struct AsyncFuzzTargetContext {
  explicit AsyncFuzzTargetContext(Napi::Env env, LibAflOptions options)
      : deferred(Napi::Promise::Deferred::New(env)),
        options(std::move(options)) {}

  std::thread native_thread;
  Napi::Promise::Deferred deferred;
  LibAflOptions options;
  bool is_resolved = false;
  bool is_done_called = false;
  int run_status = kRuntimeOk;
  volatile int sigints = 0;
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

void RejectDeferredIfNeeded(AsyncFuzzTargetContext *context,
                            const Napi::Value &error) {
  if (context->is_resolved) {
    return;
  }
  context->deferred.Reject(error);
  context->is_resolved = true;
}

bool TrySetExecutionStatus(const std::shared_ptr<AsyncExecutionState> &state,
                           int status) {
  bool expected = false;
  if (!state->settled.compare_exchange_strong(expected, true,
                                              std::memory_order_acq_rel,
                                              std::memory_order_acquire)) {
    return false;
  }
  state->promise.set_value(status);
  return true;
}

void ReportAsyncFinding(AsyncFuzzTargetContext *context, Napi::Env env,
                        const std::shared_ptr<AsyncExecutionState> &state,
                        const Napi::Value &error,
                        const std::vector<uint8_t> &input) {
  if (TrySetExecutionStatus(state, kExecutionFinding)) {
    const auto artifact =
        WriteArtifact(context->options.artifact_prefix, "crash", input.data(),
                      input.size(), false);
    RecordFindingInfo(&gFindingInfo, artifact, DescribeJsError(env, error));
  }
  RejectDeferredIfNeeded(context, error);
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
  std::cerr << std::endl;
  gActiveSyncContext->signal_status = signum;
  if (gActiveSyncContext->sigints > 0) {
    _Exit(libfuzzer::RETURN_CONTINUE);
  }
  gActiveSyncContext->sigints++;
}

void SyncErrorSignalHandler(int signum) {
  gActiveSyncContext->signal_status = signum;
  std::longjmp(gActiveSyncContext->execution_context, signum);
}

int ExecuteSyncInput(void *user_data, const uint8_t *data, size_t size) {
  auto *context = static_cast<SyncFuzzTargetContext *>(user_data);
  auto scope = Napi::HandleScope(context->env);
  ScopedSyncWatchdog watchdog(context, data, size);

  ClearCoverageCounters();
  ClearCompareFeedbackMap();

  try {
    auto buffer = Napi::Buffer<uint8_t>::Copy(context->env, data, size);
    if (setjmp(context->execution_context) == 0) {
      auto result = context->target.Call({buffer});
      if (result.IsPromise()) {
        AsyncReturnsHandler();
      } else {
        SyncReturnsHandler();
      }
    }
  } catch (const Napi::Error &error) {
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
      TrySetExecutionStatus(state, kExecutionStop);
      context->deferred.Resolve(env.Undefined());
      context->is_resolved = true;
      return;
    }

    if (setjmp(context->execution_context) == SIGSEGV) {
      std::cerr << "==" << static_cast<unsigned long>(GetPID())
                << "== Segmentation Fault" << std::endl;
      libfuzzer::PrintCrashingInput();
      _Exit(libfuzzer::EXIT_ERROR_SEGV);
    }

    if (env == nullptr) {
      TrySetExecutionStatus(state, kExecutionFatal);
      return;
    }

    auto buffer = Napi::Buffer<uint8_t>::Copy(env, current_input.data(),
                                              current_input.size());
    auto parameter_count = js_fuzz_callback.As<Napi::Object>()
                               .Get("length")
                               .As<Napi::Number>()
                               .Int32Value();

    if (parameter_count > 1) {
      context->is_done_called = false;
      auto done = Napi::Function::New(env, [=](const Napi::CallbackInfo &info) {
        if (context->is_resolved) {
          return;
        }

        if (context->is_done_called) {
          auto error =
              Napi::Error::New(env, "Expected done to be called once, but it "
                                    "was called multiple times.")
                  .Value();
          ReportAsyncFinding(context, env, state, error, current_input);
          return;
        }

        context->is_done_called = true;
        const auto has_error =
            info.Length() > 0 && !(info[0].IsNull() || info[0].IsUndefined());
        if (has_error) {
          auto error = info[0];
          if (!error.IsObject()) {
            error = Napi::Error::New(env, error.ToString()).Value();
          }
          ReportAsyncFinding(context, env, state, error, current_input);
        } else {
          TrySetExecutionStatus(state, kExecutionContinue);
        }
      });

      auto result = js_fuzz_callback.Call({buffer, done});
      if (result.IsPromise()) {
        AsyncReturnsHandler();
        auto error =
            Napi::Error::New(env, "Internal fuzzer error - Either async or "
                                  "done callback based fuzz tests allowed.")
                .Value();
        ReportAsyncFinding(context, env, state, error, current_input);
      } else {
        SyncReturnsHandler();
      }
      return;
    }

    auto result = js_fuzz_callback.Call({buffer});
    if (result.IsPromise()) {
      AsyncReturnsHandler();
      auto js_promise = result.As<Napi::Object>();
      auto then = js_promise.Get("then").As<Napi::Function>();
      then.Call(js_promise,
                {Napi::Function::New(env,
                                     [=](const Napi::CallbackInfo &) {
                                       TrySetExecutionStatus(
                                           state, kExecutionContinue);
                                     }),
                 Napi::Function::New(env, [=](const Napi::CallbackInfo &info) {
                   auto error =
                       info.Length() > 0
                           ? info[0]
                           : Napi::Error::New(env, "Unknown promise rejection")
                                 .Value();
                   if (!error.IsObject()) {
                     error = Napi::Error::New(env, error.ToString()).Value();
                   }
                   ReportAsyncFinding(context, env, state, error,
                                      current_input);
                 })});
    } else {
      SyncReturnsHandler();
      TrySetExecutionStatus(state, kExecutionContinue);
    }
  } catch (const Napi::Error &error) {
    ReportAsyncFinding(context, env, state, error.Value(), current_input);
  } catch (const std::exception &exception) {
    TrySetExecutionStatus(state, kExecutionFatal);
    auto message =
        std::string("Internal fuzzer error - ").append(exception.what());
    RejectDeferredIfNeeded(context, Napi::Error::New(env, message).Value());
  }
}

void AsyncSigintHandler(int signum) {
  std::cerr << std::endl;
  if (gActiveAsyncContext->sigints > 0) {
    _Exit(libfuzzer::RETURN_CONTINUE);
  }
  gActiveAsyncContext->sigints = signum;
}

void AsyncErrorSignalHandler(int signum) {
  std::longjmp(gActiveAsyncContext->execution_context, signum);
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
  ClearFindingInfo(&gFindingInfo);
  auto maps = SharedMapsForLibAflRuntime(info.Env(), &gFindingInfo);

  SyncFuzzTargetContext context(info.Env(), info[0].As<Napi::Function>(),
                                info[2].As<Napi::Function>(),
                                std::move(options));
  gActiveSyncContext = &context;

  StartSyncWatchdog(&context);
  signal(SIGINT, SyncSigintHandler);
  signal(SIGSEGV, SyncErrorSignalHandler);

  auto status = kRuntimeOk;
  if (context.options.mode == LibAflOptions::Mode::kRegression) {
    status = ReplayRegressionInputs(
        context.options, [&context](const uint8_t *data, size_t size) {
          return ExecuteSyncInput(&context, data, size);
        });
  } else {
    status =
        RunLibAflRuntime(context.options, maps, ExecuteSyncInput, &context);
  }

  signal(SIGINT, SIG_DFL);
  signal(SIGSEGV, SIG_DFL);
  StopSyncWatchdog(&context);
  gActiveSyncContext = nullptr;

  if (status == kRuntimeFatal && !context.is_resolved) {
    context.is_resolved = true;
    context.deferred.Reject(
        Napi::Error::New(info.Env(), "The LibAFL backend failed internally")
            .Value());
  } else if (status == kRuntimeFoundTimeout && !context.is_resolved) {
    context.is_resolved = true;
    context.deferred.Reject(
        Napi::Error::New(info.Env(),
                         "Exceeded timeout while executing one fuzz input")
            .Value());
  } else if (status == kRuntimeFoundFinding && !context.is_resolved) {
    context.is_resolved = true;
    context.deferred.Reject(
        Napi::Error::New(info.Env(),
                         "The LibAFL backend found a crashing input")
            .Value());
  }

  if (!context.is_resolved) {
    context.deferred.Resolve(context.env.Undefined());
  }

  return context.deferred.Promise();
}

Napi::Value StartLibAflAsync(const Napi::CallbackInfo &info) {
  if (info.Length() != 2 || !info[0].IsFunction() || !info[1].IsObject()) {
    throw Napi::Error::New(info.Env(),
                           "Need two arguments, which must be the fuzz target "
                           "function and a LibAFL options object");
  }

  auto options = ParseLibAflOptions(info.Env(), info[1].As<Napi::Object>());
  ClearFindingInfo(&gFindingInfo);
  auto maps = SharedMapsForLibAflRuntime(info.Env(), &gFindingInfo);
  auto *context = new AsyncFuzzTargetContext(info.Env(), std::move(options));

  gAsyncTsfn = AsyncTsfn::New(
      info.Env(), info[0].As<Napi::Function>(), "LibAflAsyncAddon", 0, 1,
      context,
      [](Napi::Env env, AsyncFinalizerDataType *, AsyncFuzzTargetContext *ctx) {
        ctx->native_thread.join();
        if (ctx->run_status == kRuntimeFatal && !ctx->is_resolved) {
          ctx->deferred.Reject(
              Napi::Error::New(env, "The LibAFL backend failed internally")
                  .Value());
        } else if (ctx->run_status == kRuntimeFoundTimeout &&
                   !ctx->is_resolved) {
          ctx->deferred.Reject(
              Napi::Error::New(
                  env, "Exceeded timeout while executing one fuzz input")
                  .Value());
        } else if (ctx->run_status == kRuntimeFoundFinding &&
                   !ctx->is_resolved) {
          ctx->deferred.Reject(
              Napi::Error::New(env, "The LibAFL backend found a crashing input")
                  .Value());
        } else if (!ctx->is_resolved) {
          ctx->deferred.Resolve(env.Undefined());
        }
        delete ctx;
      });

  context->native_thread = std::thread(
      [maps](AsyncFuzzTargetContext *ctx) {
        gActiveAsyncContext = ctx;
        signal(SIGSEGV, AsyncErrorSignalHandler);
        signal(SIGINT, AsyncSigintHandler);

        if (ctx->options.mode == LibAflOptions::Mode::kRegression) {
          ctx->run_status = ReplayRegressionInputs(
              ctx->options, [ctx](const uint8_t *data, size_t size) {
                return ExecuteAsyncInput(ctx, data, size);
              });
        } else {
          ctx->run_status =
              RunLibAflRuntime(ctx->options, maps, ExecuteAsyncInput, ctx);
        }
        signal(SIGINT, SIG_DFL);
        signal(SIGSEGV, SIG_DFL);
        gActiveAsyncContext = nullptr;
        gAsyncTsfn.Release();
      },
      context);

  return context->deferred.Promise();
}
