import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const getAdminEmails = () => (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
      select: false, // Do not return password by default in queries
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    avatar: {
      type: String,
      default: "",
    },
    dob: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      maxlength: [500, "Bio cannot exceed 500 characters"],
      default: "",
    },
    gender: {
      type: String,
      enum: ["not_specified", "male", "female", "non_binary", "other", "prefer_not_to_say", ""],
      default: "not_specified",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    jobTitle: {
      type: String,
      trim: true,
      default: "",
    },
    preferredLanguage: {
      type: String,
      default: "auto",
    },
    voicePersonaPreference: {
      type: String,
      default: "friendly",
    },
    voiceCalls: [
      {
        type: Date,
        default: Date.now,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Auto-assign admin role for designated admin email
userSchema.pre("save", async function () {
  if (getAdminEmails().includes(this.email?.toLowerCase())) {
    this.role = "admin";
  }

  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Instance method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Check and record voice call (Rate limits: 30/hour, Unlimited daily, Admin unlimited)
userSchema.methods.checkAndRecordVoiceCall = async function () {
  const isAdmin =
    this.role === "admin" ||
    getAdminEmails().includes(this.email?.toLowerCase());

  if (isAdmin) {
    // Record call for analytics, but bypass all rate limits!
    this.voiceCalls.push(new Date());
    await this.save();
    return {
      allowed: true,
      isAdmin: true,
      remainingHourly: "Unlimited",
      remainingDaily: "Unlimited",
      totalHourly: "∞",
      totalDaily: "∞",
    };
  }

  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

  // Prune calls older than 24 hours to keep document compact
  this.voiceCalls = (this.voiceCalls || []).filter((callDate) => callDate > oneDayAgo);

  const callsLastHour = this.voiceCalls.filter((callDate) => callDate > oneHourAgo);

  // 1. Check Hourly Limit (Max 30 per hour for logged-in users)
  const MAX_HOURLY = 30;
  if (callsLastHour.length >= MAX_HOURLY) {
    const oldestInHour = callsLastHour[0];
    const resetTimeMs = oldestInHour.getTime() + 60 * 60 * 1000;
    const waitMinutes = Math.max(1, Math.ceil((resetTimeMs - now) / 60000));

    return {
      allowed: false,
      error: `Hourly limit reached (30 calls/hour). Please wait ${waitMinutes} minute(s) before trying again.`,
      waitMinutes,
      remainingHourly: 0,
      remainingDaily: "Unlimited",
      totalHourly: MAX_HOURLY,
      totalDaily: "∞",
    };
  }

  // 2. Daily Limit: None for logged-in users (Unlimited calls per day)

  // Record this voice call
  this.voiceCalls.push(new Date());
  await this.save();

  return {
    allowed: true,
    isAdmin: false,
    remainingHourly: Math.max(0, MAX_HOURLY - callsLastHour.length - 1),
    remainingDaily: "Unlimited",
    totalHourly: MAX_HOURLY,
    totalDaily: "∞",
  };
};

// Quota summary for UI display
userSchema.methods.getQuotaSummary = function () {
  const isAdmin =
    this.role === "admin" ||
    getAdminEmails().includes(this.email?.toLowerCase());

  if (isAdmin) {
    return {
      isAdmin: true,
      remainingHourly: "Unlimited",
      remainingDaily: "Unlimited",
      totalHourly: "∞",
      totalDaily: "∞",
    };
  }

  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

  const activeCalls = (this.voiceCalls || []).filter((callDate) => callDate > oneDayAgo);
  const callsLastHour = activeCalls.filter((callDate) => callDate > oneHourAgo).length;

  return {
    isAdmin: false,
    remainingHourly: Math.max(0, 30 - callsLastHour),
    remainingDaily: "Unlimited",
    totalHourly: 30,
    totalDaily: "∞",
  };
};

// Safe JSON serialization (never send password)
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.voiceCalls;
  return userObject;
};

const User = mongoose.model("User", userSchema);
export default User;
