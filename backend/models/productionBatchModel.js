// backend/models/productionBatchModel.js
const mongoose = require("mongoose");

// A batch is a single daily production run for one paddy source.
// Finished products are NOT attached to batches — they belong to the
// source-level ProductionGroup and are derived from the group's total weight.
const ProductionBatchSchema = new mongoose.Schema(
  {
    batchNo: { type: String, required: true, unique: true }, // PB-YYYYMMDD-HHMMSS
    date: { type: Date, required: true },

    status: {
      type: String,
      enum: ["IN_PROCESS", "COMPLETED"],
      default: "IN_PROCESS",
    },

    // Raw paddy (kg) for this daily run
    paddyWeightKg: { type: Number, required: true, min: 0 },
    sourceCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },
    sourceCompanyName: { type: String, required: true, trim: true },
    ownerType: {
      type: String,
      enum: ["SMJ", "CUSTOM"],
      default: "SMJ",
    },

    // Source-level group this batch belongs to
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductionGroup",
      default: null,
    },

    remarks: { type: String, default: "" },
  },
  { timestamps: true }
);

ProductionBatchSchema.index({ date: 1 });
ProductionBatchSchema.index({ status: 1 });
ProductionBatchSchema.index({ status: 1, date: -1 });
ProductionBatchSchema.index({ sourceCompanyId: 1 });
ProductionBatchSchema.index({ groupId: 1 });

module.exports = mongoose.model("ProductionBatch", ProductionBatchSchema);
