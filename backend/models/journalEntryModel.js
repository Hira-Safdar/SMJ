const mongoose = require("mongoose");

const journalEntrySchema = new mongoose.Schema(
  {
    entryNo: { type: Number, default: 0 },
    voucherNo: { type: String, required: true, unique: true, trim: true },
    date: { type: Date, required: true },
    voucherType: {
      type: String,
      enum: ["JOURNAL", "PAYMENT", "RECEIPT"],
      default: "JOURNAL",
    },
    companyId: { type: String, default: "", trim: true },
    companyName: { type: String, default: "", trim: true },
    customerId: { type: String, default: "", trim: true },
    customerName: { type: String, default: "", trim: true },
    productTypeId: { type: String, default: "", trim: true },
    productName: { type: String, default: "", trim: true },
    cashInHand: { type: Number, default: 0 },
    cashInHandSource: { type: String, enum: ["INITIAL", "CARRIED", "MANUAL_EDIT"], default: "INITIAL" },
    cashInHandEdited: { type: Boolean, default: false },
    cashInHandHistory: {
      type: [
        {
          amount: { type: Number, default: 0 },
          previousAmount: { type: Number, default: null },
          source: { type: String, enum: ["INITIAL", "CARRIED", "MANUAL_EDIT"], default: "INITIAL" },
          note: { type: String, default: "", trim: true },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    narration: { type: String, default: "", trim: true },
    status: { type: String, enum: ["POSTED", "REVERSED"], default: "POSTED" },
  },
  { timestamps: true }
);

journalEntrySchema.index({ date: 1 });
journalEntrySchema.index({ companyId: 1, date: 1 });
journalEntrySchema.index({ voucherType: 1, date: 1 });

module.exports = mongoose.model("JournalEntry", journalEntrySchema);
