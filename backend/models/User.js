import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const ADMIN_EMAILS = ["r19216871@gamil.com", "r19216871@gmail.com"];

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
  if (ADMIN_EMAILS.includes(this.email?.toLowerCase())) {
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

// Check and record voice call (Rate limits: 5/hour, 10/day, Admin unlimited)
userSchema.methods.checkAndRecordVoiceCall = async function () {
  const isAdmin =
    this.role === "admin" ||
    ADMIN_EMAILS.includes(this.email?.toLowerCase());

  if (isAdmin) {
    // Record call for analytics, but bypass all rate limits!
    this.voiceCalls.push(new Date());
    await this.save();
    return {
      allowed: true,
      isAdmin: true,
      remainingHourly: "Unlimited",
      remainingDaily: "Unlimited",
    };
  }

  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

  // Prune calls older than 24 hours to keep document compact
  this.voiceCalls = (this.voiceCalls || []).filter((callDate) => callDate > oneDayAgo);

  const callsLastHour = this.voiceCalls.filter((callDate) => callDate > oneHourAgo);
  const callsLastDay = this.voiceCalls;

  // 1. Check Hourly Limit (Max 5 per hour)
  if (callsLastHour.length >= 5) {
    const oldestInHour = callsLastHour[0];
    const resetTimeMs = oldestInHour.getTime() + 60 * 60 * 1000;
    const waitMinutes = Math.max(1, Math.ceil((resetTimeMs - now) / 60000));

    return {
      allowed: false,
      error: `Hourly limit reached (5 calls/hour). Please wait ${waitMinutes} minute(s) before trying again.`,
      waitMinutes,
      remainingHourly: 0,
      remainingDaily: Math.max(0, 10 - callsLastDay.length),
    };
  }

  // 2. Check Daily Limit (Max 10 per day)
  if (callsLastDay.length >= 10) {
    const oldestInDay = callsLastDay[0];
    const resetTimeMs = oldestInDay.getTime() + 24 * 60 * 60 * 1000;
    const waitHours = Math.max(1, Math.ceil((resetTimeMs - now) / 3600000));

    return {
      allowed: false,
      error: `Daily limit reached (10 calls/day). Quota resets in approximately ${waitHours} hour(s).`,
      waitHours,
      remainingHourly: Math.max(0, 5 - callsLastHour.length),
      remainingDaily: 0,
    };
  }

  // Record this voice call
  this.voiceCalls.push(new Date());
  await this.save();

  return {
    allowed: true,
    isAdmin: false,
    remainingHourly: 5 - callsLastHour.length - 1,
    remainingDaily: 10 - callsLastDay.length - 1,
    totalHourly: 5,
    totalDaily: 10,
  };
};

// Quota summary for UI display
userSchema.methods.getQuotaSummary = function () {
  const isAdmin =
    this.role === "admin" ||
    ADMIN_EMAILS.includes(this.email?.toLowerCase());

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
  const callsLastDay = activeCalls.length;

  return {
    isAdmin: false,
    remainingHourly: Math.max(0, 5 - callsLastHour),
    remainingDaily: Math.max(0, 10 - callsLastDay),
    totalHourly: 5,
    totalDaily: 10,
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
