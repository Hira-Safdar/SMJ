const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
  {
    code: { type: String, trim: true, default: undefined },
    name: { type: String, required: true, trim: true },
    createdOn: { type: Date, default: Date.now },
    type: {
      type: String,
      enum: ["EXPENSE", "INCOME", "ACCOUNT_PAYABLE", "ASSET", "LIABILITY", "EQUITY", "COGS"],
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
accountSchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: { code: { $exists: true, $type: "string" } },
  }
);

module.exports = mongoose.model("Account", accountSchema);
