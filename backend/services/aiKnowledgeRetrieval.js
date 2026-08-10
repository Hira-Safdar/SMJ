const AIKnowledge = require("../models/AIKnowledge");
const { embedText } = require("./aiEmbeddingsService");
const { refreshNow } = require("./aiKnowledgeSync");

function envFlag(name, def = false) {
  const v = String(process.env[name] || "").trim();
  if (!v) return def;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function numEnv(name, def) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : def;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : -1;
}

let cache = { loadedAt: 0, items: [], total: 0 };

async function loadCacheIfNeeded() {
  const ttlMs = numEnv("AI_RAG_CACHE_TTL_MS", 30000);
  const maxDocs = numEnv("AI_RAG_MAX_DOCS", 2000);
  const now = Date.now();
  if (cache.loadedAt && now - cache.loadedAt < ttlMs) return cache;

  const items = await AIKnowledge.find({ deleted: false })
    .sort({ sourceUpdatedAt: -1 })
    .limit(maxDocs)
    .select("title text embedding embeddingModel source sourceUpdatedAt")
    .lean();

  cache = { loadedAt: now, items, total: items.length };
  return cache;
}

async function retrieveKnowledgeContext(message) {
  const enabled = envFlag("AI_RAG", false);
  if (!enabled) return { enabled: false, method: "none", items: [] };

  // Make sure the knowledge base reflects the latest DB state before searching,
  // and drop the cached copy so the fresh docs are actually searched.
  try {
    await refreshNow();
    cache = { loadedAt: 0, items: [], total: 0 };
  } catch (e) {
    console.warn("[AI][RAG] pre-query refresh failed:", e?.message || e);
  }

  const topK = numEnv("AI_RAG_TOP_K", 6);
  const msg = String(message || "").trim();
  if (!msg) return { enabled: true, method: "none", items: [] };

  const preferEmbeddings = envFlag("AI_RAG_USE_EMBEDDINGS", true);
  const embedModel = String(process.env.HF_EMBED_MODEL || "").trim();

  if (preferEmbeddings && embedModel) {
    const emb = await embedText(msg, { model: embedModel });
    if (Array.isArray(emb.vector) && emb.vector.length) {
      const c = await loadCacheIfNeeded();
      const scored = [];
      for (const it of c.items) {
        if (!Array.isArray(it.embedding) || it.embedding.length !== emb.vector.length) continue;
        const score = cosineSimilarity(emb.vector, it.embedding);
        if (score > -1) scored.push({ score, it });
      }
      scored.sort((x, y) => y.score - x.score);
      const picked = scored.slice(0, topK).map((x) => ({
        score: x.score,
        source: x.it.source,
        updatedAt: x.it.sourceUpdatedAt || null,
        title: x.it.title || "",
        text: x.it.text || "",
      }));
      return { enabled: true, method: "embeddings", items: picked };
    }
  }

  // Fallback: keyword-based retrieval via Mongo text search.
  try {
    const rows = await AIKnowledge.find(
      { deleted: false, $text: { $search: msg } },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" }, sourceUpdatedAt: -1 })
      .limit(topK)
      .select("title text source sourceUpdatedAt")
      .lean();

    return {
      enabled: true,
      method: "text",
      items: rows.map((r) => ({
        score: null,
        source: r.source,
        updatedAt: r.sourceUpdatedAt || null,
        title: r.title || "",
        text: r.text || "",
      })),
    };
  } catch {
    return { enabled: true, method: "none", items: [] };
  }
}

function formatKnowledgeForPrompt(ctx) {
  if (!ctx?.enabled || !Array.isArray(ctx.items) || !ctx.items.length) return "";
  const maxChars = numEnv("AI_RAG_PROMPT_MAX_CHARS", 3500);
  const chunks = [];
  for (const it of ctx.items) {
    const src = it?.source?.collection ? `${it.source.collection}:${it.source.docId}` : "unknown";
    const title = String(it.title || "").trim();
    const text = String(it.text || "").trim();
    const piece = [
      `Source: ${src}`,
      title ? `Title: ${title}` : null,
      text ? `Text:\n${text}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    chunks.push(piece);
  }
  const joined = chunks.join("\n\n---\n\n");
  if (joined.length <= maxChars) return joined;
  return joined.slice(0, Math.max(0, maxChars - 12)) + " …(truncated)";
}

module.exports = { retrieveKnowledgeContext, formatKnowledgeForPrompt };

