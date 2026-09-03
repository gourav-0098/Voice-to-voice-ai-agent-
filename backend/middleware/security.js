import rateLimit from "express-rate-limit";

// Layer-7 DDoS Protection: Global IP Rate Limiter
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests from this IP address. Please try again later.",
  },
});

// Brute-force & Credential Stuffing Shield: Auth Rate Limiter
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 login/signup attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts. Please try again after 15 minutes.",
  },
});

// Voice Endpoint Flood Protection
export const voiceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Max 60 voice calls per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Voice request frequency limit exceeded. Please slow down.",
  },
});

// NoSQL Injection & MongoDB Operator Sanitizer
export const sanitizeInput = (req, res, next) => {
  const clean = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      if (key.startsWith("$") || key.includes(".")) {
        delete obj[key]; // Strip dangerous MongoDB operators like $gt, $ne, $where
      } else if (typeof obj[key] === "object") {
        clean(obj[key]);
      }
    }
  };

  clean(req.body);
  clean(req.query);
  clean(req.params);
  next();
};
