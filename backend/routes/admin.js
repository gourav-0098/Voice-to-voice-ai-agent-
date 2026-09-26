import express from "express";
import User from "../models/User.js";
import { verifyToken } from "../middleware/auth.js";
import { adminOnly } from "../middleware/adminOnly.js";
import { QdrantClient } from "@qdrant/js-client-rest";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const router = express.Router();

// Apply auth + adminOnly to all routes in this router
router.use(verifyToken, adminOnly);

const qdrantUrl =
  process.env.QDRANT_URL ||
  process.env.cluster_endpoint ||
  "https://a2528ffa-9391-47df-ae3c-e4a0ad004f76.eu-central-1-0.aws.cloud.qdrant.io";

const qdrantApiKey =
  process.env.QDRANT_API_KEY ||
  process.env.Qdrant_api;

let qdrantClient = null;
try {
  if (qdrantUrl && qdrantApiKey) {
    qdrantClient = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey,
      checkCompatibility: false,
    });
  }
} catch (_) {}

// =========================================================
// GET /api/admin/stats - Platform Metrics & Overview
// =========================================================
router.get("/stats", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const allUsers = await User.find({}, "voiceCalls createdAt role");

    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now - 60 * 60 * 1000);

    let callsToday = 0;
    let callsThisHour = 0;
    let allTimeCalls = 0;

    for (const u of allUsers) {
      const calls = u.voiceCalls || [];
      allTimeCalls += calls.length;
      callsToday += calls.filter((c) => c > oneDayAgo).length;
      callsThisHour += calls.filter((c) => c > oneHourAgo).length;
    }

    // Get Qdrant stats
    let qdrantPoints = 0;
    let qdrantStatus = "offline";
    if (qdrantClient) {
      try {
        const info = await qdrantClient.getCollection("first_cluster");
        qdrantPoints = info.points_count || 0;
        qdrantStatus = info.status || "green";
      } catch (err) {
        qdrantStatus = "connected";
      }
    }

    return res.json({
      status: "success",
      metrics: {
        totalUsers,
        callsToday,
        callsThisHour,
        allTimeCalls,
        qdrantPoints,
        qdrantStatus,
        qdrantCollection: "first_cluster",
        activeAdmins: allUsers.filter((u) => u.role === "admin").length,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return res.status(500).json({ error: "Failed to load administrative stats." });
  }
});

// =========================================================
// GET /api/admin/users - List all registered users
// =========================================================
router.get("/users", async (req, res) => {
  try {
    const users = await User.find({}, "name email role voiceCalls createdAt").sort({ createdAt: -1 });

    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now - 60 * 60 * 1000);

    const userList = users.map((u) => {
      const activeCalls = (u.voiceCalls || []).filter((c) => c > oneDayAgo);
      const callsLastHour = activeCalls.filter((c) => c > oneHourAgo).length;
      const callsLastDay = activeCalls.length;

      return {
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        callsLastHour,
        callsLastDay,
        remainingHourly: u.role === "admin" ? "Unlimited" : Math.max(0, 5 - callsLastHour),
        remainingDaily: u.role === "admin" ? "Unlimited" : Math.max(0, 10 - callsLastDay),
      };
    });

    return res.json({
      status: "success",
      count: userList.length,
      users: userList,
    });
  } catch (error) {
    console.error("Admin users fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch users list." });
  }
});

// =========================================================
// POST /api/admin/users/:id/reset-quota - Reset a user's quota
// =========================================================
router.post("/users/:id/reset-quota", async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found." });
    }

    targetUser.voiceCalls = [];
    await targetUser.save();

    return res.json({
      status: "success",
      message: `Quota successfully reset for ${targetUser.name}!`,
      user: {
        id: targetUser._id,
        email: targetUser.email,
        remainingHourly: 5,
        remainingDaily: 10,
      },
    });
  } catch (error) {
    console.error("Admin reset quota error:", error);
    return res.status(500).json({ error: "Failed to reset user quota." });
  }
});

// =========================================================
// POST /api/admin/users/:id/toggle-role - Promote/Demote user
// =========================================================
router.post("/users/:id/toggle-role", async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found." });
    }

    // Do not allow demoting primary root admin
    if (targetUser.email?.toLowerCase() === "r19216871@gamil.com") {
      return res.status(400).json({ error: "Primary system admin account cannot be demoted." });
    }

    const newRole = targetUser.role === "admin" ? "user" : "admin";
    targetUser.role = newRole;
    await targetUser.save();

    return res.json({
      status: "success",
      message: `User role updated to ${newRole}!`,
      role: newRole,
    });
  } catch (error) {
    console.error("Admin role toggle error:", error);
    return res.status(500).json({ error: "Failed to update role." });
  }
});

// =========================================================
// GET /api/admin/scraper/status - Automated URL Scraper Telemetry
// =========================================================
router.get("/scraper/status", async (req, res) => {
  try {
    const { getScraperStatus } = await import("../services/scraperCronService.js");
    const status = getScraperStatus();
    return res.json({ status: "success", scraper: status });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch scraper status.", details: err.message });
  }
});

// =========================================================
// POST /api/admin/scraper/trigger - Manually execute scraper job
// =========================================================
router.post("/scraper/trigger", async (req, res) => {
  try {
    const { runScraperJob, getScraperStatus } = await import("../services/scraperCronService.js");
    const current = getScraperStatus();
    if (current.isRunning) {
      return res.status(409).json({ error: "Scraper job is already running.", scraper: current });
    }

    // Trigger asynchronously without blocking HTTP response
    runScraperJob().catch((err) => console.error("⚠️ Manual scraper trigger error:", err));

    return res.json({
      status: "success",
      message: "Automated scraper background job initiated across 105 URLs.",
      scraper: { ...current, isRunning: true, lastStatus: "running" },
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to trigger scraper job.", details: err.message });
  }
});

// =========================================================
// GET /api/admin/llm-config - Fetch LLM Engine Configuration
// =========================================================
router.get("/llm-config", async (req, res) => {
  try {
    const { systemSettingsService } = await import("../services/systemSettingsService.js");
    return res.json({
      status: "success",
      config: systemSettingsService.getConfig(),
    });
  } catch (err) {
    console.error("Admin llm-config get error:", err);
    return res.status(500).json({ error: "Failed to fetch LLM configuration.", details: err.message });
  }
});

// =========================================================
// POST /api/admin/llm-config - Update Primary LLM Engine
// =========================================================
router.post("/llm-config", async (req, res) => {
  try {
    const { primaryModel } = req.body || {};
    if (!primaryModel || !["gemini", "groq"].includes(primaryModel)) {
      return res.status(400).json({ error: "Invalid primaryModel. Allowed values: 'gemini', 'groq'." });
    }

    const { systemSettingsService } = await import("../services/systemSettingsService.js");
    const updated = await systemSettingsService.setPrimaryModel(primaryModel, req.user?._id);

    return res.json({
      status: "success",
      message: `Primary LLM Engine switched to ${primaryModel.toUpperCase()} successfully!`,
      config: updated,
    });
  } catch (err) {
    console.error("Admin llm-config update error:", err);
    return res.status(500).json({ error: "Failed to update LLM configuration.", details: err.message });
  }
});

export default router;

