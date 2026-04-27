#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  config,
  googleSheetCsvUrl,
  paths,
  timestampForFilename,
} = require("./project-config.cjs");

const LOG_DIR = paths.logsDir;
const RUN_ID = process.env.CODEX_SYNC_RUN_ID || timestampForFilename(new Date());
const CSV_FILE = paths.participantsCsv;
const SHEET_URL = config.googleSheet.url;
const SHEET_CSV_URL = googleSheetCsvUrl();
const PROFILE_DIR = paths.googleSheetProfileDir;
const LOG_FILE = `${LOG_DIR}/google-sheet-update-${RUN_ID}.log`;
const SCREENSHOT_FILE = `${LOG_DIR}/google-sheet-update-failure-${RUN_ID}.png`;
const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PLAYWRIGHT_NODE_MODULES = process.env.PLAYWRIGHT_NODE_MODULES;

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanEmail(value) {
  return String(value || "").trim();
}

const AFFILIATIONS_BY_DOMAIN = Object.fromEntries(
  Object.entries(config.affiliationsByDomain || {}).map(([domain, affiliation]) => [
    domain.toLowerCase(),
    affiliation,
  ]),
);

const IGNORED_USERNAMES = new Set(
  (config.ignoreUsernames || []).map(normalizeUsername),
);

function affiliationForEmail(email) {
  const domain = cleanEmail(email).split("@").pop().toLowerCase();
  return AFFILIATIONS_BY_DOMAIN[domain] || "N/A";
}

function columnName(columnNumber) {
  let name = "";
  let current = columnNumber;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (firstError) {
    if (PLAYWRIGHT_NODE_MODULES) {
      const fallbackPlaywright = path.join(PLAYWRIGHT_NODE_MODULES, "playwright");
      if (fs.existsSync(fallbackPlaywright)) {
        return require(fallbackPlaywright);
      }
    }
    throw firstError;
  }
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, `${line}\n`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function toObjects(rows, options = {}) {
  const [headers, ...body] = rows;
  return body
    .filter((row) => row.some((cell) => String(cell).trim() !== ""))
    .map((row, rowIndex) => {
      const object = Object.fromEntries(
        headers.map((header, index) => [String(header).trim(), row[index] || ""]),
      );
      if (options.rowNumbers) {
        object.__rowNumber = rowIndex + 2;
      }
      return object;
    });
}

function getHeaders(rows) {
  const headers = (rows[0] || []).map((header) => String(header).trim());
  while (headers.length > 0 && headers[headers.length - 1] === "") {
    headers.pop();
  }
  return headers;
}

function requireColumn(headers, name) {
  const index = headers.findIndex((header) => header === name);
  if (index === -1) {
    throw new Error(`Required column is missing from sheet: ${name}`);
  }
  return index;
}

function tsvCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ");
}

function makeUpdatePlan(localParticipants, existingRows, sheetHeaders) {
  const usernameColumn = requireColumn(sheetHeaders, "Participant username");
  const emailColumn = requireColumn(sheetHeaders, "Participant email");
  const statusColumn = requireColumn(sheetHeaders, "Status");
  const affiliationColumn = requireColumn(sheetHeaders, "Affiliation Institute/Company");

  const existing = new Map();
  for (const row of existingRows) {
    const username = normalizeUsername(row["Participant username"]);
    if (username) {
      existing.set(username, row);
    }
  }

  const rowsToAppend = localParticipants
    .filter((participant) => {
      const username = normalizeUsername(participant.Username);
      return username && !IGNORED_USERNAMES.has(username) && !existing.has(username);
    })
    .map((participant) => {
      const username = String(participant.Username || "").trim();
      const email = cleanEmail(participant.Email);
      const row = Array.from({ length: sheetHeaders.length }, () => "");
      row[usernameColumn] = username;
      row[emailColumn] = email;
      row[statusColumn] = config.googleSheet.statusForNewRows || "Review Required";
      row[affiliationColumn] = affiliationForEmail(email);
      return row;
    });

  const affiliationUpdates = existingRows
    .filter((row) => {
      const username = normalizeUsername(row["Participant username"]);
      const affiliation = String(row["Affiliation Institute/Company"] || "").trim();
      return username && !affiliation;
    })
    .map((row) => ({
      rowNumber: row.__rowNumber,
      username: String(row["Participant username"] || "").trim(),
      affiliation: affiliationForEmail(row["Participant email"]),
    }));

  return {
    rowsToAppend,
    affiliationUpdates,
    affiliationColumnName: columnName(affiliationColumn + 1),
  };
}

