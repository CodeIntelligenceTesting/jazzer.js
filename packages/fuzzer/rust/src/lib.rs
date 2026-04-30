mod compare_log;

use core::ffi::{c_char, c_void};
use core::ptr;
use std::cell::{Cell, RefCell};
use std::ffi::CStr;
use std::fs;
use std::io::IsTerminal;
use std::path::PathBuf;
use std::rc::Rc;
use std::slice;
use std::time::{Duration, Instant};

use libafl::{
    corpus::{CachedOnDiskCorpus, Corpus, InMemoryCorpus},
    events::SimpleEventManager,
    executors::{inprocess::InProcessExecutor, ExitKind, ShadowExecutor},
    feedback_or_fast,
    feedbacks::{CrashFeedback, MaxMapFeedback, TimeoutFeedback},
    fuzzer::{Evaluator, Fuzzer, StdFuzzer},
    inputs::{BytesInput, HasTargetBytes},
    monitors::{
        stats::{ClientStatsManager, UserStats, UserStatsValue},
        Monitor,
    },
    mutators::{
        havoc_mutations::havoc_mutations, scheduled::HavocScheduledMutator, tokens_mutations,
        I2SRandReplace, Tokens,
    },
    observers::{
        CanTrack, HitcountsMapObserver, StdMapObserver, VariableMapObserver,
    },
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

const FINDING_INFO_ARTIFACT_BYTES: usize = 256;
const FINDING_INFO_SUMMARY_BYTES: usize = 1024;
const EXECUTION_FIELD_WIDTH: usize = 10;
const DEFAULT_MONITOR_TIMEOUT: Duration = Duration::from_secs(15);

#[repr(C)]
pub struct JazzerLibAflFindingInfo {
    pub has_value: u8,
    pub artifact: [u8; FINDING_INFO_ARTIFACT_BYTES],
    pub summary: [u8; FINDING_INFO_SUMMARY_BYTES],
}

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
    pub edges_capacity: usize,
    pub edges_size: *mut usize,
    pub cmp: *mut u8,
    pub cmp_len: usize,
    pub compare_log: *mut JazzerLibAflCompareLog,
    pub finding_info: *mut JazzerLibAflFindingInfo,
}

pub type JazzerLibAflExecuteCallback =
    unsafe extern "C" fn(user_data: *mut c_void, data: *const u8, size: usize) -> i32;

#[derive(Clone, Copy)]
struct RatioMetric {
    numerator: u64,
    denominator: u64,
}

#[derive(Clone, Copy)]
struct ProgressSnapshot {
    executions: u64,
    edges: Option<RatioMetric>,
    corpus_size: u64,
    execs_per_sec: f64,
    objective_size: u64,
    stability: Option<RatioMetric>,
    elapsed: Duration,
}

struct MonitorState {
    campaign_started: bool,
    colors_enabled: bool,
    last_edges_are_synthetic: bool,
    last_status_output_at: Option<Instant>,
    last_progress: Option<ProgressSnapshot>,
}

#[derive(Clone, Copy)]
enum StatusEvent {
    Testcase,
    Heartbeat,
    Objective,
    Done,
}

#[derive(Clone)]
struct LibAflMonitor {
    state: Rc<RefCell<MonitorState>>,
    finding_info: *mut JazzerLibAflFindingInfo,
}

impl LibAflMonitor {
    fn new(finding_info: *mut JazzerLibAflFindingInfo) -> (Self, Rc<RefCell<MonitorState>>) {
        let state = Rc::new(RefCell::new(MonitorState {
            campaign_started: false,
            colors_enabled: should_colorize_output(),
            last_edges_are_synthetic: false,
            last_status_output_at: None,
            last_progress: None,
        }));

        (
            Self {
                state: state.clone(),
                finding_info,
            },
            state,
        )
    }
}

