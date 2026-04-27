#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { config, paths, timestampForFilename } = require("./project-config.cjs");

const COMPETITION_URL = config.codabench.competitionUrl;
const DATA_DIR = paths.dataDir;
const LOG_DIR = paths.logsDir;
const RUN_ID = process.env.CODEX_SYNC_RUN_ID || timestampForFilename(new Date());
const PROFILE_DIR = paths.codabenchProfileDir;
const DOWNLOAD_DIR = DATA_DIR;
const DOWNLOAD_FILE = paths.participantsCsv;
const LOG_FILE = `${LOG_DIR}/codabench-download-${RUN_ID}.log`;
const SCREENSHOT_FILE = `${LOG_DIR}/codabench-download-failure-${RUN_ID}.png`;
const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PLAYWRIGHT_NODE_MODULES = process.env.PLAYWRIGHT_NODE_MODULES;

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

async function clickFirst(page, descriptions) {
  const errors = [];

  for (const item of descriptions) {
    const locator = item.locator();
    try {
      await locator.first().waitFor({ state: "visible", timeout: item.timeout || 5000 });
      await locator.first().click();
      log(`Clicked ${item.name}.`);
      return true;
    } catch (error) {
      errors.push(`${item.name}: ${error.message.split("\n")[0]}`);
    }
  }

  throw new Error(`Could not click any target:\n${errors.join("\n")}`);
}

async function waitForParticipantArea(page) {
  const participantsText = page.getByText(/participants/i);
  await participantsText.first().waitFor({ state: "visible", timeout: 180000 });
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, `\n--- codabench download start ${new Date().toISOString()} ---\n`);

  const { chromium } = loadPlaywright();

  log(`Opening Codabench in Chrome with profile: ${PROFILE_DIR}`);
  log("If Codabench asks you to log in, complete the login in the opened Chrome window.");

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    acceptDownloads: true,
    downloadsPath: DOWNLOAD_DIR,
    executablePath: CHROME_PATH,
    headless: false,
    viewport: { width: 1440, height: 1000 },
  });

  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(30000);

  try {
    await page.goto(COMPETITION_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    log(`Loaded: ${page.url()}`);

    log("Looking for the Participants tab. This can take a moment if you need to log in.");
    await waitForParticipantArea(page);

    await clickFirst(page, [
      {
        name: "Participants tab by role",
        locator: () => page.getByRole("tab", { name: /^participants$/i }),
      },
      {
        name: "Participants link by role",
        locator: () => page.getByRole("link", { name: /^participants$/i }),
      },
      {
        name: "Participants button by role",
        locator: () => page.getByRole("button", { name: /^participants$/i }),
      },
      {
        name: "Participants visible text",
        locator: () => page.getByText(/^participants$/i),
      },
    ]);

    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    log("Waiting for the participant controls to become available.");

    const downloadPromise = page.waitForEvent("download", { timeout: 180000 });

    await clickFirst(page, [
      {
        name: "Download all participants button",
        locator: () => page.getByRole("button", { name: /download all participants/i }),
        timeout: 15000,
      },
      {
        name: "Download all participants link",
        locator: () => page.getByRole("link", { name: /download all participants/i }),
      },
      {
        name: "Download all participants text",
        locator: () => page.getByText(/download all participants/i),
      },
      {
        name: "Download participants fallback",
        locator: () => page.getByText(/download.*participants/i),
      },
    ]);

    const download = await downloadPromise;
    const targetPath = DOWNLOAD_FILE;
    await download.saveAs(targetPath);

    const stats = fs.statSync(targetPath);
    if (stats.size === 0) {
      throw new Error(`Downloaded file is empty: ${targetPath}`);
    }

    log(`Saved participants export: ${targetPath}`);
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
