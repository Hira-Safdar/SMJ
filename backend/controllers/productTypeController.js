const ProductType = require("../models/productTypeModel");

const normalizeText = (text) => (text ? text.toLowerCase().trim().replace(/\s+/g, " ") : "");
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const checkSimilarProduct = async (name, brand, excludeId = null) => {
  const normalized = normalizeText(name);
  const brandNorm = normalizeText(brand || "");
  const query = {
    name: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
    brand: { $regex: new RegExp(`^${escapeRegex(brandNorm)}$`, "i") },
  };
  if (excludeId) query._id = { $ne: excludeId };
  return await ProductType.findOne(query);
};

exports.getProductTypes = async (req, res) => {
  try {
    const productTypes = await ProductType.find().sort({ name: 1 });
    res.json({ success: true, data: productTypes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createProductType = async (req, res) => {
  try {
    const similar = await checkSimilarProduct(req.body.name, req.body.brand);
    if (similar) {
      return res.status(400).json({
        success: false,
        message: `Product already exists for this company name: "${similar.name}"`,
      });
    }
    const productData = {
      name: req.body.name?.trim(),
      baseUnit: req.body.baseUnit ?? "KG",
      allowableSaleUnits: Array.isArray(req.body.allowableSaleUnits)
        ? req.body.allowableSaleUnits
        : ["Bag", "Ton", "KG"],
      conversionFactors: req.body.conversionFactors && typeof req.body.conversionFactors === "object"
        ? req.body.conversionFactors
        : { KG: 1, Bag: 65, Ton: 1000 },
      brand: req.body.brand?.trim() || "",
      pricePerBag: req.body.pricePerBag ?? 0,
      pricePerTon: req.body.pricePerTon ?? 0,
      pricePerKg: req.body.pricePerKg ?? 0,
    };
    const productType = await ProductType.create(productData);
    res.status(201).json({ success: true, data: productType });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(", ") });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateProductType = async (req, res) => {
  try {
    if (req.body.name) {
      const similar = await checkSimilarProduct(req.body.name, req.body.brand, req.params.id);
      if (similar) {
        return res.status(400).json({
          success: false,
          message: `Product already exists for this company name: "${similar.name}"`,
        });
      }
    }
    const updateData = {};
    if (req.body.name !== undefined) updateData.name = req.body.name.trim();
    if (req.body.baseUnit !== undefined) updateData.baseUnit = req.body.baseUnit;
    if (req.body.allowableSaleUnits !== undefined) updateData.allowableSaleUnits = req.body.allowableSaleUnits;
    if (req.body.conversionFactors !== undefined) updateData.conversionFactors = req.body.conversionFactors;
    if (req.body.brand !== undefined) updateData.brand = req.body.brand.trim();
    if (req.body.pricePerBag !== undefined) updateData.pricePerBag = req.body.pricePerBag;
    if (req.body.pricePerTon !== undefined) updateData.pricePerTon = req.body.pricePerTon;
    if (req.body.pricePerKg !== undefined) updateData.pricePerKg = req.body.pricePerKg;
    const updated = await ProductType.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ success: false, message: "Product type not found" });
    res.json({ success: true, data: updated });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(", ") });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteProductType = async (req, res) => {
  try {
    const productType = await ProductType.findByIdAndDelete(req.params.id);
    if (!productType) return res.status(404).json({ success: false, message: "Product type not found" });
    res.json({ success: true, message: "Product type deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
