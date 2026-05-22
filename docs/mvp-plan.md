# MVP plan

## Repository fit

This repository started as an empty independent project, which is the right
boundary for the log analyzer. The existing `cpk_qc` application demonstrates
one useful engineering shape: a Rust workspace with a domain core crate and a
thin Tauri bridge. Its CPK sheet model, chart navigation, export workflow, and
frontend state should stay out of this project.

The first parser contract is now in `log_core`. A Tauri desktop shell can be
added after real Function Test fixtures confirm the data model.

## Phase 1 split

1. Parser foundation
   - Collect redacted real logs by station type.
   - Keep raw samples in parser fixture folders and expected reports as golden
     JSON.
   - Stabilize common parsed report types, parser matching, and anomaly context.
2. Function Test vertical slice
   - Parse device identity, station result, duration, key parameters, anomalies,
     and Shmoo matrices.
   - Add the desktop folder-import command and return parsed reports from Rust.
   - Render device overview, process result table, anomaly list, and Shmoo view.
3. Parser expansion
   - Add Radio, Txpower, Install_APboot, Verify_TPM_AOS, and OBA parsers one at
     a time with fixture and golden coverage.
   - Add multi-file device merge rules once logs show stable SN/MAC linkage.
4. Later phases
   - Add SQLite history only after report identity and merge rules are stable.
   - Add AI summaries and classification after rule output is testable and
     redaction policy is defined.

## Contract and folders

Current parser assets:

- `contracts/parsed-log.schema.json`: frontend/Tauri report contract review
- `log_core/src/model.rs`: Rust source of truth for current parsed data model
- `log_core/tests/fixtures/<log-kind>/`: redacted or synthetic raw logs
- `log_core/tests/golden/<log-kind>/`: expected parsed JSON regressions

The first Tauri API should stay narrow:

- `parse_log_file(path) -> ParsedLog` for single-file parser iteration
- `parse_log_folder(path) -> Vec<ParsedLog>` for MVP folder import

After real fixtures expose device grouping rules, replace folder return data
with a merged device report rather than forcing grouping into the UI.
