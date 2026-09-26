import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_SCRIPT = path.join(__dirname, "embedder_daemon.py");
const HEALTH_URL = "http://127.0.0.1:5005/health";

let daemonProcess = null;

async function isDaemonHealthy() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600);
    const res = await fetch(HEALTH_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      return data.status === "ok";
    }
  } catch (_) {}
  return false;
}

/**
 * Ensures the fast all-MiniLM-L6-v2 embedder daemon is running on port 5005.
 * Automatically spawns it if not running and attaches exit hooks for graceful cleanup.
 */
export async function ensureEmbedderDaemon() {
  // If already running inside Vercel serverless, skip background daemon
  if (process.env.VERCEL) {
    return { running: false, mode: "serverless" };
  }

  const healthy = await isDaemonHealthy();
  if (healthy) {
    console.log("⚡ [EMBEDDER DAEMON] Fast vector daemon is already active on http://127.0.0.1:5005 (8ms latency)");
    return { running: true, spawned: false };
  }

  console.log("🚀 [EMBEDDER DAEMON] Spawning background Python embedder daemon (embedder_daemon.py)...");

  try {
    daemonProcess = spawn("python", [DAEMON_SCRIPT], {
      windowsHide: true,
      stdio: "ignore",
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    daemonProcess.on("error", (err) => {
      console.warn("⚠️ [EMBEDDER DAEMON] Could not spawn Python daemon:", err.message);
    });

    daemonProcess.on("exit", (code) => {
      console.log(`⏹️ [EMBEDDER DAEMON] Python daemon exited with code ${code}`);
      daemonProcess = null;
    });

    // Wait up to 6s for daemon to become healthy
    const startWait = Date.now();
    while (Date.now() - startWait < 6000) {
      await new Promise((r) => setTimeout(r, 400));
      if (await isDaemonHealthy()) {
        console.log(`✅ [EMBEDDER DAEMON] Python embedder online & ready in ${Date.now() - startWait}ms!`);
        break;
      }
    }

    // Register exit handlers to kill daemon when Node process exits
    const cleanup = () => {
      if (daemonProcess) {
        console.log("🧹 [EMBEDDER DAEMON] Cleaning up Python daemon on process exit...");
        try {
          daemonProcess.kill();
        } catch (_) {}
        daemonProcess = null;
      }
    };

    process.on("exit", cleanup);
    process.on("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });

    return { running: true, spawned: true };
  } catch (err) {
    console.warn("⚠️ [EMBEDDER DAEMON] Failed to start embedder daemon:", err.message);
    return { running: false, error: err.message };
  }
}

export default {
  ensureEmbedderDaemon,
  isDaemonHealthy,
};
