const crypto = require("crypto");
const mongoose = require("mongoose");

const AIKnowledge = require("../models/AIKnowledge");
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

const { guessBuilder, truncate } = require("./aiKnowledgeBuilders");
const { embedText } = require("./aiEmbeddingsService");

// Shared incremental watermark so background polls and on-demand refreshes
// (refreshNow) never rescan the same docs.
const sinceByCollection = new Map();
// One poll/refresh at a time: startup bootstrap, background polls and the
// pre-query refresh must never run concurrently (they'd re-embed the same docs).
let pollInFlight = false;

const DEFAULT_COLLECTIONS = [
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

function sha1(text) {
  return crypto.createHash("sha1").update(String(text || ""), "utf8").digest("hex");
}

function envFlag(name, def = false) {
  const v = String(process.env[name] || "").trim();
  if (!v) return def;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function numEnv(name, def) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : def;
}

function getCollections() {
  const raw = String(process.env.AI_RAG_COLLECTIONS || "").trim();
  if (!raw) return DEFAULT_COLLECTIONS;
  const wanted = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!wanted.length) return DEFAULT_COLLECTIONS;

  const map = new Map(DEFAULT_COLLECTIONS.map((x) => [x.name, x]));
  return wanted.map((name) => map.get(name)).filter(Boolean);
}

async function upsertKnowledgeFromDoc(collectionName, doc) {
  if (!doc || !doc._id) return { ok: false, reason: "missing_doc" };

  const builder = guessBuilder(collectionName);
  const built = builder(doc) || {};
  const title = truncate(built.title || "", 160);
  const text = truncate(built.text || "", 2400);
  if (!text) return { ok: false, reason: "empty_text" };

  const textHash = sha1(`${title}\n${text}`);

  const source = { collection: collectionName, docId: String(doc._id) };
  const sourceCreatedAt = doc.createdAt ? new Date(doc.createdAt) : null;
  const sourceUpdatedAt = doc.updatedAt ? new Date(doc.updatedAt) : null;

  const prev = await AIKnowledge.findOne({ "source.collection": source.collection, "source.docId": source.docId })
    .select("textHash embedding embeddingModel deleted")
    .lean();

  const embedModel = String(process.env.HF_EMBED_MODEL || "").trim();
  const shouldEmbed = envFlag("AI_RAG_EMBED", true) && !!embedModel;
  const needsEmbedding =
    shouldEmbed &&
    (!prev || prev.deleted || prev.textHash !== textHash || !Array.isArray(prev.embedding) || prev.embeddingModel !== embedModel);

  let embedding = prev?.embedding || null;
  let embeddingModel = prev?.embeddingModel || "";

  if (needsEmbedding) {
    const emb = await embedText(`${title}\n${text}`, { model: embedModel });
    if (Array.isArray(emb.vector) && emb.vector.length) {
      embedding = emb.vector;
      embeddingModel = emb.model || embedModel;
    } else {
      embedding = null;
      embeddingModel = emb.model || embedModel || "";
    }
  }

  await AIKnowledge.updateOne(
    { "source.collection": source.collection, "source.docId": source.docId },
    {
      $set: {
        source,
        title,
        text,
        textHash,
        deleted: false,
        embedding,
        embeddingModel,
        sourceCreatedAt,
        sourceUpdatedAt,
      },
    },
    { upsert: true }
  );

  return { ok: true, embedded: needsEmbedding };
}

async function markKnowledgeDeleted(collectionName, docId) {
  await AIKnowledge.updateOne(
    { "source.collection": collectionName, "source.docId": String(docId) },
    { $set: { deleted: true } },
    { upsert: true }
  );
}

async function pollOnce({ sinceByCollection }) {
  if (pollInFlight) return { ok: false, skipped: true };
  pollInFlight = true;
  try {
    const cols = getCollections();
    const now = new Date();

    for (const { name, model } of cols) {
      const since = sinceByCollection.get(name) || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const marginMs = numEnv("AI_RAG_POLL_MARGIN_MS", 5000);
      const from = new Date(since.getTime() - marginMs);

      const docs = await model
        .find({ updatedAt: { $gte: from } })
        .sort({ updatedAt: -1 })
        .limit(numEnv("AI_RAG_POLL_LIMIT", 200))
        .lean();

      for (const doc of docs) {
        // eslint-disable-next-line no-await-in-loop
        await upsertKnowledgeFromDoc(name, doc);
      }

      const lastUpdated = docs.reduce((acc, d) => {
        const t = d?.updatedAt ? new Date(d.updatedAt).getTime() : 0;
        return t > acc ? t : acc;
      }, 0);
      sinceByCollection.set(name, new Date(Math.max(now.getTime(), lastUpdated || 0)));
    }
    return { ok: true };
  } finally {
    pollInFlight = false;
  }
}

function startChangeStreams() {
  const cols = getCollections();
  const streams = [];

  for (const { name, model } of cols) {
    try {
      const stream = model.watch([], { fullDocument: "updateLookup" });
      stream.on("change", async (evt) => {
        try {
          if (evt.operationType === "delete") {
            await markKnowledgeDeleted(name, evt.documentKey?._id);
            return;
          }
          const doc = evt.fullDocument;
          await upsertKnowledgeFromDoc(name, doc);
        } catch (e) {
          console.warn(`[AI][RAG] change-stream handler error (${name}):`, e?.message || e);
        }
      });
      stream.on("error", (e) => {
        console.warn(`[AI][RAG] change-stream error (${name}):`, e?.message || e);
      });
      streams.push(stream);
    } catch (e) {
      console.warn(`[AI][RAG] change-stream not available for ${name}:`, e?.message || e);
    }
  }

  return streams;
}

async function initAIKnowledgeSync() {
  const enabled = envFlag("AI_RAG", false);
  if (!enabled) return { started: false, reason: "disabled" };

  if (mongoose.connection.readyState !== 1) {
    return { started: false, reason: "mongo_not_connected" };
  }

  const bootstrapDays = numEnv("AI_RAG_BOOTSTRAP_DAYS", 30);
  const bootstrapSince = new Date(Date.now() - bootstrapDays * 24 * 60 * 60 * 1000);
  for (const { name } of getCollections()) sinceByCollection.set(name, bootstrapSince);

  // Bootstrap once (best effort)
  try {
    await pollOnce({ sinceByCollection });
  } catch (e) {
    console.warn("[AI][RAG] bootstrap poll failed:", e?.message || e);
  }

  const watchEnabled = envFlag("AI_RAG_WATCH", true);
  const streams = watchEnabled ? startChangeStreams() : [];

  const pollMs = numEnv("AI_RAG_POLL_MS", 60000);
  const timer = setInterval(() => {
    pollOnce({ sinceByCollection }).catch((e) => {
      console.warn("[AI][RAG] poll failed:", e?.message || e);
    });
  }, pollMs);
  timer.unref?.();

  return { started: true, streams: streams.length, pollMs };
}

/**
 * Bring the AI knowledge up to date right now (incremental). Used before
 * answering a chat message so the assistant always sees the latest data
 * even when Mongo change streams are unavailable (standalone databases).
 */
async function refreshNow() {
  const enabled = envFlag("AI_RAG", false);
  if (!enabled) return { ok: false, reason: "disabled" };
  if (mongoose.connection.readyState !== 1) return { ok: false, reason: "mongo_not_connected" };
  await pollOnce({ sinceByCollection });
  return { ok: true };
}

module.exports = { initAIKnowledgeSync, upsertKnowledgeFromDoc, markKnowledgeDeleted, refreshNow };
