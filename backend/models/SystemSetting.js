import mongoose from "mongoose";

const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

systemSettingSchema.statics.getSetting = async function (key, defaultValue = null) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return defaultValue;
    }
    const doc = await this.findOne({ key }).maxTimeMS(1200);
    return doc ? doc.value : defaultValue;
  } catch (err) {
    return defaultValue;
  }
};

systemSettingSchema.statics.setSetting = async function (key, value, description = "", userId = null) {
  try {
    return await this.findOneAndUpdate(
      { key },
      { key, value, description, updatedBy: userId, updatedAt: new Date() },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn(`SystemSetting set error for ${key}:`, err.message);
    return null;
  }
};

const SystemSetting = mongoose.models.SystemSetting || mongoose.model("SystemSetting", systemSettingSchema);
export default SystemSetting;
