mod compare_log;

use core::ffi::{c_char, c_void};
use core::ptr;
use std::cell::Cell;
use std::ffi::CStr;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use libafl::{
    corpus::{CachedOnDiskCorpus, Corpus, InMemoryCorpus},
    events::SimpleEventManager,
    executors::{inprocess::InProcessExecutor, ExitKind, ShadowExecutor},
    feedback_or_fast,
    feedbacks::{CrashFeedback, MaxMapFeedback, TimeoutFeedback},
    fuzzer::{Evaluator, Fuzzer, StdFuzzer},
    inputs::{BytesInput, HasTargetBytes},
    monitors::{stats::ClientStatsManager, Monitor},
    mutators::{
        havoc_mutations::havoc_mutations, scheduled::HavocScheduledMutator, tokens_mutations,
        I2SRandReplace, Tokens,
    },
    observers::{CanTrack, HitcountsMapObserver, StdMapObserver},
    schedulers::{
        powersched::PowerSchedule, IndexesLenTimeMinimizerScheduler, PowerQueueScheduler,
    },
    stages::{calibrate::CalibrationStage, shadow::ShadowTracingStage, StdPowerMutationalStage},
    state::{HasCorpus, HasExecutions, HasMaxSize, HasSolutions, StdState},
    Error, HasMetadata,
};
use libafl_bolts::{
    rands::StdRand,
    tuples::{tuple_list, Merge},
    AsSlice, ClientId,
};

use crate::compare_log::{JazzerCompareLogObserver, JazzerLibAflCompareLog};

const EXECUTION_CONTINUE: i32 = 0;
const EXECUTION_FINDING: i32 = 1;
const EXECUTION_STOP: i32 = 2;
const EXECUTION_FATAL: i32 = 3;
const EXECUTION_TIMEOUT: i32 = 4;

const RUNTIME_OK: i32 = 0;
const RUNTIME_FOUND_FINDING: i32 = 1;
const RUNTIME_STOPPED: i32 = 2;
const RUNTIME_FATAL: i32 = 3;
const RUNTIME_FOUND_TIMEOUT: i32 = 4;

#[repr(C)]
pub struct JazzerLibAflRuntimeOptions {
    pub runs: u64,
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
    pub edges_len: usize,
    pub cmp: *mut u8,
    pub cmp_len: usize,
    pub compare_log: *mut JazzerLibAflCompareLog,
}

pub type JazzerLibAflExecuteCallback =
    unsafe extern "C" fn(user_data: *mut c_void, data: *const u8, size: usize) -> i32;

struct LibAflMonitor;

impl Monitor for LibAflMonitor {
    fn display(
        &mut self,
        client_stats_manager: &mut ClientStatsManager,
        event_msg: &str,
        sender_id: ClientId,
    ) -> Result<(), Error> {
        let Some(event_name) = (match event_msg {
            "Client Heartbeat" => Some("heartbeat"),
            "Testcase" => Some("testcase"),
            "Objective" => Some("objective"),
            "Log" => Some("log"),
            _ => None,
        }) else {
            return Ok(());
        };

        let (run_time_pretty, corpus_size, objective_size, total_execs, execs_per_sec_pretty) = {
            let global_stats = client_stats_manager.global_stats();
            (
                global_stats.run_time_pretty.clone(),
                global_stats.corpus_size,
                global_stats.objective_size,
                global_stats.total_execs,
                global_stats.execs_per_sec_pretty.clone(),
            )
        };
        let mut user_stats = client_stats_manager
            .client_stats_for(sender_id)?
            .user_stats()
            .iter()
            .map(|(key, value)| format!("{key}: {value}"))
            .collect::<Vec<_>>();
        user_stats.sort();
        let extra = if user_stats.is_empty() {
            String::new()
        } else {
            format!(", {}", user_stats.join(", "))
        };

        eprintln!(
            "[libafl::{event_name}] run time: {}, corpus: {}, objectives: {}, executions: {}, exec/sec: {}{extra}",
            run_time_pretty,
            corpus_size,
            objective_size,
            total_execs,
            execs_per_sec_pretty,
        );
        Ok(())
    }
}

