const axios = require("axios");

function getHfConfig() {
  const hfToken = process.env.HF_API_TOKEN || process.env.HUGGINGFACE_API_TOKEN || "";
  const hfBaseUrl = String(process.env.HF_BASE_URL || "https://router.huggingface.co").replace(
    /\/+$/,
    "",
  );
  return { hfToken, hfBaseUrl };
}

async function embedText(text, { model, timeoutMs } = {}) {
  const { hfToken, hfBaseUrl } = getHfConfig();
  const m = String(model || process.env.HF_EMBED_MODEL || "").trim();
  if (!hfToken || !m) return { vector: null, model: m || null, error: "Embeddings disabled" };

  try {
    const res = await axios.post(
      `${hfBaseUrl}/v1/embeddings`,
      { model: m, input: String(text || "") },
      {
        headers: { Authorization: `Bearer ${hfToken}` },
        timeout: Number(timeoutMs || 45000),
      },
    );

    const vec = res?.data?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || !vec.length) {
      return { vector: null, model: m, error: "No embedding returned" };
    }
    return { vector: vec.map((x) => Number(x)), model: m, error: null };
  } catch (err) {
    const status = err?.response?.status;
    const statusText = err?.response?.statusText;
    const snippet = JSON.stringify(err?.response?.data || {}).slice(0, 200);
    return {
      vector: null,
      model: m,
      error: `Embeddings error ${status || "ERR"} ${statusText || ""}${snippet ? ` - ${snippet}` : ""}`.trim(),
    };
  }
}

module.exports = { embedText };

