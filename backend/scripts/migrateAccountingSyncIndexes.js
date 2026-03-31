/* eslint-disable no-console */
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "../../.env") });

// Ensure models are registered
require("../models/accountingPartyModel");
require("../models/accountingProductModel");

async function safeDropIndex(collection, indexName) {
  try {
    await collection.dropIndex(indexName);
    console.log(`Dropped index: ${collection.collectionName}.${indexName}`);
  } catch (err) {
    const msg = String(err?.message || "");
    if (/index not found/i.test(msg) || /ns not found/i.test(msg)) return;
    console.log(`Skip drop index ${collection.collectionName}.${indexName}: ${msg}`);
  }
}

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in .env");

  await mongoose.connect(uri);
  console.log("Connected");

  const AccountingParty = mongoose.model("AccountingParty");
  const AccountingProduct = mongoose.model("AccountingProduct");

  // Drop legacy unique name indexes (if they exist)
  await safeDropIndex(AccountingParty.collection, "name_1");
  await safeDropIndex(AccountingProduct.collection, "name_1");

  // Create new indexes
  await AccountingParty.collection.createIndex(
    { sourceType: 1, sourceRefId: 1 },
    {
      unique: true,
      partialFilterExpression: {
        sourceType: { $in: ["CUSTOMER", "WHOLESELLER"] },
        sourceRefId: { $exists: true },
      },
      name: "sourceType_1_sourceRefId_1_unique_synced",
    }
  );
  await AccountingParty.collection.createIndex({ name: 1 }, { name: "name_1_search" });

  await AccountingProduct.collection.createIndex(
    { sourceProductTypeId: 1 },
    {
      unique: true,
      partialFilterExpression: { sourceProductTypeId: { $exists: true } },
      name: "sourceProductTypeId_1_unique_synced",
    }
  );
  await AccountingProduct.collection.createIndex({ name: 1, brand: 1 }, { name: "name_1_brand_1" });

  console.log("Done");
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

