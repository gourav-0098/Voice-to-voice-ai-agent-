import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import connectDB from "../config/db.js";
import User from "../models/User.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

async function createAdmin() {
  const args = process.argv.slice(2);
  const name = args[0] || "System Admin";
  const email = (args[1] || "admin@chatly.ai").toLowerCase();
  const password = args[2] || "Admin123456";

  console.log(`Connecting to MongoDB to create/update admin user: ${email}...`);
  await connectDB();

  let user = await User.findOne({ email });

  if (user) {
    user.name = name;
    user.role = "admin";
    user.password = password;
    await user.save();
    console.log(`✅ Existing user updated to ADMIN role successfully!`);
  } else {
    user = await User.create({
      name,
      email,
      password,
      role: "admin",
    });
    console.log(`✅ New ADMIN user created successfully!`);
  }

  console.log(`========================================`);
  console.log(`👑 ADMIN CREDENTIALS:`);
  console.log(`   Name:     ${user.name}`);
  console.log(`   Email:    ${user.email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Role:     ${user.role}`);
  console.log(`========================================`);

  process.exit(0);
}

createAdmin().catch((err) => {
  console.error("Error creating admin user:", err.message);
  process.exit(1);
});
