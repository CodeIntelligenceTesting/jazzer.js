use core::ffi::{c_char, c_void};

pub(crate) const EXECUTION_CONTINUE: i32 = 0;
pub(crate) const EXECUTION_FINDING: i32 = 1;
pub(crate) const EXECUTION_STOP: i32 = 2;
pub(crate) const EXECUTION_FATAL: i32 = 3;
pub(crate) const EXECUTION_TIMEOUT: i32 = 4;

pub(crate) const RUNTIME_OK: i32 = 0;
pub(crate) const RUNTIME_FOUND_FINDING: i32 = 1;
pub(crate) const RUNTIME_STOPPED: i32 = 2;
pub(crate) const RUNTIME_FATAL: i32 = 3;
pub(crate) const RUNTIME_FOUND_TIMEOUT: i32 = 4;

pub(crate) const FINDING_INFO_ARTIFACT_BYTES: usize = 256;
pub(crate) const FINDING_INFO_SUMMARY_BYTES: usize = 1024;

pub(crate) const COMPARE_LOG_ENTRY_BYTES: usize = 32;
pub(crate) const COMPARE_LOG_MAX_ENTRIES: usize = 1024;
pub(crate) const COMPARE_LOG_SIGNED_FLAG: u8 = 1 << 0;

pub(crate) const COMPARE_KIND_INTEGER: u8 = 1;
pub(crate) const COMPARE_KIND_STRING_EQUALITY: u8 = 2;
pub(crate) const COMPARE_KIND_STRING_CONTAINMENT: u8 = 3;

#[repr(C)]
pub struct JazzerLibAflFindingInfo {
    pub has_value: u8,
    pub artifact: [u8; FINDING_INFO_ARTIFACT_BYTES],
    pub summary: [u8; FINDING_INFO_SUMMARY_BYTES],
}

#[repr(C)]
pub struct JazzerLibAflRuntimeOptions {
    pub runs: u64,
    pub runs_set: u8,
    pub seed: u64,
    pub max_len: usize,
    pub timeout_millis: u64,
    pub max_total_time_seconds: u64,
    pub corpus_directories: *const *const c_char,
    pub corpus_directories_len: usize,
    pub dictionary_files: *const *const c_char,
    pub dictionary_files_len: usize,
}

#[repr(C)]
pub struct JazzerLibAflRuntimeSharedMaps {
    pub edges: *mut u8,
    pub edges_capacity: usize,
    pub edges_size: *mut usize,
    pub cmp: *mut u8,
    pub cmp_len: usize,
    pub compare_log: *mut JazzerLibAflCompareLog,
    pub finding_info: *mut JazzerLibAflFindingInfo,
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct JazzerLibAflCompareLogEntry {
    pub kind: u8,
    pub flags: u8,
    pub left_len: u8,
    pub right_len: u8,
    pub left_value: u64,
    pub right_value: u64,
    pub left_bytes: [u8; COMPARE_LOG_ENTRY_BYTES],
    pub right_bytes: [u8; COMPARE_LOG_ENTRY_BYTES],
}

#[repr(C)]
#[derive(Debug)]
pub struct JazzerLibAflCompareLog {
    pub used: u32,
    pub dropped: u32,
    pub entries: [JazzerLibAflCompareLogEntry; COMPARE_LOG_MAX_ENTRIES],
}

pub type JazzerLibAflExecuteCallback =
    unsafe extern "C" fn(user_data: *mut c_void, data: *const u8, size: usize) -> i32;

#[cfg(test)]
mod tests {
    use super::*;
    use std::mem::{align_of, size_of};

    #[test]
    fn libafl_status_codes_match_cpp_header() {
        assert_eq!(EXECUTION_CONTINUE, 0);
        assert_eq!(EXECUTION_FINDING, 1);
        assert_eq!(EXECUTION_STOP, 2);
        assert_eq!(EXECUTION_FATAL, 3);
        assert_eq!(EXECUTION_TIMEOUT, 4);

        assert_eq!(RUNTIME_OK, 0);
        assert_eq!(RUNTIME_FOUND_FINDING, 1);
        assert_eq!(RUNTIME_STOPPED, 2);
        assert_eq!(RUNTIME_FATAL, 3);
        assert_eq!(RUNTIME_FOUND_TIMEOUT, 4);
    }

    #[test]
    fn libafl_c_abi_layout_matches_cpp_header() {
        assert_eq!(size_of::<usize>(), 8);
        assert_eq!(COMPARE_LOG_ENTRY_BYTES, 32);
        assert_eq!(COMPARE_LOG_MAX_ENTRIES, 1024);
        assert_eq!(FINDING_INFO_ARTIFACT_BYTES, 256);
        assert_eq!(FINDING_INFO_SUMMARY_BYTES, 1024);

        assert_eq!(size_of::<JazzerLibAflCompareLogEntry>(), 88);
        assert_eq!(align_of::<JazzerLibAflCompareLogEntry>(), 8);
        assert_eq!(
            std::mem::offset_of!(JazzerLibAflCompareLogEntry, left_value),
            8
        );
        assert_eq!(
            std::mem::offset_of!(JazzerLibAflCompareLogEntry, right_value),
            16
        );
        assert_eq!(
            std::mem::offset_of!(JazzerLibAflCompareLogEntry, left_bytes),
            24
        );
        assert_eq!(
            std::mem::offset_of!(JazzerLibAflCompareLogEntry, right_bytes),
            56
        );

        assert_eq!(size_of::<JazzerLibAflCompareLog>(), 90120);
        assert_eq!(align_of::<JazzerLibAflCompareLog>(), 8);
        assert_eq!(std::mem::offset_of!(JazzerLibAflCompareLog, entries), 8);

        assert_eq!(size_of::<JazzerLibAflFindingInfo>(), 1281);
        assert_eq!(align_of::<JazzerLibAflFindingInfo>(), 1);
        assert_eq!(std::mem::offset_of!(JazzerLibAflFindingInfo, artifact), 1);
        assert_eq!(std::mem::offset_of!(JazzerLibAflFindingInfo, summary), 257);

        assert_eq!(size_of::<JazzerLibAflRuntimeOptions>(), 80);
        assert_eq!(align_of::<JazzerLibAflRuntimeOptions>(), 8);
        assert_eq!(std::mem::offset_of!(JazzerLibAflRuntimeOptions, seed), 16);
        assert_eq!(
            std::mem::offset_of!(JazzerLibAflRuntimeOptions, corpus_directories),
            48
        );
        assert_eq!(
            std::mem::offset_of!(JazzerLibAflRuntimeOptions, dictionary_files),
            64
        );

        assert_eq!(size_of::<JazzerLibAflRuntimeSharedMaps>(), 56);
        assert_eq!(align_of::<JazzerLibAflRuntimeSharedMaps>(), 8);
        assert_eq!(std::mem::offset_of!(JazzerLibAflRuntimeSharedMaps, cmp), 24);
        assert_eq!(
            std::mem::offset_of!(JazzerLibAflRuntimeSharedMaps, compare_log),
            40
        );
        assert_eq!(
            std::mem::offset_of!(JazzerLibAflRuntimeSharedMaps, finding_info),
            48
        );
    }
}
