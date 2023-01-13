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

#include "utils.h"
#include "napi.h"

void StartLibFuzzer(const std::vector<std::string> &args,
                    fuzzer::UserCallback fuzzCallback) {
  std::vector<char *> fuzzer_arg_pointers;
  for (auto &arg : args)
    fuzzer_arg_pointers.push_back((char *)arg.data());

  int argc = fuzzer_arg_pointers.size();
  char **argv = fuzzer_arg_pointers.data();

  fuzzer::FuzzerDriver(&argc, &argv, fuzzCallback);
}

std::vector<std::string> LibFuzzerArgs(Napi::Env env,
                                       const Napi::Array &jsArgs) {
  std::vector<std::string> fuzzer_args;
  for (auto [_, fuzzer_arg] : jsArgs) {
    Napi::Value val = fuzzer_arg;
    if (!val.IsString()) {
      throw Napi::Error::New(env, "libfuzzer arguments have to be strings");
    }

    fuzzer_args.push_back(val.As<Napi::String>().Utf8Value());
  }
  return fuzzer_args;
}