fn format_duration(duration: Duration) -> String {
    let total_seconds = duration.as_secs();
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;

    if hours > 0 {
        format!("{hours}h {minutes}m {seconds}s")
    } else if minutes > 0 {
        format!("{minutes}m {seconds}s")
    } else {
        format!("{seconds}s")
    }
}

fn print_runtime_start(options: &JazzerLibAflRuntimeOptions, loaded_inputs: usize) {
    let runs = if options.runs == 0 {
        "unlimited".to_string()
    } else {
        options.runs.to_string()
    };
    let max_total_time = if options.max_total_time_seconds == 0 {
        "unlimited".to_string()
    } else {
        format_duration(Duration::from_secs(options.max_total_time_seconds))
    };

    eprintln!(
        "[libafl::start] mode: fuzzing, seed: {}, loaded_inputs: {}, timeout: {} ms, max_len: {}, runs: {}, max_total_time: {}",
        options.seed, loaded_inputs, options.timeout_millis, options.max_len, runs, max_total_time,
    );
}

fn print_runtime_done(
    started_at: Instant,
    executions: u64,
    corpus_size: usize,
    objective_size: usize,
) {
    let elapsed = started_at.elapsed();
    let elapsed_seconds = elapsed.as_secs_f64();
    let execs_per_sec = if elapsed_seconds > 0.0 {
        executions as f64 / elapsed_seconds
    } else {
        executions as f64
    };

    eprintln!(
        "[libafl::done] mode: fuzzing, run time: {}, corpus: {}, objectives: {}, executions: {}, exec/sec: {:.0}",
        format_duration(elapsed),
        corpus_size,
        objective_size,
        executions,
        execs_per_sec,
    );
}

fn clear_shared_map(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }

    unsafe {
        ptr::write_bytes(ptr, 0, len);
    }
}

fn clear_compare_log(ptr: *mut JazzerLibAflCompareLog) {
    if ptr.is_null() {
        return;
    }

    unsafe {
        ptr::write_bytes(ptr, 0, 1);
    }
}

fn ensure_non_empty_edge_map(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }

    unsafe {
        let map = std::slice::from_raw_parts_mut(ptr, len);
        if map.iter().all(|slot| *slot == 0) {
            // Power scheduling rejects corpus entries that never hit any edge.
            // Preserve the old behavior for uninstrumented callbacks by marking
            // one synthetic edge only when the target left the map untouched.
            map[0] = 1;
        }
    }
}

unsafe fn parse_corpus_directories(options: &JazzerLibAflRuntimeOptions) -> Option<Vec<PathBuf>> {
    if options.corpus_directories.is_null() || options.corpus_directories_len == 0 {
        return Some(Vec::new());
    }

    let mut result = Vec::with_capacity(options.corpus_directories_len);
    let directories =
        std::slice::from_raw_parts(options.corpus_directories, options.corpus_directories_len);
    for directory in directories {
        if directory.is_null() {
            return None;
        }
        let path = CStr::from_ptr(*directory).to_string_lossy().to_string();
        result.push(PathBuf::from(path));
    }
    Some(result)
}

