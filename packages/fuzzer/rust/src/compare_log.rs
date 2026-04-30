use std::borrow::Cow;

use libafl::{
    executors::ExitKind,
    mutators::Tokens,
    observers::{
        cmp::{CmpValues, CmpValuesMetadata, CmplogBytes},
        Observer,
    },
    Error, HasMetadata,
};
use libafl_bolts::Named;

pub const COMPARE_LOG_ENTRY_BYTES: usize = 32;
pub const COMPARE_LOG_MAX_ENTRIES: usize = 1024;

const MAX_PROMOTED_TOKENS_PER_EXEC: usize = 64;
const MAX_PROMOTED_TOKENS_TOTAL: usize = 1024;
const COMPARE_LOG_SIGNED_FLAG: u8 = 1 << 0;

const COMPARE_KIND_INTEGER: u8 = 1;
const COMPARE_KIND_STRING_EQUALITY: u8 = 2;
const COMPARE_KIND_STRING_CONTAINMENT: u8 = 3;

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

#[derive(Clone, Debug)]
pub struct JazzerCompareLogObserver {
    name: Cow<'static, str>,
    compare_log: *mut JazzerLibAflCompareLog,
}

impl JazzerCompareLogObserver {
    pub fn new(compare_log: *mut JazzerLibAflCompareLog) -> Self {
        Self {
            name: Cow::Borrowed("jazzer-compare-log"),
            compare_log,
        }
    }

    fn compare_log(&self) -> Option<&JazzerLibAflCompareLog> {
        unsafe { self.compare_log.as_ref() }
    }
}

impl Named for JazzerCompareLogObserver {
    fn name(&self) -> &Cow<'static, str> {
        &self.name
    }
}

impl<I, S> Observer<I, S> for JazzerCompareLogObserver
where
    S: HasMetadata,
{
    fn pre_exec(&mut self, state: &mut S, _input: &I) -> Result<(), Error> {
        if let Some(metadata) = state.metadata_map_mut().get_mut::<CmpValuesMetadata>() {
            metadata.list.clear();
        }
        Ok(())
    }

    fn post_exec(&mut self, state: &mut S, _input: &I, _exit_kind: &ExitKind) -> Result<(), Error> {
        let Some(compare_log) = self.compare_log() else {
            return Ok(());
        };

        let entry_count = usize::min(compare_log.used as usize, COMPARE_LOG_MAX_ENTRIES);
        let mut cmp_values = Vec::with_capacity(entry_count);
        let mut promoted_tokens = Vec::new();
        for entry in compare_log.entries.iter().take(entry_count) {
            if let Some(value) = cmp_value_for_entry(entry) {
                cmp_values.push(value);
            }
            if promoted_tokens.len() < MAX_PROMOTED_TOKENS_PER_EXEC {
                if let Some(token) = promoted_token_for_entry(entry) {
                    promoted_tokens.push(token);
                }
            }
        }

        let metadata = state.metadata_or_insert_with(CmpValuesMetadata::new);
        metadata.list.clear();
        metadata.list.extend(cmp_values);

        if !promoted_tokens.is_empty() {
            let tokens = state.metadata_or_insert_with(Tokens::new);
            for token in promoted_tokens {
                if tokens.len() >= MAX_PROMOTED_TOKENS_TOTAL {
                    break;
                }
                tokens.add_token(&token);
            }
        }

        Ok(())
    }
}

fn cmp_value_for_entry(entry: &JazzerLibAflCompareLogEntry) -> Option<CmpValues> {
    match entry.kind {
        COMPARE_KIND_INTEGER => Some(cmp_value_for_integer(entry)),
        COMPARE_KIND_STRING_EQUALITY => cmp_value_for_string_equality(entry),
        _ => None,
    }
}

fn promoted_token_for_entry(entry: &JazzerLibAflCompareLogEntry) -> Option<Vec<u8>> {
    match entry.kind {
        COMPARE_KIND_STRING_EQUALITY => token_from_entry(&entry.right_bytes, entry.right_len),
        COMPARE_KIND_STRING_CONTAINMENT => token_from_entry(&entry.left_bytes, entry.left_len),
        _ => None,
    }
}

fn token_from_entry(bytes: &[u8; COMPARE_LOG_ENTRY_BYTES], len: u8) -> Option<Vec<u8>> {
    let len = usize::min(len as usize, COMPARE_LOG_ENTRY_BYTES);
    if len == 0 {
        return None;
    }
    Some(bytes[..len].to_vec())
}

fn cmp_value_for_string_equality(entry: &JazzerLibAflCompareLogEntry) -> Option<CmpValues> {
    let left_len = usize::min(entry.left_len as usize, COMPARE_LOG_ENTRY_BYTES);
    let right_len = usize::min(entry.right_len as usize, COMPARE_LOG_ENTRY_BYTES);
    if left_len == 0 || right_len == 0 {
        return None;
    }

    let mut left = [0; COMPARE_LOG_ENTRY_BYTES];
    left[..left_len].copy_from_slice(&entry.left_bytes[..left_len]);
    let mut right = [0; COMPARE_LOG_ENTRY_BYTES];
    right[..right_len].copy_from_slice(&entry.right_bytes[..right_len]);
    Some(CmpValues::Bytes((
        CmplogBytes::from_buf_and_len(left, left_len as u8),
        CmplogBytes::from_buf_and_len(right, right_len as u8),
    )))
}

fn cmp_value_for_integer(entry: &JazzerLibAflCompareLogEntry) -> CmpValues {
    if entry.flags & COMPARE_LOG_SIGNED_FLAG != 0 {
        cmp_value_for_signed_integer(entry.left_value as i64, entry.right_value as i64)
    } else {
        cmp_value_for_unsigned_integer(entry.left_value, entry.right_value)
    }
}

fn cmp_value_for_unsigned_integer(left: u64, right: u64) -> CmpValues {
    if let (Ok(left), Ok(right)) = (u8::try_from(left), u8::try_from(right)) {
        CmpValues::U8((left, right, false))
    } else if let (Ok(left), Ok(right)) = (u16::try_from(left), u16::try_from(right)) {
        CmpValues::U16((left, right, false))
    } else if let (Ok(left), Ok(right)) = (u32::try_from(left), u32::try_from(right)) {
        CmpValues::U32((left, right, false))
    } else {
        CmpValues::U64((left, right, false))
    }
}

fn cmp_value_for_signed_integer(left: i64, right: i64) -> CmpValues {
    if let (Ok(left), Ok(right)) = (i8::try_from(left), i8::try_from(right)) {
        CmpValues::U8((left as u8, right as u8, false))
    } else if let (Ok(left), Ok(right)) = (i16::try_from(left), i16::try_from(right)) {
        CmpValues::U16((left as u16, right as u16, false))
    } else if let (Ok(left), Ok(right)) = (i32::try_from(left), i32::try_from(right)) {
        CmpValues::U32((left as u32, right as u32, false))
    } else {
        CmpValues::U64((left as u64, right as u64, false))
    }
}
