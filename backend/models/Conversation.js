import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "model"],
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    toolUsed: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    messages: [messageSchema],
    lastActive: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Get recent dialogue turns formatted for Gemini multi-turn conversation
conversationSchema.statics.getRecentTurns = async function (userId, limit = 6) {
  try {
    const convo = await this.findOne({ userId });
    if (!convo || !convo.messages || convo.messages.length === 0) {
      return [];
    }

    // Return the latest `limit` messages
    const recent = convo.messages.slice(-limit);

    // Format for multi-provider compatibility (Groq, Gemini SDK, OpenAI)
    return recent.map((m) => ({
      role: m.role,
      sender: m.role === "user" ? "user" : "ai",
      text: m.text,
      parts: [{ text: m.text }],
    }));
  } catch (err) {
    console.warn("Failed to retrieve conversation history:", err.message);
    return [];
  }
};

// Append an exchange (user input + AI response)
conversationSchema.statics.appendTurn = async function (userId, userText, modelReply, toolUsed = null) {
  try {
    const now = new Date();
    const newMessages = [
      { role: "user", text: userText, timestamp: now },
      { role: "model", text: modelReply, timestamp: now, toolUsed: toolUsed || null },
    ];

    // Keep at most 30 recent turns per user to stay optimal
    await this.findOneAndUpdate(
      { userId },
      {
        $push: {
          messages: {
            $each: newMessages,
            $slice: -30, // keep only the last 30 messages
          },
        },
        $set: { lastActive: now },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn("Failed to append conversation turn:", err.message);
  }
};

// Clear conversation history for a fresh topic
conversationSchema.statics.clearHistory = async function (userId) {
  try {
    await this.findOneAndUpdate(
      { userId },
      { $set: { messages: [], lastActive: new Date() } }
    );
    return true;
  } catch (err) {
    console.warn("Failed to clear history:", err.message);
    return false;
  }
};

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