impl Monitor for LibAflMonitor {
    fn display(
        &mut self,
        client_stats_manager: &mut ClientStatsManager,
        event_msg: &str,
        sender_id: ClientId,
    ) -> Result<(), Error> {
        let Some(event) = (match event_msg {
            "Testcase" => Some(StatusEvent::Testcase),
            "Objective" => Some(StatusEvent::Objective),
            _ => None,
        }) else {
            return Ok(());
        };

        let (campaign_started, colors_enabled, last_edges_are_synthetic) = {
            let state = self.state.borrow();
            (
                state.campaign_started,
                state.colors_enabled,
                state.last_edges_are_synthetic,
            )
        };
        let snapshot =
            build_progress_snapshot(client_stats_manager, sender_id, last_edges_are_synthetic)?;
        self.state.borrow_mut().last_progress = Some(snapshot);

        if !campaign_started
            && matches!(event, StatusEvent::Testcase)
            && !snapshot.corpus_size.is_power_of_two()
        {
            return Ok(());
        }

        match event {
            StatusEvent::Objective => {
                let finding_info = read_finding_info(self.finding_info);
                eprintln!(
                    "{}",
                    format_objective_line(snapshot.executions, finding_info, colors_enabled),
                );
            }
            StatusEvent::Testcase => {
                eprintln!(
                    "{}",
                    format_progress_line(event, snapshot, colors_enabled, campaign_started),
                );
            }
            StatusEvent::Heartbeat | StatusEvent::Done => unreachable!(),
        }

        self.state.borrow_mut().last_status_output_at = Some(Instant::now());

        Ok(())
    }
}

fn format_duration(duration: Duration) -> String {
    let total_seconds = duration.as_secs();
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;

    if hours > 0 {
        format!("{hours}h{minutes:02}m{seconds:02}s")
    } else if minutes > 0 {
        format!("{minutes}m{seconds:02}s")
    } else {
        format!("{seconds}s")
    }
}

fn should_colorize_output() -> bool {
    if std::env::var_os("NO_COLOR").is_some() {
        return false;
    }

    if matches!(std::env::var("TERM"), Ok(term) if term == "dumb") {
        return false;
    }

    std::io::stderr().is_terminal()
}

fn monitor_timeout() -> Duration {
    match std::env::var("JAZZER_LIBAFL_MONITOR_TIMEOUT_MS") {
        Ok(value) => value
            .parse::<u64>()
            .ok()
            .filter(|timeout| *timeout > 0)
            .map(Duration::from_millis)
            .unwrap_or(DEFAULT_MONITOR_TIMEOUT),
        Err(_) => DEFAULT_MONITOR_TIMEOUT,
    }
}

fn ratio_from_user_stat(user_stat: Option<&UserStats>) -> Option<RatioMetric> {
    let UserStatsValue::Ratio(numerator, denominator) = user_stat?.value() else {
        return None;
    };
    Some(RatioMetric {
        numerator: *numerator,
        denominator: *denominator,
    })
}

fn format_ratio_metric(metric: Option<RatioMetric>) -> String {
    let Some(metric) = metric else {
        return "   -/   - (  -%)".to_string();
    };

    if metric.denominator == 0 {
        return format!("{:>4}/{:<4} (  -%)", metric.numerator, metric.denominator);
    }

    let percentage = metric.numerator.saturating_mul(100) / metric.denominator;
    format!(
        "{:>4}/{:<4} ({:>3}%)",
        metric.numerator, metric.denominator, percentage
    )
}

fn colorize_marker(marker: &str, sgr_code: &str, colors_enabled: bool) -> String {
    if colors_enabled {
        format!("\x1b[{sgr_code}m{marker}\x1b[0m")
    } else {
        marker.to_string()
    }
}

fn marker_text(event: StatusEvent) -> &'static str {
    match event {
        StatusEvent::Testcase => "[+]",
        StatusEvent::Heartbeat => "[*]",
        StatusEvent::Objective => "[!]",
        StatusEvent::Done => "[=]",
    }
}

fn event_color_code(event: StatusEvent) -> &'static str {
    match event {
        StatusEvent::Testcase => "32",
        StatusEvent::Heartbeat => "2",
        StatusEvent::Objective => "1;31",
        StatusEvent::Done => "34",
    }
}

