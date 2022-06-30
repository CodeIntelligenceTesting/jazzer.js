#include <iostream>
#include <napi.h>

void PrintVersion(const Napi::CallbackInfo &info) {
  auto napi_version = Napi::VersionManagement::GetNapiVersion(info.Env());
  auto node_version = Napi::VersionManagement::GetNodeVersion(info.Env());
  std::cout << "fuzzyEagle running on Node " << node_version->major
            << " using Node-API version " << napi_version << std::endl;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("printVersion", Napi::Function::New<PrintVersion>(env));
  return exports;
}

NODE_API_MODULE(fuzzy_eagle, Init)
