/* eslint-disable no-console */
// One-time migration: recompute `bagCount` on existing IN gate passes so the
// bag count is derived from NET weight (Weight at SMJ − total empty-bag weight)
// instead of the gross "Weight at SMJ" value.
// Run: node backend/scripts/fixInGatePassBagCount.js
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const GatePass = require("../models/gatePassModel");

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in .env");

  await mongoose.connect(uri);
  console.log("Connected");

  const passes = await GatePass.find({ type: "IN", items: { $exists: true } }).lean();
  console.log(`Found ${passes.length} IN gate passes`);

  let updatedPasses = 0;
  let updatedItems = 0;

  for (const gp of passes) {
    const oldItems = gp.items || [];
    let changed = false;
    const newItems = oldItems.map((it) => {
      const bagW = Number(it.bagWeightEachKg || it.bagWeightKg || 0);
      if (bagW <= 0) return it;

      const storedNet = Number(it.netWeightKg || 0);
      const gross = Number(it.weightAtSmjKg || 0);
      const emptyW = Number(it.emptyBagWeightKg || 0);
      const qty = Number(it.quantity || 0);

      let net;
      if (storedNet > 0) net = storedNet;
      else if (gross > 0) net = Math.max(gross - emptyW, 0);
      else net = qty;

      const newCount = Math.floor(net / bagW);
      if (newCount !== Number(it.bagCount || 0)) {
        changed = true;
        return { ...it, bagCount: newCount };
      }
      return it;
    });

    if (changed) {
      await GatePass.updateOne({ _id: gp._id }, { $set: { items: newItems } });
      updatedPasses++;
      updatedItems += newItems.filter((it, i) => {
        const old = oldItems[i];
        return old && Number(it.bagCount || 0) !== Number(old.bagCount || 0);
      }).length;
      console.log(`  Updated ${gp.gatePassNo || gp._id}`);
    }
  }

  console.log(`\nDone. Updated ${updatedPasses} gate passes / ${updatedItems} item rows.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
