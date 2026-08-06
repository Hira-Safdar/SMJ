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

    // Raw material (kg) for this daily run.
    // Kept as `paddyWeightKg` for backward compatibility with existing data —
    // semantically it is now "sourceWeightKg" (any product from stock, not only paddy).
    paddyWeightKg: { type: Number, required: true, min: 0 },
    sourceCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },
    sourceCompanyName: { type: String, required: true, trim: true },

    // The raw material product consumed from stock for this batch.
    // null + "Unprocessed Paddy" => legacy raw paddy allocation.
    sourceProductTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductType",
      default: null,
    },
    sourceProductTypeName: { type: String, default: "Unprocessed Paddy", trim: true },
    // Number of bags of raw material reserved from stock.
    sourceBags: { type: Number, default: 0, min: 0 },

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
