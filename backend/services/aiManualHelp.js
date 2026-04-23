const AIKnowledge = require("../models/AIKnowledge");

function numEnv(name, def) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : def;
}

async function answerFromManual(intent, rawMessage) {
  if (!intent || intent.type !== "nav_help") return null;

  const q = String(intent.q || rawMessage || "").trim();
  if (!q) return null;

  const limit = numEnv("AI_MANUAL_TOP_K", 3);

  // Prefer manual docs only; use text search for deterministic results.
  const rows = await AIKnowledge.find(
    { deleted: false, "source.collection": "Manual", $text: { $search: q } },
    { score: { $meta: "textScore" } }
  )
    .sort({ score: { $meta: "textScore" }, sourceUpdatedAt: -1 })
    .limit(limit)
    .select("title text source")
    .lean();

  if (!rows.length) {
    return [
      "I couldn't find that module/tab in the system manual.",
      "Tell me the exact module name you want (e.g. `Journal Entry`, `Stock Reports`, `Gate Pass Outward`).",
    ].join("\n");
  }

  const top = rows[0];
  const title = String(top.title || "System Manual").trim();
  const text = String(top.text || "").trim();
  return `${title}\n\n${text}`;
}

module.exports = { answerFromManual };

