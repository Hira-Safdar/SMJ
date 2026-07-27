const SystemSettings = require("../models/systemSettingsModel");
const ProductType = require("../models/productTypeModel");

const normalizeText = (text) =>
  String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const toTitleCase = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

const addName = (map, value) => {
  const key = normalizeText(value);
  if (!key) return;
  if (!map.has(key)) map.set(key, toTitleCase(value));
};

exports.getCompanies = async (_req, res) => {
  try {
    const [settings, productTypes] = await Promise.all([
      SystemSettings.findOne({}).sort({ createdAt: 1 }).lean(),
      ProductType.find({}).select("brand").lean(),
    ]);

    const names = new Map();
    (settings?.brandOptions || []).forEach((value) => addName(names, value));
    (productTypes || []).forEach((row) => addName(names, row?.brand));

    const companies = Array.from(names.values())
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ _id: name, name }));

    res.json({ success: true, data: companies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deprecatedResponse = (res) =>
  res.status(410).json({
    success: false,
    message: "Legacy companies collection is deprecated. Use customer records or live company names from products and stock.",
  });

exports.getCompany = async (_req, res) => deprecatedResponse(res);
exports.createCompany = async (_req, res) => deprecatedResponse(res);
exports.updateCompany = async (_req, res) => deprecatedResponse(res);
exports.deleteCompany = async (_req, res) => deprecatedResponse(res);
