# log_analysis

`log_analysis` is the independent desktop application workspace for production
test log parsing and diagnosis. It is intentionally separate from `cpk_qc`:
the parser domain is centered on device logs, station steps, anomalies, and
Shmoo data rather than Excel sheets and CPK distributions.

The first implementation slice lives in [`log_core`](./log_core). It keeps the
log data contract and parsers independent from the future Tauri command layer
and React report UI.

## Current scope

- Rust workspace with an independent `log_core` crate
- Shared parsed report model and parser interface
- Function Test parser baseline
- Fixture and golden JSON regression test structure
- JSON Schema for frontend and Tauri contract review

See [`docs/mvp-plan.md`](./docs/mvp-plan.md) for the phase-1 split and next
desktop integration steps.
