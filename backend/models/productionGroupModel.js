// backend/models/productionGroupModel.js
const mongoose = require("mongoose");

// A production group ties together all daily batches of one paddy source.
// Finished products are recorded here (source level), and the available
// product weight = sum of all batches' paddy weight.
const ProductionOutputSchema = new mongoose.Schema(
  {
    productTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductType",
      required: true,
    },
    productTypeName: { type: String, required: true },

    // Gross weight typed by the user (kg)
    weightKg: { type: Number, required: true, min: 0 },

    numBags: { type: Number, required: true, min: 0 },
    emptyBagWeightKg: { type: Number, required: true, min: 0 },

    // net = weightKg - (numBags * emptyBagWeightKg)
    netWeightKg: { type: Number, required: true, min: 0 },

    outputDate: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ProductionGroupSchema = new mongoose.Schema(
  {
    groupNo: { type: String, required: true, unique: true }, // PG-YYYYMMDD-HHMMSS
    sourceCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },
    sourceCompanyName: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: ["OPEN", "READY", "DONE"],
      default: "OPEN",
    },
    batchDone: { type: Boolean, default: false },
    batchDoneAt: { type: Date, default: null },

    // sum of paddyWeightKg across all batches of this source
    totalPaddyWeightKg: { type: Number, default: 0 },
    totalOutputWeightKg: { type: Number, default: 0 },
    remainingPaddyKg: { type: Number, default: 0 },

    outputs: [ProductionOutputSchema],

    remarks: { type: String, default: "" },
  },
  { timestamps: true }
);

ProductionGroupSchema.index({ sourceCompanyId: 1 });
ProductionGroupSchema.index({ status: 1 });

module.exports = mongoose.model("ProductionGroup", ProductionGroupSchema);
