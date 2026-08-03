const mongoose = require("mongoose");

const GatePassGeneratedReportSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    reportKind: { type: String, default: "gatepass" },
    filterLabel: { type: String, default: "" },
    criteria: { type: mongoose.Schema.Types.Mixed, default: {} },
    columns: { type: [String], default: [] },
    rows: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GatePassGeneratedReport", GatePassGeneratedReportSchema);
