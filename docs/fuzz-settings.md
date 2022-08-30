# Advanced Fuzzing Settings

This page describes advanced fuzzing settings.

## Timeout

Invocations of fuzz targets, which take longer than the configured timeout, will
cause fuzzing to stop and a timeout finding to be reported. This feature is
directly provided by the underlying fuzzing engine, libFuzzer.

A [default timeout](https://www.llvm.org/docs/LibFuzzer.html#output) of 1200
seconds is preconfigured, but can be changed using the `-timeout` fuzzer flag.

Timeouts work in the sync- and asynchronous fuzzing mode.

Example invocation:

```shell
npx jazzer fuzzTarget -- -timeout=10
```

Example output:

```text
ALARM: working on the last Unit for 10 seconds
       and the timeout value is 10 (use -timeout=N to change)
MS: 2 ShuffleBytes-InsertRepeatedBytes-; base unit: adc83b19e793491b1c6ea0fd8b46cd9f32e592fc
0xe3,0xe3,0xe3,0xe3,0xe3,0xe3,0xe3,0xe3,0xe3,0xe3,0xa,
\343\343\343\343\343\343\343\343\343\343\012
artifact_prefix='./'; Test unit written to ./timeout-d593b924e138abd8ec4c97afe40c408136ecabd4
Base64: 4+Pj4+Pj4+Pj4wo=
==96284== ERROR: libFuzzer: timeout after 10 seconds
SUMMARY: libFuzzer: timeout
```
