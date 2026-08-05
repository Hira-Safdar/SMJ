// backend/models/gatePassModel.js
const mongoose = require("mongoose");
const Counter = require("./counterModel");
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
    rateType: {
      type: String,
      enum: ["KG", "BAG", "MAN"],
      default: "KG",
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
    bagWeightEachKg: {
      type: Number,
      min: 0,
      default: 0,
    },
    emptyBagWeightKg: {
      type: Number,
      min: 0,
      default: 0,
    },
    weightAtSmjKg: {
      type: Number,
      min: 0,
      default: 0,
    },
    weightOnArrival: {
      type: Number,
      min: 0,
      default: 0,
    },
    bagsOnArrival: {
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
      trim: true,
      required: function () {
        return this.type === "IN";
      },
    },

    customer: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return companyNamePattern.test(v);
        },
        message: "Customer/company name contains invalid characters.",
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

    senderName: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return companyNamePattern.test(v);
        },
        message: "Sender name contains invalid characters.",
      },
    },

    // Multiple items array
    items: {
      type: [ItemSchema],
      default: [],
    },

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

    // Weight on arrival (weighbridge / initial weight at entry)
    weightOnArrival: {
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

// Auto number.
// Numbers come from a monotonic counter (keyed by type-year). The counter is
// seeded from the highest number currently in use and is NEVER decremented,
// so even if the latest gate pass is deleted its number is not reused.
GatePassSchema.pre("save", async function (next) {
  if (!this.isNew || this.gatePassNo) return next();

  try {
    const year = new Date().getFullYear();
    const prefix = this.type === "IN" ? "GPI" : "GPO";
    const key = `${prefix}-${year}`;

    const lastDocs = await this.constructor
      .find({ gatePassNo: new RegExp(`^${key}-`) })
      .select("gatePassNo")
      .lean();
    const maxExisting = lastDocs.reduce((max, d) => {
      const n = parseInt(String(d.gatePassNo || "").split("-")[2], 10);
      return Number.isNaN(n) ? max : Math.max(max, n);
    }, 0);

    // $setOnInsert seeds the counter from the existing max (idempotent upsert),
    // then $inc atomically moves past it. Because the counter never goes
    // backwards, a deleted number is never regenerated. The unique index on
    // gatePassNo remains as a safety net.
    await Counter.updateOne(
      { _id: key },
      { $setOnInsert: { seq: maxExisting } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    const counter = await Counter.findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { new: true }
    );

    this.gatePassNo = `${key}-${String(counter.seq).padStart(5, "0")}`;

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
