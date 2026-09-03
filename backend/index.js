import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

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

const app = express();

// 1. Database Connection Middleware (Safe for both Vercel Serverless and Local Dev)
app.use(async (req, res, next) => {
  try {
    await connectDB();
  } catch (err) {
    console.error("Database connection notice:", err.message);
  }
  next();
});

// 2. Security & Performance Middleware
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false, // Prevents blocking cross-origin API calls on Vercel
  })
);
app.use(compression());

// 3. CORS Configuration
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://voice-to-voice-ai-agent-eta.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
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
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/voice", voiceRouter);

// Health check endpoint (Instantly responds 200 OK on Vercel)
app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "Chatly Voice AI Backend",
    environment: process.env.NODE_ENV || (process.env.VERCEL ? "production (vercel)" : "development"),
    timestamp: new Date().toISOString(),
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err.message || err);
  res.status(500).json({ error: "Internal server error" });
});

// 6. Server Initialization (Skip app.listen when running inside Vercel Serverless Functions)
const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Chatly Backend running on port ${PORT}`);
  });
}

// Export default app for Vercel Serverless Function runtime
export default app;
