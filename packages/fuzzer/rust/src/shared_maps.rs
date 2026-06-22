use core::ptr;
use std::slice;

use crate::abi::{JazzerLibAflCompareLog, JazzerLibAflFindingInfo, JazzerLibAflRuntimeSharedMaps};

#[derive(Clone, Copy)]
pub(crate) struct SharedMaps<'a> {
    raw: &'a JazzerLibAflRuntimeSharedMaps,
}

impl<'a> SharedMaps<'a> {
    pub(crate) fn from_abi(raw: &'a JazzerLibAflRuntimeSharedMaps) -> Result<Self, &'static str> {
        if raw.edges.is_null()
            || raw.edges_capacity == 0
            || raw.edges_size.is_null()
            || raw.cmp.is_null()
            || raw.cmp_len == 0
            || raw.compare_log.is_null()
            || raw.finding_info.is_null()
        {
            return Err("shared maps are missing");
        }

        Ok(Self { raw })
    }

    pub(crate) fn edges(self) -> *mut u8 {
        self.raw.edges
    }

    pub(crate) fn edges_capacity(self) -> usize {
        self.raw.edges_capacity
    }

    pub(crate) fn edges_size(self) -> *mut usize {
        self.raw.edges_size
    }

    pub(crate) fn cmp(self) -> *mut u8 {
        self.raw.cmp
    }

    pub(crate) fn cmp_len(self) -> usize {
        self.raw.cmp_len
    }

    pub(crate) fn compare_log(self) -> *mut JazzerLibAflCompareLog {
        self.raw.compare_log
    }

    pub(crate) fn finding_info(self) -> *mut JazzerLibAflFindingInfo {
        self.raw.finding_info
    }

    pub(crate) fn edge_map_len(self) -> usize {
        unsafe { (*self.raw.edges_size).min(self.raw.edges_capacity) }
    }

    pub(crate) fn clear_for_execution(self) {
        clear_shared_map(self.edges(), self.edge_map_len());
        clear_shared_map(self.cmp(), self.cmp_len());
        clear_compare_log(self.compare_log());
        clear_finding_info(self.finding_info());
    }

    pub(crate) fn ensure_non_empty_edge_map(self) -> bool {
        let len = self.edge_map_len();
        if has_non_zero_coverage(self.edges(), len) {
            return false;
        }

        if len == 0 {
            return false;
        }

        unsafe {
            let map = slice::from_raw_parts_mut(self.edges(), len);
            // Power scheduling rejects corpus entries that never hit any edge.
            // Preserve the old behavior for uninstrumented callbacks by marking
            // one synthetic edge only when the target left every coverage region untouched.
            map[0] = 1;
        }

        true
    }
}

fn clear_shared_map(ptr: *mut u8, len: usize) {
    if len == 0 {
        return;
    }

    unsafe {
        ptr::write_bytes(ptr, 0, len);
    }
}

fn clear_compare_log(ptr: *mut JazzerLibAflCompareLog) {
    unsafe {
        ptr::write_bytes(ptr, 0, 1);
    }
}

fn clear_finding_info(ptr: *mut JazzerLibAflFindingInfo) {
    unsafe {
        ptr::write_bytes(ptr, 0, 1);
    }
}

fn has_non_zero_coverage(ptr: *mut u8, len: usize) -> bool {
    if len == 0 {
        return false;
    }

    unsafe {
        slice::from_raw_parts(ptr, len)
            .iter()
            .any(|slot| *slot != 0)
    }
}
