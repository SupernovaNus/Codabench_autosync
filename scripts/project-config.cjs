const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const defaultConfigFile = fs.existsSync(path.join(projectRoot, "config.local.json"))
  ? "config.local.json"
  : "config.json";
const configFile = process.env.CODEX_SYNC_CONFIG || defaultConfigFile;
const configPath = path.isAbsolute(configFile) ? configFile : path.join(projectRoot, configFile);

if (!fs.existsSync(configPath)) {
  throw new Error(
    `Config file not found: ${configPath}. Copy config.example.json to config.local.json and fill in local values.`,
  );
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function resolveProjectPath(value) {
  if (!value) {
    throw new Error(`Expected a non-empty project path in ${path.basename(configPath)}.`);
  }
  return path.isAbsolute(value) ? value : path.join(projectRoot, value);
}

function spreadsheetIdFromUrl(url) {
  const match = String(url || "").match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match) {
    throw new Error("Could not parse Google spreadsheet id from config.googleSheet.url.");
  }
  return match[1];
}

function googleSheetCsvUrl() {
  const spreadsheetId = spreadsheetIdFromUrl(config.googleSheet.url);
  const tabName = encodeURIComponent(config.googleSheet.tabName);
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${tabName}&headers=0`;
}

const paths = {
  dataDir: resolveProjectPath(config.paths.dataDir),
  logsDir: resolveProjectPath(config.paths.logsDir),
  participantsCsv: resolveProjectPath(config.paths.participantsCsv),
  profilesDir: resolveProjectPath(config.paths.profilesDir),
  codabenchProfileDir: resolveProjectPath(config.paths.codabenchProfileDir),
  googleSheetProfileDir: resolveProjectPath(config.paths.googleSheetProfileDir),
};

module.exports = {
  config,
  configPath,
  googleSheetCsvUrl,
  paths,
  projectRoot,
  timestampForFilename,
};