fn marker_for_event(event: StatusEvent, colors_enabled: bool) -> String {
    colorize_marker(marker_text(event), event_color_code(event), colors_enabled)
}

fn start_marker(colors_enabled: bool) -> String {
    colorize_marker("[>]", "34", colors_enabled)
}

fn format_inited_field(label: &str, value: impl std::fmt::Display) -> String {
    let value = value.to_string();
    format!("    {label:<15} {}", value.trim_start())
}

fn build_progress_snapshot(
    client_stats_manager: &mut ClientStatsManager,
    sender_id: ClientId,
    hide_edges: bool,
) -> Result<ProgressSnapshot, Error> {
    let (executions, corpus_size, execs_per_sec, objective_size, elapsed) = {
        let global_stats = client_stats_manager.global_stats();
        (
            global_stats.total_execs,
            global_stats.corpus_size,
            global_stats.execs_per_sec,
            global_stats.objective_size,
            global_stats.run_time,
        )
    };
    let client_stats = client_stats_manager.client_stats_for(sender_id)?;
    Ok(ProgressSnapshot {
        executions,
        edges: if hide_edges {
            None
        } else {
            ratio_from_user_stat(client_stats.get_user_stats("edges"))
        },
        corpus_size,
        execs_per_sec,
        objective_size,
        stability: ratio_from_user_stat(client_stats.get_user_stats("stability")),
        elapsed,
    })
}

fn format_progress_line(
    event: StatusEvent,
    snapshot: ProgressSnapshot,
    colors_enabled: bool,
    highlight_full_line: bool,
) -> String {
    let marker = if colors_enabled && !highlight_full_line {
        marker_for_event(event, true)
    } else {
        marker_text(event).to_string()
    };
    let line = format!(
        "{} #{:<width$} | edges: {} | corp: {:>4} | exec/s: {:>8.1} | obj: {:>3} | stab: {} | t: {}",
        marker,
        snapshot.executions,
        format_ratio_metric(snapshot.edges),
        snapshot.corpus_size,
        if snapshot.execs_per_sec.is_finite() {
            snapshot.execs_per_sec
        } else {
            0.0
        },
        snapshot.objective_size,
        format_ratio_metric(snapshot.stability),
        format_duration(snapshot.elapsed),
        width = EXECUTION_FIELD_WIDTH,
    );

    if colors_enabled && highlight_full_line {
        format!("\x1b[{}m{}\x1b[0m", event_color_code(event), line)
    } else {
        line
    }
}

fn maybe_print_final_init_testcase(state: &mut MonitorState, loaded_inputs: usize) {
    let Some(snapshot) = state.last_progress else {
        return;
    };

    if snapshot.corpus_size == 0
        || snapshot.corpus_size.is_power_of_two()
        || snapshot.corpus_size != loaded_inputs as u64
    {
        return;
    }

    eprintln!(
        "{}",
        format_progress_line(StatusEvent::Testcase, snapshot, state.colors_enabled, false),
    );
    state.last_status_output_at = Some(Instant::now());
}

fn build_idle_progress_snapshot<S>(
    state: &S,
    started_at: Instant,
    monitor_state: &MonitorState,
) -> ProgressSnapshot
where
    S: HasCorpus<BytesInput> + HasExecutions + HasSolutions<BytesInput>,
{
    let executions = *state.executions();
    let elapsed = started_at.elapsed();
    let execs_per_sec = if elapsed.as_secs_f64() > 0.0 {
        executions as f64 / elapsed.as_secs_f64()
    } else {
        0.0
    };

    ProgressSnapshot {
        executions,
        edges: monitor_state
            .last_progress
            .and_then(|snapshot| snapshot.edges),
        corpus_size: state.corpus().count() as u64,
        execs_per_sec,
        objective_size: state.solutions().count() as u64,
        stability: monitor_state
            .last_progress
            .and_then(|snapshot| snapshot.stability),
        elapsed,
    }
}

