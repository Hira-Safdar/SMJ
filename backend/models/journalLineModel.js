const mongoose = require("mongoose");

const journalLineSchema = new mongoose.Schema(
  {
    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      required: true,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    // Party (customer/supplier/etc.) is optional.
    // Keep both id + cached name to support historical integrity.
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingParty",
      default: null,
    },
    partyName: { type: String, default: "", trim: true },
    // Product is optional (for product-level reports).
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingProduct",
      default: null,
    },
    itemName: { type: String, default: "", trim: true },
    remarks: { type: String, default: "", trim: true },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

journalLineSchema.index({ journalEntryId: 1 });
journalLineSchema.index({ accountId: 1 });
journalLineSchema.index({ partyId: 1 });
journalLineSchema.index({ itemId: 1 });
journalLineSchema.index({ journalEntryId: 1, accountId: 1 });

module.exports = mongoose.model("JournalLine", journalLineSchema);