unsafe fn parse_dictionary_files(options: &JazzerLibAflRuntimeOptions) -> Option<Vec<PathBuf>> {
    if options.dictionary_files.is_null() || options.dictionary_files_len == 0 {
        return Some(Vec::new());
    }

    let mut result = Vec::with_capacity(options.dictionary_files_len);
    let files = std::slice::from_raw_parts(options.dictionary_files, options.dictionary_files_len);
    for file in files {
        if file.is_null() {
            return None;
        }
        let path = CStr::from_ptr(*file).to_string_lossy().to_string();
        result.push(PathBuf::from(path));
    }
    Some(result)
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

fn load_dictionary_tokens(files: &[PathBuf]) -> Result<Tokens, Error> {
    if files.is_empty() {
        return Ok(Tokens::new());
    }

    Tokens::new().add_from_files(files.iter())
}

#[no_mangle]
pub unsafe extern "C" fn jazzer_libafl_runtime_run(
    options: *const JazzerLibAflRuntimeOptions,
    maps: *const JazzerLibAflRuntimeSharedMaps,
    execute_one: JazzerLibAflExecuteCallback,
    user_data: *mut c_void,
) -> i32 {
    if options.is_null() || maps.is_null() {
        eprintln!("[libafl] fatal: null options or maps pointer");
        return RUNTIME_FATAL;
    }

    let options = &*options;
    let maps = &*maps;
    if maps.edges.is_null()
        || maps.edges_len == 0
        || maps.cmp.is_null()
        || maps.cmp_len == 0
        || maps.compare_log.is_null()
    {
        eprintln!("[libafl] fatal: shared maps are missing");
        return RUNTIME_FATAL;
    }

    let corpus_dirs = match parse_corpus_directories(options) {
        Some(dirs) => dirs,
        None => {
            eprintln!("[libafl] fatal: invalid corpus directories");
            return RUNTIME_FATAL;
        }
    };
    let dictionary_files = match parse_dictionary_files(options) {
        Some(files) => files,
        None => {
            eprintln!("[libafl] fatal: invalid dictionary files");
            return RUNTIME_FATAL;
        }
    };

    let main_corpus_dir = match resolve_main_corpus_directory(&corpus_dirs, options.seed) {
        Ok(directory) => directory,
        Err(error) => {
            eprintln!("[libafl] fatal: failed to prepare corpus directory: {error:?}");
            return RUNTIME_FATAL;
        }
    };

    let monitor = LibAflMonitor;
    let mut mgr = SimpleEventManager::new(monitor);

    let edges_observer = HitcountsMapObserver::new(StdMapObserver::from_mut_ptr(
        "edges",
        maps.edges,
        maps.edges_len,
    ))
    .track_indices();
    let cmp_observer =
        HitcountsMapObserver::new(StdMapObserver::from_mut_ptr("cmp", maps.cmp, maps.cmp_len));

    let mut feedback = MaxMapFeedback::new(&edges_observer);
    let mut objective = feedback_or_fast!(CrashFeedback::new(), TimeoutFeedback::new());
    let mut state = match StdState::new(
        StdRand::with_seed(options.seed),
        match CachedOnDiskCorpus::no_meta(&main_corpus_dir, 256) {
            Ok(corpus) => corpus,
            Err(error) => {
                eprintln!("[libafl] fatal: failed to create on-disk corpus: {error:?}");
                return RUNTIME_FATAL;
            }
        },
        InMemoryCorpus::new(),
        &mut feedback,
        &mut objective,
    ) {
        Ok(state) => state,
        Err(error) => {
            eprintln!("[libafl] fatal: failed to create fuzzing state: {error:?}");
            return RUNTIME_FATAL;
        }
    };
    state.set_max_size(options.max_len);

    match load_dictionary_tokens(&dictionary_files) {
        Ok(tokens) => {
            if !tokens.is_empty() {
                state.add_metadata(tokens);
            }
        }
        Err(error) => {
            eprintln!("[libafl] fatal: failed to load dictionary tokens: {error:?}");
            return RUNTIME_FATAL;
        }
    }

    let calibration_stage = CalibrationStage::ignore_stability(&feedback);
    let scheduler = IndexesLenTimeMinimizerScheduler::new(
        &edges_observer,
        PowerQueueScheduler::new(&mut state, &edges_observer, PowerSchedule::fast()),
    );
    let mut fuzzer = StdFuzzer::new(scheduler, feedback, objective);
    let mutator = HavocScheduledMutator::new(
        havoc_mutations()
            .merge(tokens_mutations())
            .merge(tuple_list!(I2SRandReplace::new())),
    );
    let mut stages = tuple_list!(
        calibration_stage,
        ShadowTracingStage::new(),
        StdPowerMutationalStage::new(mutator),
    );
    let stop_requested = Cell::new(false);
    let fatal_error = Cell::new(false);
    let timeout_found = Cell::new(false);

    let mut harness = |input: &BytesInput| {
        clear_shared_map(maps.edges, maps.edges_len);
        clear_shared_map(maps.cmp, maps.cmp_len);
        clear_compare_log(maps.compare_log);

        let bytes = input.target_bytes();
        let bytes = bytes.as_slice();
        let size = bytes.len().min(options.max_len);
        let status = unsafe { execute_one(user_data, bytes.as_ptr(), size) };
        ensure_non_empty_edge_map(maps.edges, maps.edges_len);
        match status {
            EXECUTION_CONTINUE => ExitKind::Ok,
            EXECUTION_FINDING => ExitKind::Crash,
            EXECUTION_STOP => {
                stop_requested.set(true);
                ExitKind::Ok
            }
            EXECUTION_FATAL => {
                fatal_error.set(true);
                ExitKind::Ok
            }
            EXECUTION_TIMEOUT => {
                timeout_found.set(true);
                ExitKind::Timeout
            }
            _ => {
                fatal_error.set(true);
                ExitKind::Ok
            }
        }
    };

    let executor = match InProcessExecutor::new(
        &mut harness,
        tuple_list!(edges_observer, cmp_observer),
        &mut fuzzer,
        &mut state,
        &mut mgr,
    ) {
        Ok(executor) => executor,
        Err(error) => {
            eprintln!("[libafl] fatal: failed to create executor: {error:?}");
            return RUNTIME_FATAL;
        }
    };
    let shadow_observer = JazzerCompareLogObserver::new(maps.compare_log);
    let mut executor = ShadowExecutor::new(executor, tuple_list!(shadow_observer));

    if !corpus_dirs.is_empty() && state.must_load_initial_inputs() {
        if state
            .load_initial_inputs(&mut fuzzer, &mut executor, &mut mgr, &corpus_dirs)
            .is_err()
        {
            eprintln!("[libafl] fatal: failed to load initial corpus inputs");
            return RUNTIME_FATAL;
        }
    }

    if state.corpus().count() == 0
        && fuzzer
            .add_input(&mut state, &mut executor, &mut mgr, BytesInput::new(vec![]))
            .is_err()
    {
        eprintln!("[libafl] fatal: failed to seed empty testcase");
        return RUNTIME_FATAL;
    }

    print_runtime_start(options, state.corpus().count());

    let started_at = Instant::now();
    let max_total_time = if options.max_total_time_seconds == 0 {
        None
    } else {
        Some(Duration::from_secs(options.max_total_time_seconds))
    };

    let initial_executions = *state.executions();
    let mut status = RUNTIME_OK;
    loop {
        if options.runs != 0
            && state.executions().saturating_sub(initial_executions) >= options.runs
        {
            break;
        }
        if let Some(max_total_time) = max_total_time {
            if started_at.elapsed() >= max_total_time {
                status = RUNTIME_STOPPED;
                break;
            }
        }

        if let Err(error) = fuzzer.fuzz_one(&mut stages, &mut executor, &mut state, &mut mgr) {
            eprintln!("[libafl] fatal: fuzz_one returned an error: {error:?}");
            return RUNTIME_FATAL;
        }
        if fatal_error.get() {
            return RUNTIME_FATAL;
        }

        if timeout_found.get() {
            return RUNTIME_FOUND_TIMEOUT;
        }

        if state.solutions().count() > 0 {
            return RUNTIME_FOUND_FINDING;
        }

        if stop_requested.get() {
            status = RUNTIME_STOPPED;
            break;
        }
    }

    print_runtime_done(
        started_at,
        state.executions().saturating_sub(initial_executions),
        state.corpus().count(),
        state.solutions().count(),
    );

    status
}
