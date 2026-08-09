/* eslint-disable no-console */
// One-time migration: stop returning remaining paddy to stock on group finalization.
// Deletes the "Remaining raw material returned" StockLedger IN entries that were
// wrongly created by markGroupDone, so those kg stay as group.remainingPaddyKg instead.
// Run: node backend/scripts/fixProductionRemainingStock.js
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const StockLedger = require("../models/stockLedgerModel");

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in .env");

  await mongoose.connect(uri);
  console.log("Connected to db:", mongoose.connection.name);

  const dryRun = process.argv.includes("--dry-run");

  const entries = await StockLedger.find({
    remarks: /remaining raw material returned/i,
  }).lean();
  console.log(`Found ${entries.length} 'Remaining raw material returned' ledger entries`);

  let totalKg = 0;
  for (const e of entries) {
    totalKg += Number(e.netWeightKg || 0);
    console.log(`  ${e.type} | ${e.netWeightKg}kg | ${e.companyName || ""} | ${e.remarks}`);
  }
  console.log(`Total wrongly-returned kg: ${totalKg}`);

  if (dryRun) {
    console.log("Dry run - nothing deleted.");
  } else if (entries.length > 0) {
    const ids = entries.map((e) => e._id);
    const res = await StockLedger.deleteMany({ _id: { $in: ids } });
    console.log(`Deleted ${res.deletedCount} entries`);
  }

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
