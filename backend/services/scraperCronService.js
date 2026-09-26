import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCRIPT_PATH = path.join(__dirname, "../scripts/rag/wiki_scraper_ingest.py");
const URL_JSON_PATH = path.join(__dirname, "../data/url.json");
const STATUS_FILE = path.join(__dirname, "../data/scraper_status.json");

// In-memory state tracking
let scraperState = {
  isRunning: false,
  lastRunTime: null,
  lastDurationMs: 0,
  lastStatus: "idle",
  lastError: null,
  totalRuns: 0,
  totalUrlsConfigured: 0,
  lastScrapedCount: 0,
  recentLogs: [],
};

// Load saved status if exists
try {
  if (fs.existsSync(STATUS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(STATUS_FILE, "utf-8"));
    scraperState = { ...scraperState, ...saved, isRunning: false };
  }
} catch (_) {}

function saveStatus() {
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(scraperState, null, 2), "utf-8");
  } catch (err) {
    console.warn("⚠️ [SCRAPER CRON] Could not persist status file:", err.message);
  }
}

/**
 * Execute the automated URL scraper script
 * @returns {Promise<Object>} Execution result
 */
export function runScraperJob() {
  if (scraperState.isRunning) {
    return Promise.resolve({
      status: "already_running",
      message: "Scraper job is already in progress.",
      state: scraperState,
    });
  }

  return new Promise((resolve) => {
    scraperState.isRunning = true;
    scraperState.lastStatus = "running";
    scraperState.lastError = null;
    scraperState.recentLogs = [];
    const startTime = Date.now();

    // Count URLs in url.json
    try {
      if (fs.existsSync(URL_JSON_PATH)) {
        const urlData = JSON.parse(fs.readFileSync(URL_JSON_PATH, "utf-8"));
        scraperState.totalUrlsConfigured = Array.isArray(urlData) ? urlData.length : 0;
      }
    } catch (_) {}

    console.log(`🕷️ [SCRAPER CRON] Launching wiki_scraper_ingest.py (${scraperState.totalUrlsConfigured} URLs)...`);

    const pythonProcess = spawn("python", [SCRIPT_PATH], {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    pythonProcess.stdout.on("data", (data) => {
      const line = data.toString().trim();
      if (line) {
        scraperState.recentLogs.push(line);
        if (scraperState.recentLogs.length > 50) scraperState.recentLogs.shift();
        console.log(`[SCRAPER] ${line}`);
      }
    });

    pythonProcess.stderr.on("data", (data) => {
      const line = data.toString().trim();
      if (line) {
        scraperState.recentLogs.push(`[ERR] ${line}`);
        if (scraperState.recentLogs.length > 50) scraperState.recentLogs.shift();
        console.warn(`[SCRAPER WARN] ${line}`);
      }
    });

    pythonProcess.on("close", (code) => {
      const duration = Date.now() - startTime;
      scraperState.isRunning = false;
      scraperState.lastRunTime = new Date().toISOString();
      scraperState.lastDurationMs = duration;
      scraperState.totalRuns += 1;

      if (code === 0) {
        scraperState.lastStatus = "success";
        console.log(`✅ [SCRAPER CRON] Completed successfully in ${(duration / 1000).toFixed(1)}s.`);
      } else {
        scraperState.lastStatus = "failed";
        scraperState.lastError = `Process exited with error code ${code}`;
        console.warn(`⚠️ [SCRAPER CRON] Job finished with code ${code} in ${(duration / 1000).toFixed(1)}s.`);
      }

      saveStatus();
      resolve({
        status: scraperState.lastStatus,
        durationMs: duration,
        exitCode: code,
        state: scraperState,
      });
    });

    pythonProcess.on("error", (err) => {
      scraperState.isRunning = false;
      scraperState.lastStatus = "error";
      scraperState.lastError = err.message;
      scraperState.lastRunTime = new Date().toISOString();
      console.error("❌ [SCRAPER CRON] Failed to start python process:", err.message);
      saveStatus();
      resolve({
        status: "error",
        error: err.message,
        state: scraperState,
      });
    });
  });
}

/**
 * Start the recurring background scraper cron schedule (Runs every 12 hours)
 */
let cronIntervalId = null;

export function startScraperCron(intervalHours = 12) {
  if (cronIntervalId) {
    clearInterval(cronIntervalId);
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;
  console.log(`⏰ [SCRAPER CRON] Initialized background schedule: runs every ${intervalHours}h (${intervalMs}ms).`);

  cronIntervalId = setInterval(() => {
    console.log(`⏰ [SCRAPER CRON] Triggering scheduled scraping cycle (${new Date().toISOString()})...`);
    runScraperJob().catch((err) => console.error("⚠️ [SCRAPER CRON] Scheduled cycle error:", err));
  }, intervalMs);

  return { active: true, intervalHours };
}

/**
 * Stop background scraper cron
 */
export function stopScraperCron() {
  if (cronIntervalId) {
    clearInterval(cronIntervalId);
    cronIntervalId = null;
    console.log("⏹️ [SCRAPER CRON] Background schedule stopped.");
  }
}

/**
 * Get current scraper status and telemetry
 */
export function getScraperStatus() {
  // Update configured URL count
  try {
    if (fs.existsSync(URL_JSON_PATH)) {
      const urlData = JSON.parse(fs.readFileSync(URL_JSON_PATH, "utf-8"));
      scraperState.totalUrlsConfigured = Array.isArray(urlData) ? urlData.length : 0;
    }
  } catch (_) {}

  return {
    ...scraperState,
    scriptPath: SCRIPT_PATH,
    urlJsonPath: URL_JSON_PATH,
  };
}

export default {
  runScraperJob,
  startScraperCron,
  stopScraperCron,
  getScraperStatus,
};
