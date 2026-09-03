import mongoose from "mongoose";

/**
 * Global cache across Vercel serverless function invocations.
 * In serverless environments, container reuse allows caching the Mongoose
 * connection promise, preventing new connections on every HTTP request
 * and avoiding hitting the MongoDB Atlas free tier connection limit (500 connections).
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  let mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    if (process.env.VERCEL) {
      throw new Error(
        "MONGODB_URI environment variable is missing on Vercel! Please add MONGODB_URI in Vercel Project Settings -> Environment Variables."
      );
    }
    mongoURI = "mongodb://localhost:27017/chatly_db";
  }

  // If MongoDB Atlas connection string is used without a DB name, default to /chatly_db
  if (mongoURI.startsWith("mongodb+srv://") && !mongoURI.match(/\.mongodb\.net\/[a-zA-Z0-9_-]+/)) {
    mongoURI = mongoURI.replace(/\.mongodb\.net\/(\?|$)/, ".mongodb.net/chatly_db$1");
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: true,
      maxPoolSize: 10, // Optimized for serverless free tier
      serverSelectionTimeoutMS: 5000,
    };

    cached.promise = mongoose.connect(mongoURI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (e) {
    cached.promise = null;
    console.error("MongoDB connection failure:", e.message || e);
    throw e;
  }
}

export default connectDB;
