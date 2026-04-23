/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const Transaction = require("../models/transactionModel");
const ProductionBatch = require("../models/productionBatchModel");
const GatePass = require("../models/gatePassModel");
const StockLedger = require("../models/stockLedgerModel");
const Company = require("../models/companyModel");
const Customer = require("../models/customerModel");
const ProductType = require("../models/productTypeModel");
const ExpenseCategory = require("../models/expenseCategoryModel");
const JournalEntry = require("../models/journalEntryModel");
const AccountingGeneratedJournal = require("../models/accountingGeneratedJournalModel");

const { upsertKnowledgeFromDoc } = require("../services/aiKnowledgeSync");

const COLLECTIONS = [
  { name: "Transaction", model: Transaction },
  { name: "ProductionBatch", model: ProductionBatch },
  { name: "GatePass", model: GatePass },
  { name: "StockLedger", model: StockLedger },
  { name: "Company", model: Company },
  { name: "Customer", model: Customer },
  { name: "ProductType", model: ProductType },
  { name: "ExpenseCategory", model: ExpenseCategory },
  { name: "JournalEntry", model: JournalEntry },
  { name: "AccountingGeneratedJournal", model: AccountingGeneratedJournal },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { all: false, days: 30, collection: null, limit: 0 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--all") out.all = true;
    else if (a === "--days") out.days = Number(args[++i] || 30);
    else if (a === "--collection") out.collection = String(args[++i] || "").trim();
    else if (a === "--limit") out.limit = Number(args[++i] || 0);
  }
  return out;
}

async function reindexCollection({ name, model }, { all, days, limit }) {
  const since = new Date(Date.now() - (Number(days) || 30) * 24 * 60 * 60 * 1000);
  const q = all ? {} : { updatedAt: { $gte: since } };

  const total = await model.countDocuments(q);
  const pageSize = 200;
  const max = limit && limit > 0 ? Math.min(total, limit) : total;
  console.log(`[AI][RAG] ${name}: indexing ${max}/${total} docs...`);

  let done = 0;
  let lastId = null;
  while (done < max) {
    const batch = await model
      .find(lastId ? { ...q, _id: { $gt: lastId } } : q)
      .sort({ _id: 1 })
      .limit(Math.min(pageSize, max - done))
      .lean();
    if (!batch.length) break;

    for (const doc of batch) {
      // eslint-disable-next-line no-await-in-loop
      await upsertKnowledgeFromDoc(name, doc);
      done += 1;
      lastId = doc._id;
    }
    console.log(`[AI][RAG] ${name}: ${done}/${max}`);
  }
}

async function main() {
  const args = parseArgs();
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("Missing MONGO_URI in .env");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri);
  console.log("[AI][RAG] Mongo connected");

  const targets = args.collection
    ? COLLECTIONS.filter((c) => c.name.toLowerCase() === args.collection.toLowerCase())
    : COLLECTIONS;

  if (!targets.length) {
    console.error(`Unknown --collection ${args.collection}`);
    process.exitCode = 1;
    return;
  }

  for (const t of targets) {
    // eslint-disable-next-line no-await-in-loop
    await reindexCollection(t, args);
  }

  await mongoose.disconnect();
  console.log("[AI][RAG] done");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
