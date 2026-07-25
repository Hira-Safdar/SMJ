// backend/models/gatePassModel.js
const mongoose = require("mongoose");
const companyNamePattern = /^[A-Za-z0-9\s.,&()\-]+$/;

const ItemSchema = new mongoose.Schema(
  {
    // Optional per-line brand/trademark (mainly for Paddy/Production lines).
    // Allows multi-brand gate passes while keeping backward compatibility with `supplier`.
    brand: {
      type: String,
      trim: true,
      default: "",
    },
    itemType: {
      type: String,
      required: true,
      trim: true,
    },
    stockType: {
      type: String,
      enum: ["Production", "Managerial"],
      default: "Production",
    },
    customItemName: {
      type: String,
      trim: true,
    },
    quantity: {
      type: Number,
      min: [0, "Quantity must be greater than 0."],
    },
    unit: {
      type: String,
      enum: ["kg", "ton", "bags", "pcs", "mounds"],
      default: "kg",
    },
    rate: {
      type: Number,
      min: 0,
    },
    amount: {
      type: Number,
      min: 0,
    },
    bagCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    bagWeightKg: {
      type: Number,
      min: 0,
      default: 0,
    },
    emptyBagWeightKg: {
      type: Number,
      min: 0,
      default: 0,
    },
    grossWeightKg: {
      type: Number,
      min: 0,
      default: 0,
    },
    netWeightKg: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: true }
);

const GatePassSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["IN", "OUT"],
      required: [true, "Gate pass type is required."],
    },

    // User-selected date for the gate pass (separate from createdAt).
    date: { type: Date, required: true, default: Date.now },

    gatePassNo: {
      type: String,
      unique: true,
      sparse: true,
    },

    truckNo: {
      type: String,
      required: [true, "Truck number is required."],
      minlength: [6, "Truck number too short."],
      maxlength: [12, "Truck number too long."],
      match: [/^[A-Z]{2,4}-\d{3,4}$/, "Format: ABC-123 or AB-1234"],
    },

    customer: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /^[A-Za-z\s]+$/.test(v);
        },
        message: "Customer name: letters and spaces only.",
      },
    },

    supplier: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return companyNamePattern.test(v);
        },
        message: "Supplier name contains invalid characters.",
      },
    },

    // Multiple items array
    items: {
      type: [ItemSchema],
      default: [],
    },

    // Deprecated fields (kept for backward compatibility)
    itemType: String,
    customItemName: String,
    quantity: Number,
    unit: String,

    totalQuantity: {
      type: Number,
      default: 0,
    },

    totalAmount: {
      type: Number,
      default: 0,
    },

    driverName: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /^[A-Za-z\s]+$/.test(v);
        },
        message: "Driver name: letters and spaces only.",
      },
    },

    driverContact: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          // 03XX-XXXXXXX format (11 digits with dash)
          return /^03\d{2}-\d{7}$/.test(v);
        },
        message: "Driver contact: 03XX-XXXXXXX format (11 digits).",
      },
    },

    vehicleWeight: {
      type: Number,
      min: 0,
    },

    // Bilty/LR Number (common in logistics)
    biltyNumber: {
      type: String,
      trim: true,
    },

    // Freight charges
    freightCharges: {
      type: Number,
      min: 0,
    },

    paymentStatus: {
      type: String,
      enum: ["PAID", "UNPAID", "PARTIAL"],
      default: "PAID",
    },
    amountPaid: {
      type: Number,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      min: 0,
    },

    status: {
      type: String,
      enum: ["Pending", "Completed", "Cancelled"],
      default: "Pending",
    },

    createdBy: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Auto number
GatePassSchema.pre("save", async function (next) {
  if (!this.isNew || this.gatePassNo) return next();

  try {
    const year = new Date().getFullYear();
    const prefix = this.type === "IN" ? "GPI" : "GPO";
    const last = await this.constructor
      .find({ gatePassNo: new RegExp(`^${prefix}-${year}-`) })
      .sort({ _id: -1 })
      .limit(1);

    let number = 1;
    if (last.length > 0) {
      const parts = last[0].gatePassNo.split("-");
      const lastNumber = parseInt(parts[2], 10);
      if (!Number.isNaN(lastNumber)) number = lastNumber + 1;
    }

    this.gatePassNo = `${prefix}-${year}-${String(number).padStart(5, "0")}`;

    // Calculate totals from items array
    if (this.items && this.items.length > 0) {
      this.totalQuantity = this.items.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
      );
      this.totalAmount = this.items.reduce(
        (sum, item) => sum + (item.amount || 0),
        0
      );
    }

    next();
  } catch (err) {
    next(err);
  }
});

GatePassSchema.index({ type: 1, date: -1 });
GatePassSchema.index({ date: -1 });
GatePassSchema.index({ status: 1, date: -1 });
GatePassSchema.index({ supplier: 1 });
GatePassSchema.index({ customer: 1 });

module.exports = mongoose.model("GatePass", GatePassSchema);
