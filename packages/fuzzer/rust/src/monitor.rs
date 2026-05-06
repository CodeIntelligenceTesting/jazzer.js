use std::cell::RefCell;
use std::io::IsTerminal;
use std::rc::Rc;
use std::time::{Duration, Instant};

use libafl::{
    corpus::Corpus,
    inputs::BytesInput,
    monitors::{
        stats::{ClientStatsManager, UserStats, UserStatsValue},
        Monitor,
    },
    state::{HasCorpus, HasExecutions, HasSolutions},
    Error,
};
use libafl_bolts::ClientId;

use crate::abi::JazzerLibAflFindingInfo;
use crate::runtime_config::RuntimeConfig;

const EXECUTION_FIELD_WIDTH: usize = 10;
const DEFAULT_MONITOR_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Copy)]
pub(crate) struct RatioMetric {
    numerator: u64,
    denominator: u64,
}

#[derive(Clone, Copy)]
pub(crate) struct ProgressSnapshot {
    executions: u64,
    pub(crate) edges: Option<RatioMetric>,
    corpus_size: u64,
    execs_per_sec: f64,
    objective_size: u64,
    stability: Option<RatioMetric>,
    elapsed: Duration,
}

pub(crate) struct MonitorState {
    pub(crate) campaign_started: bool,
    pub(crate) colors_enabled: bool,
    last_edges_are_synthetic: bool,
    pub(crate) last_status_output_at: Option<Instant>,
    pub(crate) last_progress: Option<ProgressSnapshot>,
}

#[derive(Clone, Copy)]
enum StatusEvent {
    Testcase,
    Heartbeat,
    Objective,
    Done,
}

#[derive(Clone)]
pub(crate) struct LibAflMonitor {
    state: Rc<RefCell<MonitorState>>,
    finding_info: *mut JazzerLibAflFindingInfo,
}

impl LibAflMonitor {
    pub(crate) fn new(
        finding_info: *mut JazzerLibAflFindingInfo,
    ) -> (Self, Rc<RefCell<MonitorState>>) {
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

pub(crate) fn monitor_timeout() -> Duration {
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

pub(crate) fn set_last_edges_are_synthetic(state: &Rc<RefCell<MonitorState>>, value: bool) {
    state.borrow_mut().last_edges_are_synthetic = value;
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

fn progress_marker(event: StatusEvent, in_campaign: bool, colors_enabled: bool) -> String {
    let marker = if matches!(event, StatusEvent::Testcase) && !in_campaign {
        "[i]"
    } else {
        marker_text(event)
    };

    colorize_marker(marker, event_color_code(event), colors_enabled)
}

fn format_progress_line(
    event: StatusEvent,
    snapshot: ProgressSnapshot,
    colors_enabled: bool,
    in_campaign: bool,
) -> String {
    let marker = if colors_enabled && !in_campaign {
        progress_marker(event, false, true)
    } else {
        progress_marker(event, in_campaign, false)
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

    if colors_enabled && in_campaign {
        format!("\x1b[{}m{}\x1b[0m", event_color_code(event), line)
    } else {
        line
    }
}

pub(crate) fn maybe_print_final_init_testcase(state: &mut MonitorState, loaded_inputs: usize) {
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

pub(crate) fn maybe_emit_idle_heartbeat<S>(
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

pub(crate) fn print_runtime_done(
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

pub(crate) fn print_runtime_start(
    config: &RuntimeConfig,
    loaded_inputs: usize,
    edges: Option<RatioMetric>,
    colors_enabled: bool,
) {
    let runs = config
        .runs
        .map(|runs| runs.to_string())
        .unwrap_or_else(|| "unlimited".to_string());
    let max_total_time = if config.max_total_time_seconds == 0 {
        "unlimited".to_string()
    } else {
        format_duration(Duration::from_secs(config.max_total_time_seconds))
    };

    eprintln!(
        "{} INITED\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}",
        start_marker(colors_enabled),
        format_inited_field("mode:", "fuzzing"),
        format_inited_field("seed:", config.seed),
        format_inited_field("loaded_inputs:", loaded_inputs),
        format_inited_field("edges:", format_ratio_metric(edges)),
        format_inited_field("timeout:", format!("{} ms", config.timeout_millis)),
        format_inited_field("max_len:", config.max_len),
        format_inited_field("runs:", runs),
        format_inited_field("max_total_time:", max_total_time),
    );
}
