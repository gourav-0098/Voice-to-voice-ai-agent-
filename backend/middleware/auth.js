import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Access denied. No authentication token provided." });
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "Authentication system configuration error." });
    }

    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: "User session invalid or expired." });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Authentication token has expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid authentication token." });
  }
};

export const optionalVerifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.user = null;
      return next();
    }
    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      req.user = null;
      return next();
    }
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
    const user = await User.findById(decoded.id);
    req.user = user || null;
    next();
  } catch (_) {
    req.user = null;
    next();
  }
};
