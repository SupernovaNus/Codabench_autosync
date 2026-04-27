#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");

function gitList(args) {
  const result = spawnSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }

  return result.stdout.split("\0").filter(Boolean);
}

function readJsonIfPresent(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, file), "utf8"));
  } catch {
    return null;
  }
}

function readTextIfPresent(file) {
  try {
    return fs.readFileSync(path.join(projectRoot, file), "utf8");
  } catch {
    return "";
  }
}

function spreadsheetId(url) {
  return String(url || "").match(/\/spreadsheets\/d\/([^/]+)/)?.[1] || "";
}

function privateNeedles() {
  const needles = new Set();
  const localConfig = readJsonIfPresent("config.local.json");

  if (localConfig?.googleSheet?.url) {
    needles.add(localConfig.googleSheet.url);
    needles.add(spreadsheetId(localConfig.googleSheet.url));
  }

  for (const username of localConfig?.ignoreUsernames || []) {
    needles.add(username);
  }

  const participantCsv = readTextIfPresent("data/participants.csv");
  for (const email of participantCsv.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) {
    needles.add(email);
  }

  return [...needles].filter(Boolean);
}

function main() {
  const files = new Set([
    ...gitList(["ls-files", "-z"]),
    ...gitList(["ls-files", "-o", "--exclude-standard", "-z"]),
  ]);
  const needles = privateNeedles();
  const findings = [];
  const googleSheetUrlPattern = /https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}/;
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

  for (const file of files) {
    const fullPath = path.join(projectRoot, file);
    if (!fs.statSync(fullPath).isFile()) {
      continue;
    }

    const text = fs.readFileSync(fullPath, "utf8");
    const matchedPrivateValue = needles.some((needle) => text.includes(needle));
    const matchedGoogleSheetUrl = googleSheetUrlPattern.test(text);
    const matchedEmail = emailPattern.test(text);

    if (matchedPrivateValue || matchedGoogleSheetUrl || matchedEmail) {
      findings.push(file);
    }
  }

  if (findings.length > 0) {
    console.error("Potential private data found in trackable files:");
    for (const file of findings) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }

  console.log(`Repository safety check passed for ${files.size} trackable files.`);
}

try {
  main();
} catch (error) {
  console.error(`Repository safety check failed: ${error.message}`);
  process.exit(1);
}
