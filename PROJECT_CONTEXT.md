# Codabench Participant Sync Context

## Purpose

Download participant data from a configured Codabench competition and merge it into the configured Google Sheet participant list.

## First Instruction For Codex

Before modifying or running this project, read this file and the local private config file, normally `config.local.json`.

## Main Command

Run from the project root:

```bash
./scripts/run-sync.sh
```

## Files

- `config.example.json`: safe public template.
- `config.local.json`: private local config with the real competition URL, Google Sheet URL/tab, ignore list, affiliation map, and paths. This file is ignored by Git.
- `scripts/run-codabench-sync.cjs`: full manual workflow.
- `scripts/run-sync.sh`: preferred Codex/local entrypoint; finds Node.js and Playwright without requiring `npm` on PATH.
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
- If `Affiliation Institute/Company` is blank in a row, infer the affiliation from the user's email address. Use the email domain together with your own knowledge or a brief internet search to identify a specific institute, university, lab, or company. Enter the affiliation you found. If the email address is from a personal/general provider, is not associated with a specific institute or company, or the affiliation is still uncertain after a brief search, enter `N/A`.
- The merge script enforces affiliation review. Every pending participant email domain must be explicitly present in `config.local.json` under `affiliationsByDomain` before the Sheet is updated. Add the specific affiliation for confident domains, or add `"domain.example": "N/A"` only after the brief review above.

## Current Google Sheet

- Tab: configured by `googleSheet.tabName`
- Required columns:
  - `Participant username`
  - `Participant email`
  - `Status`
  - `Affiliation Institute/Company`

## Important Caveat

Direct terminal runs use the saved affiliation-domain map in the local config. They do not perform fresh web research by themselves. When Codex runs the workflow and new or blank affiliations need judgment, Codex should first use the participant email address to identify the affiliation from existing knowledge or brief internet research, update `config.local.json` with either a confident domain-to-affiliation mapping or an explicit `N/A`, and then run the merge. If a pending domain is not reviewed in `config.local.json`, the merge stops before editing the Sheet.

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
