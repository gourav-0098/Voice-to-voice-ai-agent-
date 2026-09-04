console.log("🔍 [INIT] Starting root serverless function handler (api/index.js)...");
console.log("📋 [INIT] Environment:", {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
  hasMongoUri: !!process.env.MONGODB_URI,
  hasGeminiKey: !!process.env.GEMINI_API_KEY,
  hasJwtSecret: !!process.env.JWT_SECRET,
});

let appHandler;
try {
  console.log("⏳ [INIT] Importing backend/index.js...");
  const backend = await import("../backend/index.js");
  appHandler = backend.default;
  console.log("✅ [INIT] backend/index.js imported successfully!");
} catch (error) {
  console.error("❌ [CRITICAL ERROR] Failed to load backend/index.js:", error);
  appHandler = (req, res) => {
    res.status(500).json({
      status: "error",
      message: "Serverless function initialization failure in backend/index.js",
      error: error.message,
      stack: error.stack,
      nodeVersion: process.version,
      envCheck: {
        hasMongoUri: !!process.env.MONGODB_URI,
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        hasJwtSecret: !!process.env.JWT_SECRET,
        hasDeepgramKey: !!process.env.DEEPGRAM_API_KEY,
        hasQdrantKey: !!process.env.QDRANT_API_KEY,
        isVercel: !!process.env.VERCEL,
      },
    });
  };
}

export default function handler(req, res) {
  console.log(`📡 [ROOT-API] ${req.method} ${req.url} - Origin: ${req.headers.origin || "Direct Browser"}`);
  return appHandler(req, res);
}
