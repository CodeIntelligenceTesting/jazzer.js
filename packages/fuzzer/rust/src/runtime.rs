use core::ffi::c_void;
use std::cell::Cell;
use std::time::{Duration, Instant};

use libafl::{
    corpus::{CachedOnDiskCorpus, Corpus, InMemoryCorpus},
    events::SimpleEventManager,
    executors::{inprocess::InProcessExecutor, ExitKind, ShadowExecutor},
    feedback_or_fast,
    feedbacks::{CrashFeedback, MaxMapFeedback, TimeoutFeedback},
    fuzzer::{Evaluator, Fuzzer, StdFuzzer},
    inputs::{BytesInput, HasTargetBytes},
    mutators::{
        havoc_mutations::havoc_mutations, scheduled::HavocScheduledMutator, tokens_mutations,
        I2SRandReplace,
    },
    observers::{CanTrack, HitcountsMapObserver, StdMapObserver, VariableMapObserver},
    schedulers::{
        powersched::PowerSchedule, IndexesLenTimeMinimizerScheduler, PowerQueueScheduler,
    },
    stages::{calibrate::CalibrationStage, shadow::ShadowTracingStage, StdPowerMutationalStage},
    state::{HasCorpus, HasExecutions, HasMaxSize, HasSolutions, StdState},
    HasMetadata,
};
use libafl_bolts::{
    rands::StdRand,
    tuples::{tuple_list, Merge},
    AsSlice,
};

use crate::abi::{
    JazzerLibAflExecuteCallback, JazzerLibAflRuntimeOptions, JazzerLibAflRuntimeSharedMaps,
    EXECUTION_CONTINUE, EXECUTION_FATAL, EXECUTION_FINDING, EXECUTION_STOP, EXECUTION_TIMEOUT,
    RUNTIME_FATAL, RUNTIME_FOUND_FINDING, RUNTIME_FOUND_TIMEOUT, RUNTIME_OK, RUNTIME_STOPPED,
};
use crate::compare_log::JazzerCompareLogObserver;
use crate::monitor::{
    maybe_emit_idle_heartbeat, maybe_print_final_init_testcase, monitor_timeout,
    print_runtime_done, print_runtime_start, set_last_edges_are_synthetic, LibAflMonitor,
};
use crate::runtime_config::RuntimeConfig;
use crate::shared_maps::SharedMaps;

pub(crate) unsafe fn run_from_ffi(
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
    let maps = match SharedMaps::from_abi(maps) {
        Ok(maps) => maps,
        Err(error) => {
            eprintln!("[libafl] fatal: {error}");
            return RUNTIME_FATAL;
        }
    };
    let config = match RuntimeConfig::from_abi(options) {
        Ok(config) => config,
        Err(error) => {
            eprintln!("[libafl] fatal: {error}");
            return RUNTIME_FATAL;
        }
    };

    run(config, maps, execute_one, user_data)
}

fn run(
    config: RuntimeConfig,
    maps: SharedMaps,
    execute_one: JazzerLibAflExecuteCallback,
    user_data: *mut c_void,
) -> i32 {
    let (monitor, monitor_state) = LibAflMonitor::new(maps.finding_info());
    let mut mgr = SimpleEventManager::new(monitor);

    // SharedMaps::from_abi validated these pointers and the native addon owns
    // the backing storage for the duration of this runtime call.
    let edges_observer = HitcountsMapObserver::new(unsafe {
        VariableMapObserver::from_mut_ptr(
            "edges",
            maps.edges(),
            maps.edges_capacity(),
            maps.edges_size(),
        )
    })
    .track_indices();
    let cmp_observer = HitcountsMapObserver::new(unsafe {
        StdMapObserver::from_mut_ptr("cmp", maps.cmp(), maps.cmp_len())
    });

    let mut feedback = MaxMapFeedback::new(&edges_observer);
    let mut objective = feedback_or_fast!(CrashFeedback::new(), TimeoutFeedback::new());
    let mut state = match StdState::new(
        StdRand::with_seed(config.seed),
        match CachedOnDiskCorpus::no_meta(&config.main_corpus_dir, 256) {
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
    state.set_max_size(config.max_len);

    match config.load_dictionary_tokens() {
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
        maps.clear_for_execution();

        let bytes = input.target_bytes();
        let bytes = bytes.as_slice();
        let size = bytes.len().min(config.max_len);
        let status = unsafe { execute_one(user_data, bytes.as_ptr(), size) };
        let synthetic_edges = maps.ensure_non_empty_edge_map();
        set_last_edges_are_synthetic(&monitor_state, synthetic_edges);
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
    let shadow_observer = JazzerCompareLogObserver::new(maps.compare_log());
    let mut executor = ShadowExecutor::new(executor, tuple_list!(shadow_observer));

    if !config.corpus_dirs.is_empty()
        && state.must_load_initial_inputs()
        && state
            .load_initial_inputs(&mut fuzzer, &mut executor, &mut mgr, &config.corpus_dirs)
            .is_err()
    {
        eprintln!("[libafl] fatal: failed to load initial corpus inputs");
        return RUNTIME_FATAL;
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
            &config,
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
    let max_total_time = if config.max_total_time_seconds == 0 {
        None
    } else {
        Some(Duration::from_secs(config.max_total_time_seconds))
    };

    let initial_executions = *state.executions();
    let mut status = RUNTIME_OK;
    let done_reason = loop {
        if let Some(runs) = config.runs {
            if state.executions().saturating_sub(initial_executions) >= runs {
                break "runs";
            }
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