fn maybe_emit_idle_heartbeat<S>(
    monitor_state: &mut MonitorState,
    state: &S,
    started_at: Instant,
    monitor_timeout: Duration,
) where
    S: HasCorpus<BytesInput> + HasExecutions + HasSolutions<BytesInput>,
{
    let Some(last_status_output_at) = monitor_state.last_status_output_at else {
        return;
    };

    if last_status_output_at.elapsed() < monitor_timeout {
        return;
    }

    let snapshot = build_idle_progress_snapshot(state, started_at, monitor_state);
    eprintln!(
        "{}",
        format_progress_line(
            StatusEvent::Heartbeat,
            snapshot,
            monitor_state.colors_enabled,
            true,
        ),
    );
    monitor_state.last_progress = Some(snapshot);
    monitor_state.last_status_output_at = Some(Instant::now());
}

#[derive(Clone)]
struct FindingInfo {
    artifact: Option<String>,
    summary: Option<String>,
}

fn read_zero_terminated_string(bytes: &[u8]) -> Option<String> {
    let len = bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(bytes.len());
    if len == 0 {
        return None;
    }

    Some(String::from_utf8_lossy(&bytes[..len]).into_owned())
}

fn read_finding_info(finding_info: *mut JazzerLibAflFindingInfo) -> FindingInfo {
    let Some(finding_info) = (unsafe { finding_info.as_ref() }) else {
        return FindingInfo {
            artifact: None,
            summary: None,
        };
    };

    if finding_info.has_value == 0 {
        return FindingInfo {
            artifact: None,
            summary: None,
        };
    }

    FindingInfo {
        artifact: read_zero_terminated_string(&finding_info.artifact),
        summary: read_zero_terminated_string(&finding_info.summary),
    }
}

fn format_objective_line(
    executions: u64,
    finding_info: FindingInfo,
    colors_enabled: bool,
) -> String {
    let artifact = finding_info
        .artifact
        .unwrap_or_else(|| "<unknown>".to_string());
    let summary = finding_info
        .summary
        .unwrap_or_else(|| "finding".to_string());
    let line = format!(
        "{} #{:<width$} | artifact: {} | {}",
        marker_text(StatusEvent::Objective),
        executions,
        artifact,
        summary,
        width = EXECUTION_FIELD_WIDTH,
    );

    if colors_enabled {
        format!(
            "\x1b[{}m{}\x1b[0m",
            event_color_code(StatusEvent::Objective),
            line,
        )
    } else {
        line
    }
}

fn print_runtime_done(
    reason: &str,
    started_at: Instant,
    executions: u64,
    objective_size: usize,
    last_progress: Option<ProgressSnapshot>,
    colors_enabled: bool,
) {
    let elapsed = started_at.elapsed();
    let elapsed_seconds = elapsed.as_secs_f64();
    let execs_per_sec = if elapsed_seconds > 0.0 {
        executions as f64 / elapsed_seconds
    } else {
        0.0
    };
    let edges = last_progress.and_then(|snapshot| snapshot.edges);

    eprintln!(
        "{} #{:<width$} | DONE\n    reason:     {}\n    time:       {}\n    edges:      {}\n    crashes:    {}\n    speed:      {:.1} exec/s",
        marker_for_event(StatusEvent::Done, colors_enabled),
        executions,
        reason,
        format_duration(elapsed),
        format_ratio_metric(edges),
        objective_size,
        execs_per_sec,
        width = EXECUTION_FIELD_WIDTH,
    );
}

