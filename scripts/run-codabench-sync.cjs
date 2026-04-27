#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { paths, projectRoot, timestampForFilename } = require("./project-config.cjs");

const PROJECT_DIR = projectRoot;
const LOG_DIR = paths.logsDir;
const RUN_ID = process.env.CODEX_SYNC_RUN_ID || timestampForFilename(new Date());
const LOG_FILE = path.join(LOG_DIR, `manual-sync-${RUN_ID}.log`);
const CSV_FILE = paths.participantsCsv;

function print(message = "") {
  console.log(message);
  fs.appendFileSync(LOG_FILE, `${message}\n`);
}

function runScript(scriptName) {
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName)], {
    cwd: PROJECT_DIR,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_SYNC_RUN_ID: RUN_ID,
    },
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`;
  process.stdout.write(output);
  fs.appendFileSync(LOG_FILE, output);

  if (result.status !== 0) {
    throw new Error(`${scriptName} failed with exit code ${result.status}`);
  }

  return output;
}

function parseCount(output, label) {
  const match = output.match(new RegExp(`${label}:\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
}

function downloadedRows() {
  const text = fs.readFileSync(CSV_FILE, "utf8").trim();
  if (!text) {
    return 0;
  }
  return Math.max(0, text.split(/\r?\n/).length - 1);
}

function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, "");

  print(`Manual sync run id: ${RUN_ID}`);
  print("Refreshing Codabench participants...");
  runScript("download-codabench-participants.cjs");

  print("\nMerging participants into Google Sheet...");
  const mergeOutput = runScript("append-google-sheet-participants.cjs");

  print("\nVerifying merge with a no-op pass...");
  const verifyOutput = runScript("append-google-sheet-participants.cjs");

  const summary = {
    downloadedRows: downloadedRows(),
    ignoredUsers: parseCount(mergeOutput, "Ignored usernames"),
    appendedRows: parseCount(mergeOutput, "Rows to append"),
    filledAffiliations: parseCount(mergeOutput, "Blank affiliations to fill"),
    verificationRowsToAppend: parseCount(verifyOutput, "Rows to append"),
    verificationBlankAffiliations: parseCount(verifyOutput, "Blank affiliations to fill"),
  };

  print("\nManual sync summary");
  print(`Downloaded rows: ${summary.downloadedRows}`);
  print(`Ignored users: ${summary.ignoredUsers}`);
  print(`Appended rows: ${summary.appendedRows}`);
  print(`Filled blank affiliations: ${summary.filledAffiliations}`);
  print(`Verification rows to append: ${summary.verificationRowsToAppend}`);
  print(`Verification blank affiliations: ${summary.verificationBlankAffiliations}`);
  print(`Log file: ${LOG_FILE}`);

  if (summary.verificationRowsToAppend !== 0 || summary.verificationBlankAffiliations !== 0) {
    throw new Error("Verification pass still found pending updates.");
  }
}

try {
  main();
} catch (error) {
  const message = `\nManual sync failed: ${error.message}`;
  console.error(message);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, `${message}\n`);
  process.exitCode = 1;
}
