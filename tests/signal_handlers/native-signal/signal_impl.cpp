// Copyright 2023 Code Intelligence GmbH
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

#include <iostream>
#include <signal.h>

#include <napi.h>

void sigsegv(const Napi::CallbackInfo &info) {
  if (info.Length() != 1 || !info[0].IsNumber()) {
    throw Napi::Error::New(info.Env(), "Need a single integer argument");
  }
  // accepts a parameter to prevent the compiler from optimizing a static
  // segfault away
  int location = info[0].ToNumber();
  int *a = (int *)location;
  *a = 10;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports["sigsegv"] = Napi::Function::New<sigsegv>(env);

  return exports;
}

NODE_API_MODULE(signal_impl, Init);