fn print_runtime_start(
    options: &JazzerLibAflRuntimeOptions,
    loaded_inputs: usize,
    edges: Option<RatioMetric>,
    colors_enabled: bool,
) {
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
        "{} INITED\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}",
        start_marker(colors_enabled),
        format_inited_field("mode:", "fuzzing"),
        format_inited_field("seed:", options.seed),
        format_inited_field("loaded_inputs:", loaded_inputs),
        format_inited_field("edges:", format_ratio_metric(edges)),
        format_inited_field("timeout:", format!("{} ms", options.timeout_millis)),
        format_inited_field("max_len:", options.max_len),
        format_inited_field("runs:", runs),
        format_inited_field("max_total_time:", max_total_time),
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

fn clear_finding_info(ptr: *mut JazzerLibAflFindingInfo) {
    if ptr.is_null() {
        return;
    }

    unsafe {
        ptr::write_bytes(ptr, 0, 1);
    }
}

fn edge_map_len(maps: &JazzerLibAflRuntimeSharedMaps) -> usize {
    if maps.edges_size.is_null() {
        0
    } else {
        unsafe { (*maps.edges_size).min(maps.edges_capacity) }
    }
}

fn has_non_zero_coverage(ptr: *mut u8, len: usize) -> bool {
    if ptr.is_null() || len == 0 {
        return false;
    }

    unsafe { slice::from_raw_parts(ptr, len).iter().any(|slot| *slot != 0) }
}

fn ensure_non_empty_edge_map(ptr: *mut u8, len: usize) -> bool {
    if has_non_zero_coverage(ptr, len) {
        return false;
    }

    if ptr.is_null() || len == 0 {
        return false;
    }

    unsafe {
        let map = slice::from_raw_parts_mut(ptr, len);
        // Power scheduling rejects corpus entries that never hit any edge.
        // Preserve the old behavior for uninstrumented callbacks by marking
        // one synthetic edge only when the target left every coverage region untouched.
        map[0] = 1;
    }

    true
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
        || maps.edges_capacity == 0
        || maps.edges_size.is_null()
        || maps.cmp.is_null()
        || maps.cmp_len == 0
        || maps.compare_log.is_null()
        || maps.finding_info.is_null()
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

    let (monitor, monitor_state) = LibAflMonitor::new(maps.finding_info);
    let mut mgr = SimpleEventManager::new(monitor);

    let edges_observer = HitcountsMapObserver::new(
        VariableMapObserver::from_mut_ptr(
            "edges",
            maps.edges,
            maps.edges_capacity,
            maps.edges_size,
        ),
    )
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
        clear_shared_map(maps.edges, edge_map_len(maps));
        clear_shared_map(maps.cmp, maps.cmp_len);
        clear_compare_log(maps.compare_log);
        clear_finding_info(maps.finding_info);

        let bytes = input.target_bytes();
        let bytes = bytes.as_slice();
        let size = bytes.len().min(options.max_len);
        let status = unsafe { execute_one(user_data, bytes.as_ptr(), size) };
        let synthetic_edges = ensure_non_empty_edge_map(
            maps.edges,
            edge_map_len(maps),
        );
        monitor_state.borrow_mut().last_edges_are_synthetic = synthetic_edges;
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

    {
        let mut monitor_state = monitor_state.borrow_mut();
        maybe_print_final_init_testcase(&mut monitor_state, state.corpus().count());
        print_runtime_start(
            options,
            state.corpus().count(),
            monitor_state
                .last_progress
                .and_then(|snapshot| snapshot.edges),
            monitor_state.colors_enabled,
        );
        monitor_state.last_status_output_at = Some(Instant::now());
        monitor_state.campaign_started = true;
    }

    let started_at = Instant::now();
    let monitor_timeout = monitor_timeout();
    let max_total_time = if options.max_total_time_seconds == 0 {
        None
    } else {
        Some(Duration::from_secs(options.max_total_time_seconds))
    };

    let initial_executions = *state.executions();
    let mut status = RUNTIME_OK;
    let done_reason = loop {
        if options.runs != 0
            && state.executions().saturating_sub(initial_executions) >= options.runs
        {
            break "runs";
        }
        if let Some(max_total_time) = max_total_time {
            if started_at.elapsed() >= max_total_time {
                status = RUNTIME_STOPPED;
                break "max_total_time";
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
            break "stop_requested";
        }

        maybe_emit_idle_heartbeat(
            &mut monitor_state.borrow_mut(),
            &state,
            started_at,
            monitor_timeout,
        );
    };

    let monitor_state = monitor_state.borrow();
    print_runtime_done(
        done_reason,
        started_at,
        *state.executions(),
        state.solutions().count(),
        monitor_state.last_progress,
        monitor_state.colors_enabled,
    );

    status
}
