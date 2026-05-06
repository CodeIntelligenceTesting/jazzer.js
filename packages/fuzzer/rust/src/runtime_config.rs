use std::ffi::CStr;
use std::fs;
use std::path::PathBuf;

use libafl::{mutators::Tokens, Error};

use crate::abi::JazzerLibAflRuntimeOptions;

pub(crate) struct RuntimeConfig {
    pub(crate) runs: Option<u64>,
    pub(crate) seed: u64,
    pub(crate) max_len: usize,
    pub(crate) timeout_millis: u64,
    pub(crate) max_total_time_seconds: u64,
    pub(crate) corpus_dirs: Vec<PathBuf>,
    pub(crate) dictionary_files: Vec<PathBuf>,
    pub(crate) main_corpus_dir: PathBuf,
}

impl RuntimeConfig {
    pub(crate) unsafe fn from_abi(options: &JazzerLibAflRuntimeOptions) -> Result<Self, String> {
        let corpus_dirs = parse_path_array(
            options.corpus_directories,
            options.corpus_directories_len,
            "corpus directories",
        )?;
        let dictionary_files = parse_path_array(
            options.dictionary_files,
            options.dictionary_files_len,
            "dictionary files",
        )?;
        let main_corpus_dir = resolve_main_corpus_directory(&corpus_dirs, options.seed)
            .map_err(|error| format!("failed to prepare corpus directory: {error:?}"))?;

        Ok(Self {
            runs: if options.runs_set != 0 {
                Some(options.runs)
            } else {
                None
            },
            seed: options.seed,
            max_len: options.max_len,
            timeout_millis: options.timeout_millis,
            max_total_time_seconds: options.max_total_time_seconds,
            corpus_dirs,
            dictionary_files,
            main_corpus_dir,
        })
    }

    pub(crate) fn load_dictionary_tokens(&self) -> Result<Tokens, Error> {
        if self.dictionary_files.is_empty() {
            return Ok(Tokens::new());
        }

        Tokens::new().add_from_files(self.dictionary_files.iter())
    }
}

unsafe fn parse_path_array(
    paths: *const *const core::ffi::c_char,
    len: usize,
    label: &str,
) -> Result<Vec<PathBuf>, String> {
    if len == 0 {
        return Ok(Vec::new());
    }
    if paths.is_null() {
        return Err(format!("invalid {label}"));
    }

    let mut result = Vec::with_capacity(len);
    let paths = std::slice::from_raw_parts(paths, len);
    for path in paths {
        if path.is_null() {
            return Err(format!("invalid {label}"));
        }
        let path = CStr::from_ptr(*path).to_string_lossy().to_string();
        result.push(PathBuf::from(path));
    }
    Ok(result)
}

fn resolve_main_corpus_directory(
    corpus_dirs: &[PathBuf],
    seed: u64,
) -> Result<PathBuf, std::io::Error> {
    let directory = if let Some(first) = corpus_dirs.first() {
        first.clone()
    } else {
        std::env::temp_dir().join(format!(
            "jazzerjs-libafl-runtime-{}-{}",
            std::process::id(),
            seed,
        ))
    };
    fs::create_dir_all(&directory)?;
    Ok(directory)
}
