const SystemSettings = require("../models/systemSettingsModel");
const ProductType = require("../models/productTypeModel");
const GatePass = require("../models/gatePassModel");
const ProductionBatch = require("../models/productionBatchModel");
const StockLedger = require("../models/stockLedgerModel");
const Transaction = require("../models/transactionModel");

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
    const [settings, productTypes, gatePasses, batches, ledgers, transactions] = await Promise.all([
      SystemSettings.findOne({}).sort({ createdAt: 1 }).lean(),
      ProductType.find({}).select("brand").lean(),
      GatePass.find({}).select("supplier items.brand").lean(),
      ProductionBatch.find({}).select("sourceCompanyName outputs.companyName").lean(),
      StockLedger.find({}).select("companyName").lean(),
      Transaction.find({}).select("companyName").lean(),
    ]);

    const names = new Map();
    (settings?.brandOptions || []).forEach((value) => addName(names, value));
    (productTypes || []).forEach((row) => addName(names, row?.brand));
    (gatePasses || []).forEach((row) => {
      addName(names, row?.supplier);
      (row?.items || []).forEach((item) => addName(names, item?.brand));
    });
    (batches || []).forEach((row) => {
      addName(names, row?.sourceCompanyName);
      (row?.outputs || []).forEach((item) => addName(names, item?.companyName));
    });
    (ledgers || []).forEach((row) => addName(names, row?.companyName));
    (transactions || []).forEach((row) => addName(names, row?.companyName));

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
