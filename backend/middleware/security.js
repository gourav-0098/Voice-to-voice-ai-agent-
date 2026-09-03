// Zero-dependency Native Rate Limiters & Sanitizer for Vercel Serverless & Node
const ipMap = new Map();

// Periodic cleanup to avoid memory leak
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of ipMap.entries()) {
      if (now > record.resetTime) {
        ipMap.delete(key);
      }
    }
  }, 10 * 60 * 1000).unref?.();
}

// Global rate limiter (250 req / 15 min)
export const globalLimiter = (req, res, next) => {
  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "client_ip").toString().split(",")[0].trim();
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const record = ipMap.get(ip) || { count: 0, resetTime: now + windowMs };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count++;
  }
  ipMap.set(ip, record);

  if (record.count > 250) {
    return res.status(429).json({ error: "Too many requests from this IP address. Please try again later." });
  }
  next();
};

// Auth rate limiter (25 attempts / 15 min)
export const authLimiter = (req, res, next) => {
  const ip = ((req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "client_ip").toString().split(",")[0].trim()) + "_auth";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const record = ipMap.get(ip) || { count: 0, resetTime: now + windowMs };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count++;
  }
  ipMap.set(ip, record);

  if (record.count > 25) {
    return res.status(429).json({ error: "Too many authentication attempts. Please try again after 15 minutes." });
  }
  next();
};

// Voice call rate limiter (80 calls / 15 min)
export const voiceLimiter = (req, res, next) => {
  const ip = ((req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "client_ip").toString().split(",")[0].trim()) + "_voice";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const record = ipMap.get(ip) || { count: 0, resetTime: now + windowMs };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count++;
  }
  ipMap.set(ip, record);

  if (record.count > 80) {
    return res.status(429).json({ error: "Voice request frequency limit exceeded. Please slow down." });
  }
  next();
};

// NoSQL Injection & MongoDB Operator Sanitizer
export const sanitizeInput = (req, res, next) => {
  const clean = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      if (key.startsWith("$") || key.includes(".")) {
        delete obj[key];
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
