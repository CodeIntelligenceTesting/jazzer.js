#include "callbacks.h"

#include <napi.h>

// We expect these symbols to exist in the current plugin, provided either by
// libfuzzer or by the native agent.
extern "C" {
void __sanitizer_weak_hook_strcmp(void *called_pc, const char *s1,
                                  const char *s2, int result);
}

// Record a comparison between two strings in the target that returned unequal.
void TraceUnequalStrings(const Napi::CallbackInfo &info) {
  if (info.Length() != 3) {
    throw Napi::Error::New(info.Env(),
                           "Need three arguments: the trace ID and the two "
                           "compared strings");
  }

  auto id = info[0].As<Napi::Number>().Int64Value();
  auto s1 = info[1].As<Napi::String>().Utf8Value();
  auto s2 = info[2].As<Napi::String>().Utf8Value();

  // strcmp returns zero on equality, and libfuzzer doesn't care about the
  // result beyond whether or not it's zero.
  __sanitizer_weak_hook_strcmp((void *)id, s1.c_str(), s2.c_str(), 1);
}

void RegisterCallbackExports(Napi::Env env, Napi::Object exports) {
  exports["traceUnequalStrings"] =
      Napi::Function::New<TraceUnequalStrings>(env);
  return;
}
