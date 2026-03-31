const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE", "COGS"],
      required: true,
    },
    subType: { type: String, default: "", trim: true },
    parentAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    isControl: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    journalSide: {
      type: String,
      enum: ["BOTH", "DEBIT", "CREDIT"],
      default: "BOTH",
    },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

accountSchema.index({ type: 1, subType: 1 });

module.exports = mongoose.model("Account", accountSchema);
