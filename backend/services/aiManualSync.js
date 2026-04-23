const crypto = require("crypto");

const AIKnowledge = require("../models/AIKnowledge");
const { embedText } = require("./aiEmbeddingsService");
const manualEntries = require("../manual/systemManualEntries");

function sha1(text) {
  return crypto.createHash("sha1").update(String(text || ""), "utf8").digest("hex");
}

function envFlag(name, def = false) {
  const v = String(process.env[name] || "").trim();
  if (!v) return def;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

async function upsertManualEntry(entry) {
  const key = String(entry?.key || "").trim();
  if (!key) return { ok: false, reason: "missing_key" };

  const title = String(entry?.title || "").trim();
  const text = String(entry?.text || "").trim();
  if (!text) return { ok: false, reason: "missing_text" };

  const textHash = sha1(`${title}\n${text}`);
  const source = { collection: "Manual", docId: key };

  const prev = await AIKnowledge.findOne({ "source.collection": "Manual", "source.docId": key })
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
    { "source.collection": "Manual", "source.docId": key },
    {
      $set: {
        source,
        title,
        text,
        textHash,
        deleted: false,
        embedding,
        embeddingModel,
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  return { ok: true, embedded: needsEmbedding };
}

async function initAIManualSync() {
  const enabled = envFlag("AI_RAG", false);
  if (!enabled) return { started: false, reason: "disabled" };

  const entries = Array.isArray(manualEntries) ? manualEntries : [];
  let ok = 0;
  for (const e of entries) {
    // eslint-disable-next-line no-await-in-loop
    const r = await upsertManualEntry(e);
    if (r.ok) ok += 1;
  }
  return { started: true, count: ok };
}

module.exports = { initAIManualSync };