async function waitForSheetReady(page) {
  await page
    .getByText("Participant username")
    .first()
    .waitFor({ state: "visible", timeout: 120000 });
  await page.locator("#t-name-box").waitFor({ state: "visible", timeout: 120000 });
}

async function pasteAt(page, cell, text) {
  const nameBox = page.locator("#t-name-box");
  await nameBox.fill(cell);
  await nameBox.press("Enter");
  await page.waitForTimeout(500);
  await page.evaluate((clipboardText) => navigator.clipboard.writeText(clipboardText), text);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
  await page.waitForTimeout(500);
}

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, `\n--- google sheet update start ${new Date().toISOString()} ---\n`);

  const localRows = toObjects(parseCsv(fs.readFileSync(CSV_FILE, "utf8")));
  const sheetCsv = execFileSync("curl", ["-sSL", SHEET_CSV_URL], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const sheetRows = parseCsv(sheetCsv);
  const sheetHeaders = getHeaders(sheetRows);
  const existingRows = toObjects(sheetRows, { rowNumbers: true });
  const { rowsToAppend, affiliationUpdates, affiliationColumnName } = makeUpdatePlan(
    localRows,
    existingRows,
    sheetHeaders,
  );

  log(`Local participant rows: ${localRows.length}`);
  log(`Existing sheet rows: ${existingRows.length}`);
  log(`Ignored usernames: ${IGNORED_USERNAMES.size}`);
  log(`Rows to append: ${rowsToAppend.length}`);
  log(`Blank affiliations to fill: ${affiliationUpdates.length}`);

  if (rowsToAppend.length === 0 && affiliationUpdates.length === 0) {
    log("No missing participants or blank affiliations found. Nothing to update.");
    return;
  }

  const tsv = rowsToAppend.map((row) => row.map(tsvCell).join("\t")).join("\n");
  const appendStartRow = existingRows.length + 2;

  const { chromium } = loadPlaywright();
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    acceptDownloads: true,
    executablePath: CHROME_PATH,
    headless: false,
    viewport: { width: 1440, height: 1000 },
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "https://docs.google.com",
  });

  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(30000);

  try {
    log("Opening Google Sheet.");
    await page.goto(SHEET_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitForSheetReady(page);
    await page.waitForTimeout(3000);

    if (rowsToAppend.length > 0) {
      const targetRange = `A${appendStartRow}`;
      log(`Selecting ${targetRange} and pasting ${rowsToAppend.length} row(s).`);
      await pasteAt(page, targetRange, tsv);
      await page.waitForTimeout(2500);
    }

    for (const update of affiliationUpdates) {
      const targetCell = `${affiliationColumnName}${update.rowNumber}`;
      log(`Filling ${targetCell} for ${update.username}: ${update.affiliation}`);
      await pasteAt(page, targetCell, update.affiliation);
    }

    log("Waiting for Google Sheets to save.");
    await page.waitForFunction(
      () => document.body.innerText.includes("Saved to this device") || document.body.innerText.includes("Saved to Drive") || document.body.innerText.includes("All changes saved"),
      null,
      { timeout: 60000 },
    ).catch(() => {});

    log("Append attempt finished.");
    await context.close();
  } catch (error) {
    log(`FAILED: ${error.stack || error.message}`);
    await page.screenshot({ path: SCREENSHOT_FILE, fullPage: true }).catch(() => {});
    log(`Failure screenshot saved to: ${SCREENSHOT_FILE}`);
    await context.close();
    process.exitCode = 1;
  }
}

main().catch((error) => {
  log(`FAILED BEFORE BROWSER CLEANUP: ${error.stack || error.message}`);
  process.exitCode = 1;
});
