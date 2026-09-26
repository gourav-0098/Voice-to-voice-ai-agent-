import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Checkpoint 0: Entry point log
console.log("📍 [CHECKPOINT 0] Initializing Express app in backend/index.js...");

// Internal modules
import connectDB from "./config/db.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import voiceRouter from "./routes/voice.js";
import {
  globalLimiter,
  authLimiter,
  sanitizeInput,
} from "./middleware/security.js";

// Load environment variables (for local dev)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

console.log("📍 [CHECKPOINT 1] Config loaded. Port:", process.env.PORT || 5000, "Vercel mode:", !!process.env.VERCEL);

const app = express();

// Request logging middleware (logs every single incoming request)
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`➡️  [HTTP ${req.method}] ${req.url} - IP: ${req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown"}`);
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`⬅️  [HTTP ${req.method}] ${req.url} -> Status: ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// 1. Database Connection Middleware (Safe for both Vercel Serverless and Local Dev)
app.use(async (req, res, next) => {
  try {
    console.log(`📍 [CHECKPOINT DB] Checking database connection for ${req.method} ${req.url}...`);
    await connectDB();
    console.log(`✅ [CHECKPOINT DB] Database connected successfully!`);
  } catch (err) {
    console.error(`❌ [CHECKPOINT DB ERROR] Database connection notice:`, err.message);
  }
  next();
});

// 2. Native Security Headers
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// 3. CORS Configuration
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://voice-to-voice-ai-agent-eta.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      console.log(`📍 [CHECKPOINT CORS] Request Origin: ${origin || "Same-Origin / Direct"}`);
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);

// 4. Payload size limits & Anti-DDoS
app.use(express.json({ limit: "15kb" }));
app.use(express.urlencoded({ extended: true, limit: "15kb" }));
app.use(globalLimiter);
app.use(sanitizeInput);

// 5. Modular API Routes
console.log("📍 [CHECKPOINT 2] Mounting API routes (/api/auth, /api/admin, /api/voice)...");
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/voice", voiceRouter);

// Favicon handler
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Health check endpoint (Instantly responds 200 OK on Vercel)
app.get("/", (req, res) => {
  console.log("📍 [CHECKPOINT HEALTH] Health check route '/' reached!");
  res.json({
    status: "online",
    service: "Chatly Voice AI Backend",
    environment: process.env.NODE_ENV || (process.env.VERCEL ? "production (vercel)" : "development"),
    timestamp: new Date().toISOString(),
    diagnostics: {
      hasMongoUri: !!process.env.MONGODB_URI,
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasDeepgramKey: !!process.env.DEEPGRAM_API_KEY,
      hasQdrantKey: !!process.env.QDRANT_API_KEY,
    },
  });
});

// 404 Handler
app.use((req, res) => {
  console.warn(`⚠️ [CHECKPOINT 404] Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: `Endpoint ${req.url} not found` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(`💥 [CHECKPOINT 500 CRITICAL ERROR]:`, err.message || err);
  console.error(err.stack);
  res.status(500).json({
    error: "Internal server error",
    details: err.message,
    timestamp: new Date().toISOString(),
  });
});

// 6. Server Initialization & WebSocket Attachment
const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
  import("http").then(({ default: http }) => {
    import("./services/voiceWebSocketService.js").then(({ setupVoiceWebSocket }) => {
      import("./services/scraperCronService.js").then(({ startScraperCron }) => {
        const server = http.createServer(app);
        setupVoiceWebSocket(server);

        server.listen(PORT, () => {
          console.log(`🚀 [CHECKPOINT SERVER] Chatly Backend running on port ${PORT}`);
          console.log(`⚡ [WEBSOCKET] Real-Time Voice WebSocket active on ws://localhost:${PORT}/ws/voice`);
          // Start automated scraper cron (every 12 hours)
          startScraperCron(12);

          // Automate Embedder Daemon Lifecycle (starts Python daemon on port 5005 & cleans up on exit)
          import("./services/embedderLifecycle.js").then(({ ensureEmbedderDaemon }) => {
            ensureEmbedderDaemon().catch((e) => console.warn("⚠️ Embedder daemon startup notice:", e.message));
          });
        });
      });
    });
  });
} else {
  console.log("☁️ [CHECKPOINT SERVER] Vercel Serverless environment detected. Exporting app handler.");
}

// Export default app for Vercel Serverless Function runtime
export default app;

