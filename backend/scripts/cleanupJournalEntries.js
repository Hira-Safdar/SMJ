/* eslint-disable no-console */
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "../../.env") });

require("../models/journalEntryModel");

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in .env");

  await mongoose.connect(uri);
  console.log("Connected");

  const JournalEntry = mongoose.model("JournalEntry");
  const res = await JournalEntry.updateMany(
    {},
    {
      $unset: {
        bookType: "",
        referenceNo: "",
        description: "",
        sourceModule: "",
        sourceRefType: "",
        sourceRefId: "",
        createdBy: "",
        reversalOf: "",
      },
    }
  );

  console.log(`Matched: ${res.matchedCount || res.n || 0}, Modified: ${res.modifiedCount || res.nModified || 0}`);
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
