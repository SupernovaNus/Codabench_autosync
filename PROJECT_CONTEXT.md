# Codabench Participant Sync Context

## Purpose

Download participant data from a configured Codabench competition and merge it into the configured Google Sheet participant list.

## First Instruction For Codex

Before modifying or running this project, read this file and the local private config file, normally `config.local.json`.

## Main Command

Run from the project root:

```bash
node scripts/run-codabench-sync.cjs
```

## Files

- `config.example.json`: safe public template.
- `config.local.json`: private local config with the real competition URL, Google Sheet URL/tab, ignore list, affiliation map, and paths. This file is ignored by Git.
- `scripts/run-codabench-sync.cjs`: full manual workflow.
- `scripts/download-codabench-participants.cjs`: downloads Codabench CSV into `data/participants.csv`.
- `scripts/append-google-sheet-participants.cjs`: merges CSV into Google Sheet.
- `scripts/project-config.cjs`: shared config/path helper.
- `scripts/check-repo-safety.cjs`: checks that trackable files do not contain local private values before committing.
- `data/participants.csv`: latest downloaded participant CSV.
- `logs/`: timestamped run logs and failure screenshots.
- `.profiles/`: browser login profiles; do not delete casually.

## Merge Rules

- Skip usernames listed in the local config under `ignoreUsernames`.
- Do not duplicate usernames already present in `Participant username`.
- New rows get `googleSheet.statusForNewRows`, currently `Review Required`.
- Existing rows with blank `Affiliation Institute/Company` are filled from email domain.
- Unknown or personal email domains become `N/A`.

## Current Google Sheet

- Tab: configured by `googleSheet.tabName`
- Required columns:
  - `Participant username`
  - `Participant email`
  - `Status`
  - `Affiliation Institute/Company`

## Important Caveat

Direct terminal runs use the saved affiliation-domain map in the local config. They do not perform fresh web research. If new unknown domains appear and affiliation quality matters, ask Codex to research those domains and update `config.local.json` before running the sync.

## Repository Safety

Do not commit local runtime data:

- `config.local.json`
- `data/participants.csv`
- `logs/`
- `.profiles/`

The tracked configuration should be `config.example.json` only.

Before making a commit, run:

```bash
node scripts/check-repo-safety.cjs
```
