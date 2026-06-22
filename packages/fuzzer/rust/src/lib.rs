mod abi;
mod compare_log;
mod monitor;
mod runtime;
mod runtime_config;
mod shared_maps;

use core::ffi::c_void;

use crate::abi::{
    JazzerLibAflExecuteCallback, JazzerLibAflRuntimeOptions, JazzerLibAflRuntimeSharedMaps,
};

/// Runs one LibAFL fuzzing campaign through the C ABI bridge.
///
/// # Safety
///
/// `options` and `maps` must point to valid `#[repr(C)]` values matching
/// `shared/libafl_abi.h` for the whole call. All pointers inside `maps` must
/// reference initialized shared memory regions owned by the native addon, and
/// `execute_one` must remain callable with `user_data` until this function
/// returns.
#[no_mangle]
pub unsafe extern "C" fn jazzer_libafl_runtime_run(
    options: *const JazzerLibAflRuntimeOptions,
    maps: *const JazzerLibAflRuntimeSharedMaps,
    execute_one: JazzerLibAflExecuteCallback,
    user_data: *mut c_void,
) -> i32 {
    runtime::run_from_ffi(options, maps, execute_one, user_data)
}
