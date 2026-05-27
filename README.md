# Production Log Diagnosis

Production Log Diagnosis is a Tauri desktop application for parsing and
diagnosing manufacturing test logs. It imports individual log files or folders,
groups logs by physical device, highlights failed steps and anomaly context, and
can use an AI model to classify issues and generate a readable production test
report.

[中文说明](./README.zh-CN.md)

## What It Does

- Imports `.log` and `.txt` production test files from a file picker or drag and
  drop.
- Parses Function Test, Install APboot, Verify TPM & AOS, Radio Test, Txpower
  Test, and OBA Test logs.
- Aggregates related logs by device identifiers such as SN, MAC, model, SMT, and
  production date.
- Shows device-level status, test coverage, process timelines, detailed step
  results, key parameters, and pass/fail summaries.
- Extracts warning, error, and failed contexts with source file and line
  references.
- Renders Shmoo data for memory margin inspection when available.
- Supports optional AI-assisted anomaly classification, device summaries, and
  Markdown report generation.
- Saves generated reports and AI caches into a `.log_analysis` folder beside the
  imported logs.
- Exports generated Markdown reports to PDF from the desktop app.
- Supports English and Simplified Chinese UI, light/dark/system themes, and
  Tauri updater artifacts.

## Project Layout

```text
.
|-- log_core/              # Rust parser crate and golden tests
|-- src/                   # React UI, aggregation, AI model integration
|-- src-tauri/             # Tauri shell, commands, updater config
|-- contracts/             # Parsed log JSON schema
|-- docs/                  # Planning and design notes
|-- .github/workflows/     # Build and release workflows
```

## Development

Requirements:

- Node.js 22
- pnpm
- Rust stable
- Tauri platform dependencies for your OS

Install dependencies:

```bash
pnpm install
```

Run the desktop app in development:

```bash
pnpm tauri dev
```

Build the frontend only:

```bash
pnpm build
```

Build the desktop app:

```bash
pnpm tauri build
```

Run Rust parser tests:

```bash
cargo test
```

## AI Features

AI features are disabled by default. Enable them in Settings and choose one of
the supported providers:

- Ollama local models, defaulting to `http://127.0.0.1:11434`
- OpenAI-compatible APIs
- Custom OpenAI-compatible endpoints

API keys are stored through the desktop command layer instead of being embedded
in the repository. Before sending prompts, the app applies its local
desensitization rules and records model-call audit metadata.

## Releases

The CI build workflow runs for `main`, `release`, version tags, pull requests to
those branches, and manual dispatches. Release builds run on version tags and
upload Tauri assets to this repository's GitHub Releases. Build artifacts are no
longer published to the separate `tools-releases` repository.
