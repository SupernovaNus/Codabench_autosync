# Codabench Participant Sync

This project downloads a participant CSV from Codabench and merges missing participants into a Google Sheet. Codex can help maintain the scripts and update the local affiliation map, but direct script runs use only the saved config values.

## Run

From the project root:

```bash
./scripts/run-sync.sh
```

The runner performs three steps:

1. Download the latest Codabench participants CSV.
2. Merge missing, non-ignored users into the Google Sheet.
3. Run a second no-op verification pass.

Before committing, run:

```bash
node scripts/check-repo-safety.cjs
```

## Project Layout

```text
scripts/             Workflow scripts
data/                Local downloaded CSV, ignored by Git
logs/                Timestamped run logs and failure screenshots
.profiles/          Local browser profiles, ignored by Git
config.example.json  Safe template for local configuration
config.local.json    Local private configuration, ignored by Git
PROJECT_CONTEXT.md   Short Codex handoff context
```

## Configuration

For a normal local terminal, install dependencies first:

```bash
npm install
```

Inside Codex, `npm` may not be on the shell PATH. Use `./scripts/run-sync.sh`; it finds the Codex-provided `node` and Playwright runtime automatically when local `node_modules/` is not present.

Create a private local config before running:

```bash
cp config.example.json config.local.json
```

Then edit `config.local.json` for routine changes:

- `codabench.competitionUrl`: Codabench competition page
- `googleSheet.url`: editable Google Sheet URL
- `googleSheet.tabName`: sheet tab to update
- `ignoreUsernames`: usernames to skip for future appends
- `affiliationsByDomain`: known email-domain affiliation mapping

Do not commit `config.local.json`; it may contain usernames, private URLs, and local workflow details.

Direct script runs use the saved affiliation map only. Ask Codex to research unknown domains if you want new affiliation judgments before updating the Sheet.

## Notes

- Do not delete `.profiles/` casually; it stores browser login sessions.
- Logs are timestamped and written under `logs/`.
- `data/participants.csv` is overwritten on each successful download.
