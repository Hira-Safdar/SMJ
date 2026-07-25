const mongoose = require("mongoose");

const aiChatSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    messages: [
      {
        role: {
          type: String,
          enum: ["user", "assistant"],
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    context: {
      type: String,
      enum: ["gatepass", "inventory", "general", "reports"],
      default: "general",
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

aiChatSchema.index({ userId: 1, sessionId: 1 });
aiChatSchema.index({ userId: 1, active: 1, updatedAt: -1 });

module.exports = mongoose.model("AIChat", aiChatSchema);
