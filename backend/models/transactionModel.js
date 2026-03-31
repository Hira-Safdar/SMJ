// backend/models/transactionModel.js
const mongoose = require("mongoose");

const TransactionItemSchema = new mongoose.Schema(
  {
    productTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductType",
    },
    productTypeName: {
      type: String,
      trim: true,
    },
    numBags: {
      type: Number,
      min: 0,
    },
    perBagWeightKg: {
      type: Number,
      min: 0,
    },
    netWeightKg: {
      type: Number,
      min: 0,
    },
    managerialItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ManagerialStock",
      default: null,
    },
    itemName: {
      type: String,
      trim: true,
    },
    quantity: {
      type: Number,
      min: 0,
    },
    isManagerial: {
      type: Boolean,
      default: false,
    },
    isPaddy: {
      type: Boolean,
      default: false,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    rateType: {
      type: String,
      enum: ["per_kg", "per_bag", "per_ton", "per_unit"],
      default: "per_kg",
    },
    amount: {
      type: Number,
      min: 0,
    },
    productName: {
      type: String,
      trim: true,
    },
    salePricePerKg: {
      type: Number,
      min: 0,
    },
  },
  { _id: false }
);

const TransactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["PURCHASE", "SALE"],
      required: true,
    },
    purchaseKind: {
      type: String,
      enum: ["MANAGERIAL", "PADDY"],
      default: "MANAGERIAL",
    },
    saleKind: {
      type: String,
      enum: ["SMJ", "CUSTOM"],
      default: "SMJ",
    },

    invoiceNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    date: {
      type: Date,
      required: true,
    },

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
    },
    companyName: {
      type: String,
      trim: true,
    },

    // SALE parties are stored separately from Company (customers).
    // We keep companyId/companyName for backward compatibility and PURCHASE flows.
    partyType: {
      type: String,
      enum: ["CUSTOMER", "WHOLESELLER"],
      default: null,
    },
    partyRefId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    partyName: {
      type: String,
      trim: true,
      default: "",
    },

    paymentStatus: {
      type: String,
      enum: ["PAID", "UNPAID", "PARTIAL"],
      default: "PAID",
    },

    // 🔹 NEW: payment method for future gateway integration
    paymentMethod: {
      type: String,
      enum: ["CASH", "CARD", "ONLINE_TRANSFER", "BANK_TRANSFER", "CREDIT"],
      default: "CASH",
    },

    dueDate: {
      type: Date,
      default: null,
    },

    items: {
      type: [TransactionItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "At least one item is required",
      },
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    partialPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Gate pass usage:
    // - PURCHASE invoice -> Gate Pass IN (optional)
    // - SALE invoice -> Gate Pass OUT (required)
    gatePassUsed: {
      type: Boolean,
      default: false,
    },
    gatePassId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GatePass",
      default: null,
    },
  },
  { timestamps: true }
);

TransactionSchema.index({ type: 1, date: 1 });
TransactionSchema.index({ companyId: 1, date: 1 });
TransactionSchema.index({ partyType: 1, partyRefId: 1, date: 1 });

module.exports = mongoose.model("Transaction", TransactionSchema);
