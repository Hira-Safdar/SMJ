const mongoose = require("mongoose");

// Stores normalized "knowledge documents" derived from operational collections.
// This enables RAG-like retrieval over live DB data without retraining the base model.
const AIKnowledgeSchema = new mongoose.Schema(
  {
    source: {
      collection: { type: String, required: true, trim: true }, // e.g. "Transaction"
      docId: { type: String, required: true, trim: true }, // ObjectId as string
    },

    title: { type: String, default: "", trim: true },
    text: { type: String, required: true },

    // Optional embedding; may be null when embeddings are disabled or unavailable.
    embedding: { type: [Number], default: null },
    embeddingModel: { type: String, default: "", trim: true },

    textHash: { type: String, default: "", trim: true },
    deleted: { type: Boolean, default: false },

    // Mirrors source timestamps to make incremental sync easier.
    sourceCreatedAt: { type: Date, default: null },
    sourceUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AIKnowledgeSchema.index({ "source.collection": 1, "source.docId": 1 }, { unique: true });
AIKnowledgeSchema.index({ deleted: 1, sourceUpdatedAt: -1 });
AIKnowledgeSchema.index({ text: "text", title: "text" });

module.exports = mongoose.model("AIKnowledge", AIKnowledgeSchema);

