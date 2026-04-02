/* eslint-disable no-console */
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "../../.env") });

// Ensure models are registered
require("../models/journalEntryModel");
require("../models/journalLineModel");

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in .env");

  await mongoose.connect(uri);
  console.log("Connected");

  const JournalEntry = mongoose.model("JournalEntry");
  const JournalLine = mongoose.model("JournalLine");

  const entryCount = await JournalEntry.countDocuments({});
  const lineCount = await JournalLine.countDocuments({});
  console.log(`Current: ${entryCount} journal entries, ${lineCount} journal lines`);

  const lineResult = await JournalLine.deleteMany({});
  const entryResult = await JournalEntry.deleteMany({});
  console.log(`Deleted: ${lineResult.deletedCount} journal lines, ${entryResult.deletedCount} journal entries`);

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
