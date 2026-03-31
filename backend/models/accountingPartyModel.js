const mongoose = require("mongoose");

const accountingPartySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    partyType: {
      type: String,
      enum: ["CUSTOMER", "SUPPLIER", "BOTH", "OTHER"],
      default: "OTHER",
    },
    phone: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
    sourceType: {
      type: String,
      enum: ["CUSTOMER", "WHOLESELLER", "MANUAL"],
      default: "MANUAL",
      required: true,
    },
    sourceRefId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

accountingPartySchema.index(
  { sourceType: 1, sourceRefId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceType: { $in: ["CUSTOMER", "WHOLESELLER"] },
      sourceRefId: { $exists: true },
    },
  }
);
accountingPartySchema.index({ name: 1 });

module.exports = mongoose.model("AccountingParty", accountingPartySchema);
