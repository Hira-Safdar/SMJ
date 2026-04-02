/* eslint-disable no-console */
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "../../.env") });

// Ensure models are registered
require("../models/companyModel");
require("../models/systemSettingsModel");
require("../models/productTypeModel");

const normalizeText = (text) => (text ? text.toLowerCase().trim().replace(/\s+/g, " ") : "");
const toTitleCase = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in .env");

  await mongoose.connect(uri);
  console.log("Connected");

  const Company = mongoose.model("Company");
  const SystemSettings = mongoose.model("SystemSettings");
  const ProductType = mongoose.model("ProductType");

  const settings = await SystemSettings.findOne({}).lean();
  const brandOptions = Array.isArray(settings?.brandOptions) ? settings.brandOptions : [];
  const products = await ProductType.find({}).lean();
  const productBrands = products.map((p) => p?.brand).filter(Boolean);

  const merged = new Map();
  [...brandOptions, ...productBrands].forEach((name) => {
    const clean = toTitleCase(String(name || ""));
    const key = normalizeText(clean);
    if (clean && !merged.has(key)) merged.set(key, clean);
  });

  const names = Array.from(merged.values());
  if (!names.length) {
    console.log("No company names found in settings/product types.");
    await mongoose.disconnect();
    return;
  }

  const existing = await Company.find({}).lean();
  const existingMap = new Map(existing.map((c) => [normalizeText(c.name), c]));

  let created = 0;
  for (const name of names) {
    const key = normalizeText(name);
    if (existingMap.has(key)) continue;
    // Create minimal placeholder record
    // Phone/email/address are required in schema, so we set safe placeholders.
    // You can edit these later from the UI.
    // eslint-disable-next-line no-await-in-loop
    await Company.create({
      name,
      phone: "0300-0000000",
      email: "placeholder@example.com",
      address: "Updated later",
    });
    created += 1;
  }

  console.log(`Seeded companies: ${created} (from ${names.length} unique names)`);
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
