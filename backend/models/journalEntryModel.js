const mongoose = require("mongoose");

const journalEntrySchema = new mongoose.Schema(
  {
    voucherNo: { type: String, required: true, unique: true, trim: true },
    date: { type: Date, required: true },
    voucherType: {
      type: String,
      enum: ["JOURNAL", "PAYMENT", "RECEIPT"],
      default: "JOURNAL",
    },
    bookType: {
      type: String,
      enum: [
        "JOURNAL",
        "CASH_BOOK",
        "PURCHASE_BOOK",
        "SALES_BOOK",
        "PURCHASE_RETURN",
        "SALES_RETURN",
        "BILLS_RECEIVABLE",
        "BILLS_PAYABLE",
      ],
      default: "JOURNAL",
    },
    companyId: { type: String, default: "", trim: true },
    companyName: { type: String, default: "", trim: true },
    referenceNo: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    sourceModule: { type: String, default: "", trim: true },
    sourceRefType: { type: String, default: "", trim: true },
    sourceRefId: { type: String, default: "", trim: true },
    narration: { type: String, default: "", trim: true },
    status: { type: String, enum: ["POSTED", "REVERSED"], default: "POSTED" },
    reversalOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    createdBy: { type: String, default: "system", trim: true },
  },
  { timestamps: true }
);

journalEntrySchema.index({ date: 1 });
journalEntrySchema.index({ companyId: 1, date: 1 });
journalEntrySchema.index({ voucherType: 1, date: 1 });
journalEntrySchema.index({ bookType: 1, date: 1 });
journalEntrySchema.index({ sourceModule: 1, sourceRefType: 1, sourceRefId: 1 });

module.exports = mongoose.model("JournalEntry", journalEntrySchema);
