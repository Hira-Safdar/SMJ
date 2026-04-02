const SystemSettings = require("../models/systemSettingsModel");
const Company = require("../models/companyModel");
const ProductType = require("../models/productTypeModel");
const ExpenseCategory = require("../models/expenseCategoryModel");
const Transaction = require("../models/transactionModel");
const GatePass = require("../models/gatePassModel");
const ProductionBatch = require("../models/productionBatchModel");
const StockLedger = require("../models/stockLedgerModel");
const ExpenseEntry = require("../models/expenseEntryModel");
const AIChat = require("../models/AIChat");
const JournalLine = require("../models/journalLineModel");

const MODEL_MAP = {
  companies: Company,
  productTypes: ProductType,
  expenseCategories: ExpenseCategory,
  transactions: Transaction,
  gatePasses: GatePass,
  productionBatches: ProductionBatch,
  stockLedgers: StockLedger,
  expenseEntries: ExpenseEntry,
  journalLines: JournalLine,
  aiChats: AIChat,
};

async function verifyAdminPin(req, res) {
  const pin = req.body && req.body.adminPin != null ? String(req.body.adminPin).trim() : "";
  if (!pin) {
    res.status(403).json({ success: false, message: "Admin PIN is required." });
    return false;
  }
  const settings = await SystemSettings.findOne({}).select("adminPin").lean();
  const expected = String(settings?.adminPin || "0000").trim();
  if (pin !== expected) {
    res.status(403).json({ success: false, message: "Invalid admin PIN." });
    return false;
  }
  return true;
}

exports.purge = async (req, res) => {
  try {
    const ok = await verifyAdminPin(req, res);
    if (!ok) return;

    const key = String(req.body?.key || "").trim();
    const filter = req.body?.filter && typeof req.body.filter === "object" ? req.body.filter : {};

    const Model = MODEL_MAP[key];
    if (!Model) {
      return res.status(400).json({
        success: false,
        message: "Invalid purge key.",
      });
    }

    // Guardrails: only allow a tiny filter surface for known fields to avoid accidental broad deletes.
    const allowedFilter = {};
    if (key === "transactions" && (filter.type === "SALE" || filter.type === "PURCHASE")) {
      allowedFilter.type = filter.type;
    }
    if (key === "gatePasses" && (filter.type === "IN" || filter.type === "OUT")) {
      allowedFilter.type = filter.type;
    }
    if (key === "productionBatches" && (filter.status === "IN_PROCESS" || filter.status === "COMPLETED")) {
      allowedFilter.status = filter.status;
    }

    const result = await Model.deleteMany(allowedFilter);
    return res.json({
      success: true,
      data: {
        key,
        filter: allowedFilter,
        deletedCount: result?.deletedCount || 0,
      },
    });
  } catch (err) {
    console.error("purge error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete all records." });
  }
};
