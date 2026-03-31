const mongoose = require("mongoose");

const accountingProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    unit: { type: String, default: "", trim: true }, // e.g. kg, ton, pcs
    sku: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
    brand: { type: String, default: "", trim: true },
    displayName: { type: String, default: "", trim: true },
    sourceProductTypeId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductType" },
  },
  { timestamps: true }
);

accountingProductSchema.index(
  { sourceProductTypeId: 1 },
  { unique: true, partialFilterExpression: { sourceProductTypeId: { $exists: true } } }
);
accountingProductSchema.index({ name: 1, brand: 1 });

module.exports = mongoose.model("AccountingProduct", accountingProductSchema);
