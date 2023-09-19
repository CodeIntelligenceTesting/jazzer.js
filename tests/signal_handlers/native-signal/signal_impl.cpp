#include <iostream>
#include <signal.h>

#include <napi.h>

void sigsegv(const Napi::CallbackInfo &info)
{
    if (info.Length() != 1 || !info[0].IsNumber())
    {
        throw Napi::Error::New(info.Env(), "Need a single integer argument");
    }
    // accepts a parameter to prevent the compiler from optimizing a static segfault away
    int location = info[0].ToNumber();
    int *a = (int *)location;
    *a = 10;
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports["sigsegv"] = Napi::Function::New<sigsegv>(env);

    return exports;
}

NODE_API_MODULE(signal_impl, Init);
