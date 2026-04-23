# AI DB Auto-Knowledge (RAG)

This project can automatically keep the AI "aware" of new/updated DB data without retraining the base model.

## Enable

Set in `.env`:

- `AI_RAG=1`
- `HF_EMBED_MODEL=sentence-transformers/all-MiniLM-L6-v2` (or any embeddings model available to your HF Router)
- Optional: `AI_RAG_WATCH=1` (uses Mongo change streams when available)

Notes:
- Change streams require MongoDB replica set. If not available, the app still auto-syncs using polling.
- If embeddings fail/unavailable, retrieval falls back to MongoDB text search over the knowledge docs.
- A built-in UI navigation manual is loaded into the same knowledge index at server start.

## Manual (re)index

From repo root:

- `node backend/scripts/reindexAiKnowledge.js --days 90`
- `node backend/scripts/reindexAiKnowledge.js --all`
- `node backend/scripts/reindexAiKnowledge.js --collection Transaction --days 30`

## Tuning (optional)

- `AI_RAG_POLL_MS=60000`
- `AI_RAG_BOOTSTRAP_DAYS=30`
- `AI_RAG_TOP_K=6`
- `AI_RAG_MAX_DOCS=2000`
- `AI_RAG_PROMPT_MAX_CHARS=3500`
