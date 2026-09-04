import mongoose from "mongoose";

/**
 * Global cache across Vercel serverless function invocations.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  let mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    if (process.env.VERCEL) {
      console.error("❌ [DB CHECKPOINT ERROR] MONGODB_URI environment variable is missing on Vercel!");
      throw new Error(
        "MONGODB_URI environment variable is missing on Vercel! Please add MONGODB_URI in Vercel Project Settings -> Environment Variables."
      );
    }
    console.log("ℹ️  [DB CHECKPOINT] Local mode: Using default localhost MongoDB URI");
    mongoURI = "mongodb://localhost:27017/chatly_db";
  }

  // If MongoDB Atlas connection string is used without a DB name, default to /chatly_db
  if (mongoURI.startsWith("mongodb+srv://") && !mongoURI.match(/\.mongodb\.net\/[a-zA-Z0-9_-]+/)) {
    mongoURI = mongoURI.replace(/\.mongodb\.net\/(\?|$)/, ".mongodb.net/chatly_db$1");
  }

  const maskedURI = mongoURI.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
  console.log(`🔌 [DB CHECKPOINT] Connecting to: ${maskedURI}`);

  if (cached.conn) {
    console.log("⚡ [DB CHECKPOINT] Reusing cached Mongoose connection pool");
    return cached.conn;
  }

  if (!cached.promise) {
    console.log("⏳ [DB CHECKPOINT] Creating new Mongoose connection promise...");
    const opts = {
      bufferCommands: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    };

    cached.promise = mongoose.connect(mongoURI, opts).then((mongooseInstance) => {
      console.log("✅ [DB CHECKPOINT] MongoDB connection established successfully!");
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (e) {
    cached.promise = null;
    console.error("❌ [DB CHECKPOINT ERROR] MongoDB connection failure:", e.message || e);
    throw e;
  }
}

export default connectDB;
