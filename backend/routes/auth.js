import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { verifyToken } from "../middleware/auth.js";
import { uploadAvatarToCloudinary } from "../config/cloudinary.js";

const router = express.Router();

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Helper to generate JWT
const generateToken = (userId, email) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("FATAL: JWT_SECRET environment variable is missing.");
  }
  return jwt.sign({ id: userId, email }, secret, { expiresIn: "7d", algorithm: "HS256" });
};

// Format comprehensive user response
const formatUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatar: user.avatar || "",
  dob: user.dob || "",
  bio: user.bio || "",
  gender: user.gender || "not_specified",
  phone: user.phone || "",
  location: user.location || "",
  jobTitle: user.jobTitle || "",
  preferredLanguage: user.preferredLanguage || "auto",
  voicePersonaPreference: user.voicePersonaPreference || "friendly",
  quota: typeof user.getQuotaSummary === "function" ? user.getQuotaSummary() : undefined,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

// =========================================================
// POST /api/auth/signup
// =========================================================
router.post("/signup", async (req, res) => {
  console.log("📍 [AUTH CHECKPOINT] Incoming /signup request. Body keys:", Object.keys(req.body || {}));
  try {
    const { name, email, password } = req.body;

    // Validation & Length guards
    if (!name || typeof name !== "string" || !name.trim() || name.length > 80) {
      console.warn("⚠️ [AUTH CHECKPOINT] Signup validation failed: invalid name");
      return res.status(400).json({ error: "Please enter a valid name (1-80 characters)." });
    }
    if (!email || typeof email !== "string" || !email.trim() || email.length > 120) {
      console.warn("⚠️ [AUTH CHECKPOINT] Signup validation failed: invalid email");
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!password || typeof password !== "string" || password.length < 6 || password.length > 128) {
      console.warn("⚠️ [AUTH CHECKPOINT] Signup validation failed: password length requirement not met");
      return res.status(400).json({ error: "Password must be between 6 and 128 characters long." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      console.warn("⚠️ [AUTH CHECKPOINT] Signup validation failed: email regex mismatch:", normalizedEmail);
      return res.status(400).json({ error: "Invalid email address format." });
    }

    // Check if user already exists
    console.log(`📍 [AUTH CHECKPOINT] Checking if user ${normalizedEmail} exists...`);
    const existingUser = await User.findOne({ email: normalizedEmail }).lean();
    if (existingUser) {
      console.warn(`⚠️ [AUTH CHECKPOINT] User already exists: ${normalizedEmail}`);
      return res.status(400).json({ error: "An account with this email address already exists. Please log in." });
    }

    // Create user
    console.log(`📍 [AUTH CHECKPOINT] Creating user document for: ${normalizedEmail}...`);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
    });

    console.log(`✅ [AUTH CHECKPOINT] User created successfully! ID: ${user._id}, Role: ${user.role}`);

    // Generate JWT
    const token = generateToken(user._id, user.email);

    return res.status(201).json({
      status: "success",
      message: "Account created successfully!",
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error("❌ [AUTH CHECKPOINT ERROR] Signup exception:", error.message || error);
    return res.status(500).json({
      error: error.message || "Failed to create account. Please try again.",
    });
  }
});

// =========================================================
// POST /api/auth/login
// =========================================================
router.post("/login", async (req, res) => {
  console.log("📍 [AUTH CHECKPOINT] Incoming /login request. Email provided:", !!req.body?.email);
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof password !== "string" || password.length > 128) {
      console.warn("⚠️ [AUTH CHECKPOINT] Login validation failed: missing credentials");
      return res.status(400).json({ error: "Please provide both email and password." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log(`📍 [AUTH CHECKPOINT] Looking up user: ${normalizedEmail}...`);

    // Find user and explicitly include password field
    const user = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!user) {
      console.warn(`⚠️ [AUTH CHECKPOINT] Login failed: User not found: ${normalizedEmail}`);
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.warn(`⚠️ [AUTH CHECKPOINT] Login failed: Incorrect password for: ${normalizedEmail}`);
      return res.status(401).json({ error: "Invalid email or password." });
    }

    console.log(`✅ [AUTH CHECKPOINT] Login success for ${normalizedEmail} (Role: ${user.role})`);

    // Generate JWT
    const token = generateToken(user._id, user.email);

    return res.json({
      status: "success",
      message: "Logged in successfully!",
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error("❌ [AUTH CHECKPOINT ERROR] Login exception:", error.message || error);
    return res.status(500).json({
      error: error.message || "Login failed. Please try again.",
    });
  }
});

// =========================================================
// GET /api/auth/me (Protected Route)
// =========================================================
router.get("/me", verifyToken, async (req, res) => {
  console.log(`📍 [AUTH CHECKPOINT] /me verified for user ID: ${req.user?._id}, email: ${req.user?.email}`);
  try {
    return res.json({
      status: "success",
      user: formatUserResponse(req.user),
    });
  } catch (error) {
    console.error("❌ [AUTH CHECKPOINT ERROR] Profile fetch exception:", error.message || error);
    return res.status(500).json({ error: "Could not fetch user profile." });
  }
});

// =========================================================
// PUT /api/auth/profile (Update Profile Info, Avatar, DOB, Bio)
// =========================================================
router.put("/profile", verifyToken, async (req, res) => {
  console.log(`📍 [AUTH CHECKPOINT] Incoming /profile update for user ID: ${req.user?._id}`);
  try {
    const user = req.user;
    const {
      name,
      avatar,
      dob,
      bio,
      gender,
      phone,
      location,
      jobTitle,
      preferredLanguage,
      voicePersonaPreference,
    } = req.body;

    if (name !== undefined) {
      const trimmed = typeof name === "string" ? name.trim() : "";
      if (trimmed.length < 2 || trimmed.length > 50) {
        return res.status(400).json({ error: "Name must be between 2 and 50 characters." });
      }
      user.name = trimmed;
    }

    if (avatar !== undefined) {
      if (!avatar) {
        user.avatar = "";
      } else if (typeof avatar === "string") {
        if (avatar.startsWith("data:image/")) {
          console.log(`📍 [AUTH CHECKPOINT] Processing avatar for user ${user._id}...`);
          try {
            const cloudinaryUrl = await uploadAvatarToCloudinary(avatar, user._id.toString());
            user.avatar = cloudinaryUrl || avatar;
          } catch (uploadErr) {
            console.warn("⚠️ [AUTH CHECKPOINT] Cloudinary upload notice (fallback to direct):", uploadErr.message || uploadErr);
            user.avatar = avatar;
          }
        } else if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
          user.avatar = avatar;
        }
      }
    }

    if (dob !== undefined) {
      user.dob = typeof dob === "string" ? dob.trim() : "";
    }

    if (bio !== undefined) {
      user.bio = typeof bio === "string" ? bio.slice(0, 500) : "";
    }

    if (gender !== undefined) {
      const validGenders = ["not_specified", "male", "female", "non_binary", "other", "prefer_not_to_say", ""];
      user.gender = validGenders.includes(gender) ? gender : "not_specified";
    }

    if (phone !== undefined) {
      user.phone = typeof phone === "string" ? phone.trim().slice(0, 30) : "";
    }

    if (location !== undefined) {
      user.location = typeof location === "string" ? location.trim().slice(0, 100) : "";
    }

    if (jobTitle !== undefined) {
      user.jobTitle = typeof jobTitle === "string" ? jobTitle.trim().slice(0, 100) : "";
    }

    if (preferredLanguage !== undefined) {
      user.preferredLanguage = typeof preferredLanguage === "string" ? preferredLanguage : "auto";
    }

    if (voicePersonaPreference !== undefined) {
      user.voicePersonaPreference = typeof voicePersonaPreference === "string" ? voicePersonaPreference : "friendly";
    }

    await user.save();
    console.log(`✅ [AUTH CHECKPOINT] Profile updated successfully for user ID: ${user._id}`);

    return res.json({
      status: "success",
      message: "Profile updated successfully!",
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error("❌ [AUTH CHECKPOINT ERROR] Profile update exception:", error.message || error);
    return res.status(500).json({ error: error.message || "Failed to update profile." });
  }
});

export default router;
