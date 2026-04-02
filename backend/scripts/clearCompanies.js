/* eslint-disable no-console */
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "../../.env") });

// Ensure model is registered
require("../models/companyModel");

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in .env");

  await mongoose.connect(uri);
  console.log("Connected");

  const Company = mongoose.model("Company");
  const count = await Company.countDocuments({});
  console.log(`Current companies: ${count}`);

  const res = await Company.deleteMany({});
  console.log(`Deleted companies: ${res.deletedCount}`);

  await mongoose.disconnect();
  console.log("Done");
}

run().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
