const mongoose = require("mongoose");
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const productTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      minlength: [2, "Product name must be at least 2 characters"],
      maxlength: [50, "Product name must not exceed 50 characters"],
      set: function (value) {
        return value ? value.trim() : value;
      },
    },
    productCategory: {
      type: String,
      default: "",
      trim: true,
    },
    baseUnit: {
      type: String,
      default: "KG",
      trim: true,
    },
    allowableSaleUnits: {
      type: [String],
      default: ["Bag", "Ton", "KG"],
    },
    conversionFactors: {
      type: mongoose.Schema.Types.Mixed,
      default: { KG: 1, Bag: 65, Ton: 1000 },
    },
    brand: {
      type: String,
      trim: true,
      maxlength: [80, "Company Name must not exceed 80 characters"],
      default: "",
    },
    defaultSaleRate: {
      type: Number,
      min: [0, "Default sale rate cannot be negative"],
      default: 0,
    },
    pricePerBag: {
      type: Number,
      min: [0, "Price per bag cannot be negative"],
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "Price per bag must be an integer",
      },
    },
    pricePerTon: {
      type: Number,
      min: [0, "Price per ton cannot be negative"],
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "Price per ton must be an integer",
      },
    },
    pricePerKg: {
      type: Number,
      min: [0, "Price per kg cannot be negative"],
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "Price per kg must be an integer",
      },
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, "Description must not exceed 200 characters"],
      default: "",
    },
  },
  { timestamps: true }
);

productTypeSchema.index({ name: 1 });

productTypeSchema.pre("save", async function (next) {
  if (this.isModified("name")) {
    const normalizedName = this.name.toLowerCase().trim();
    const brandNorm = (this.brand || "").toLowerCase().trim();
    const existing = await mongoose.model("ProductType").findOne({
      _id: { $ne: this._id },
      name: { $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, "i") },
      brand: { $regex: new RegExp(`^${escapeRegex(brandNorm)}$`, "i") },
    });
    if (existing) {
      const error = new Error(
        `Product already exists for this company name: "${existing.name}"`
      );
      error.name = "ValidationError";
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model("ProductType", productTypeSchema);
