const mongoose = require("mongoose");

const AccountingGeneratedJournalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    range: { type: String, default: "all" },
    rangeDate: { type: String, default: "" },
    startDate: { type: String, default: "" },
    endDate: { type: String, default: "" },
    companyId: { type: String, default: "" },
    companyName: { type: String, default: "" },
    accountId: { type: String, default: "" },
    accountName: { type: String, default: "" },
    partyName: { type: String, default: "" },
    itemId: { type: String, default: "" },
    itemName: { type: String, default: "" },
    voucherType: { type: String, default: "" },
    reportKey: { type: String, default: "journal" },
    customLayout: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AccountingGeneratedJournal", AccountingGeneratedJournalSchema);
