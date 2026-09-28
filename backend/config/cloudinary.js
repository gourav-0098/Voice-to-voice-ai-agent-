import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "zuh4mnf3";
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

console.log(`📍 [CLOUDINARY CONFIG] Cloudinary initialized for cloud_name: ${cloudName}, api_key configured: ${!!apiKey}`);

/**
 * Upload an avatar image (base64 data URL or remote URL) to Cloudinary
 * @param {string} imageInput - Base64 data URL or URL
 * @param {string} userId - User ID for deterministic public_id
 * @returns {Promise<string>} - Secure Cloudinary HTTPS URL
 */
export async function uploadAvatarToCloudinary(imageInput, userId) {
  if (!imageInput || typeof imageInput !== "string") return "";

  // If already a hosted Cloudinary URL, don't re-upload
  if (imageInput.startsWith("http://") || imageInput.startsWith("https://")) {
    if (imageInput.includes("res.cloudinary.com")) {
      return imageInput;
    }
  }

  // If not a data URL or valid image format, return as is
  if (!imageInput.startsWith("data:image/")) {
    return imageInput;
  }

  try {
    console.log(`📍 [CLOUDINARY] Uploading avatar for user: ${userId}...`);
    const result = await cloudinary.uploader.upload(imageInput, {
      folder: "chatly/avatars",
      public_id: `user_${userId}_avatar`,
      overwrite: true,
      resource_type: "image",
      transformation: [
        { width: 400, height: 400, crop: "fill", gravity: "face" },
        { quality: "auto" },
        { fetch_format: "auto" },
      ],
    });

    console.log(`✅ [CLOUDINARY] Avatar uploaded successfully! URL: ${result.secure_url}`);
    return result.secure_url;
  } catch (error) {
    console.error("❌ [CLOUDINARY ERROR] Upload failed:", error.message || error);
    // If Cloudinary upload fails, fallback to keeping existing or passing the dataUrl safely
    throw new Error(`Failed to upload image to Cloudinary: ${error.message || "Unknown error"}`);
  }
}

export default cloudinary;
