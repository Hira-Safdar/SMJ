const Account = require("../models/accountModel");
const AccountingEntity = require("../models/accountingEntityModel");
const AccountingParty = require("../models/accountingPartyModel");
const AccountingProduct = require("../models/accountingProductModel");
const AccountingFilterTemplate = require("../models/accountingFilterTemplateModel");
const AccountingGeneratedJournal = require("../models/accountingGeneratedJournalModel");
const JournalEntry = require("../models/journalEntryModel");
const JournalLine = require("../models/journalLineModel");
const { getDateRangeFromQuery } = require("../utils/dateRange");
const { ensureDefaultAccounts, postJournalEntry } = require("../services/accountingJournalService");
const { syncPartiesFromMasters, syncProductsFromProductTypes } = require("../services/accountingSyncService");

// Cleanup function to remove old/blank data
exports.cleanupDatabase = async (req, res) => {
  try {
    let deletedCount = 0;
    let details = [];

    // Remove blank journal entries (entries with no lines or empty lines)
    const blankEntries = await JournalEntry.find({
      $or: [
        { lines: { $exists: false } },
        { lines: { $size: 0 } },
        { lines: { $eq: null } },
        { lines: { $eq: [] } },
      ],
    });
    if (blankEntries.length > 0) {
      const entryIds = blankEntries.map(e => e._id);
      const deletedLines = await JournalLine.deleteMany({ journalEntryId: { $in: entryIds } });
      const deletedEntries = await JournalEntry.deleteMany({ _id: { $in: entryIds } });
      deletedCount += deletedEntries.deletedCount;
      details.push(`Deleted ${deletedEntries.deletedCount} blank journal entries and ${deletedLines.deletedCount} associated lines`);
    }

    // Remove journal lines with no account or zero amounts
    const blankLines = await JournalLine.find({
      $or: [
        { accountId: { $exists: false } },
        { accountId: { $eq: "" } },
        { accountId: null },
        { debit: 0, credit: 0 },
      ],
    });
    if (blankLines.length > 0) {
      const lineIds = blankLines.map(l => l._id);
      const deletedLines = await JournalLine.deleteMany({ _id: { $in: lineIds } });
      deletedCount += deletedLines.deletedCount;
      details.push(`Deleted ${deletedLines.deletedCount} blank journal lines`);
    }

    // Remove blank accounts (accounts with no name)
    const blankAccounts = await Account.find({
      $or: [
        { name: { $exists: false } },
        { name: { $eq: "" } },
        { name: null },
      ],
    });
    if (blankAccounts.length > 0) {
      const accountIds = blankAccounts.map(a => a._id);
      const deletedAccounts = await Account.deleteMany({ _id: { $in: accountIds } });
      deletedCount += deletedAccounts.deletedCount;
      details.push(`Deleted ${deletedAccounts.deletedCount} blank accounts`);
    }

    // Remove blank entities
    const blankEntities = await AccountingEntity.find({
      $or: [
        { name: { $exists: false } },
        { name: { $eq: "" } },
        { name: null },
      ],
    });
    if (blankEntities.length > 0) {
      const entityIds = blankEntities.map(e => e._id);
      const deletedEntities = await AccountingEntity.deleteMany({ _id: { $in: entityIds } });
      deletedCount += deletedEntities.deletedCount;
      details.push(`Deleted ${deletedEntities.deletedCount} blank entities`);
    }

    // Remove blank parties
    const blankParties = await AccountingParty.find({
      $or: [
        { name: { $exists: false } },
        { name: { $eq: "" } },
        { name: null },
      ],
    });
    if (blankParties.length > 0) {
      const partyIds = blankParties.map(p => p._id);
      const deletedParties = await AccountingParty.deleteMany({ _id: { $in: partyIds } });
      deletedCount += deletedParties.deletedCount;
      details.push(`Deleted ${deletedParties.deletedCount} blank parties`);
    }

    // Remove blank products
    const blankProducts = await AccountingProduct.find({
      $or: [
        { name: { $exists: false } },
        { name: { $eq: "" } },
        { name: null },
      ],
    });
    if (blankProducts.length > 0) {
      const productIds = blankProducts.map(p => p._id);
      const deletedProducts = await AccountingProduct.deleteMany({ _id: { $in: productIds } });
      deletedCount += deletedProducts.deletedCount;
      details.push(`Deleted ${deletedProducts.deletedCount} blank products`);
    }

    res.json({ 
      success: true, 
      message: "Database cleanup completed",
      deletedCount,
      details 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to cleanup database: " + err.message });
  }
};

const parseRange = (req) => getDateRangeFromQuery(req.query);
const toNum = (v) => Number(v || 0);
const round2 = (n) => Number((Number(n || 0)).toFixed(2));
const escRe = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MANUAL_ACCOUNT_TYPES = ["EXPENSE", "INCOME", "ACCOUNT_PAYABLE"];
const normalizeAccountType = (value) => String(value || "").trim().toUpperCase();
const accountSortKey = (row) => `${MANUAL_ACCOUNT_TYPES.indexOf(row.type) === -1 ? 99 : MANUAL_ACCOUNT_TYPES.indexOf(row.type)}-${String(row.createdOn || row.createdAt || "")}-${String(row.name || "")}`;
const balanceSheetType = (type) => (type === "ACCOUNT_PAYABLE" ? "LIABILITY" : type);
const parseAccountCreatedOn = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return new Date();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};
const normalizeCashInHandSource = (value) =>
  ["INITIAL", "CARRIED", "MANUAL_EDIT"].includes(String(value || "")) ? String(value) : "INITIAL";
const buildCashInHandHistoryRow = ({ amount, previousAmount = null, source = "INITIAL", note = "" }) => ({
  amount: round2(amount),
  previousAmount: previousAmount == null ? null : round2(previousAmount),
  source: normalizeCashInHandSource(source),
  note: String(note || "").trim(),
  at: new Date(),
});
const ACCOUNT_CODE_INDEX_FILTER = { code: { $exists: true, $type: "string" } };
let accountCodeIndexPromise = null;
const ensureAccountCodeIndex = async () => {
  if (!accountCodeIndexPromise) {
    accountCodeIndexPromise = (async () => {
      try {
        await Account.updateMany({ code: "" }, { $unset: { code: "" } });
        const indexes = await Account.collection.indexes();
        const codeIndex = indexes.find((idx) => idx.name === "code_1");
        const currentFilter = JSON.stringify(codeIndex?.partialFilterExpression || null);
        const expectedFilter = JSON.stringify(ACCOUNT_CODE_INDEX_FILTER);
        if (codeIndex && currentFilter !== expectedFilter) {
          await Account.collection.dropIndex("code_1");
        }
        await Account.collection.createIndex(
          { code: 1 },
          {
            unique: true,
            partialFilterExpression: ACCOUNT_CODE_INDEX_FILTER,
            name: "code_1",
          }
        );
      } catch (err) {
        accountCodeIndexPromise = null;
        throw err;
      }
    })();
  }
  await accountCodeIndexPromise;
};

async function ensureCashInHandAccount() {
  await ensureAccountCodeIndex();
  const existing = await Account.findOne({
    isActive: true,
    $or: [
      { name: /^Cash in Hand$/i },
      { name: /^Cash$/i, subType: "CASH" },
      { subType: "CASH", type: "ASSET" },
    ],
  }).lean();
  if (existing?._id) return existing;
  return await Account.create({
    name: "Cash in Hand",
    type: "ASSET",
    subType: "CASH",
    parentAccountId: null,
    isControl: false,
    isActive: true,
    journalSide: "BOTH",
    tags: ["daybook"],
  });
}

async function buildDaybookLines(payload = {}) {
  const accountId = String(payload.accountId || "").trim();
  const narration = String(payload.narration || payload.description || "").trim();
  const amount = round2(payload.amount);
  const side = String(payload.side || "").trim().toUpperCase();
  const cashInHandRaw = String(payload.cashInHand ?? "").trim();
  const cashInHand = round2(payload.cashInHand);

  if (!cashInHandRaw || !Number.isFinite(cashInHand) || cashInHand < 0) {
    const err = new Error("Cash in hand is required.");
    err.statusCode = 400;
    throw err;
  }
  if (!accountId) {
    const err = new Error("Account name is required.");
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error("Amount is required.");
    err.statusCode = 400;
    throw err;
  }
  if (!["DEBIT", "CREDIT"].includes(side)) {
    const err = new Error("Select debit or credit.");
    err.statusCode = 400;
    throw err;
  }
  if (!narration) {
    const err = new Error("Description is required.");
    err.statusCode = 400;
    throw err;
  }

  const cashAccount = await ensureCashInHandAccount();
  if (String(cashAccount._id) === accountId) {
    const err = new Error("Select an account other than Cash in Hand.");
    err.statusCode = 400;
    throw err;
  }

  const remarks = narration;
  if (side === "DEBIT") {
    return [
      { accountId, debit: amount, credit: 0, remarks },
      { accountId: cashAccount._id, debit: 0, credit: amount, remarks },
    ];
  }
  return [
    { accountId: cashAccount._id, debit: amount, credit: 0, remarks },
    { accountId, debit: 0, credit: amount, remarks },
  ];
}

async function ensureActiveAccountsForLines(lines, errorPrefix = "Invalid account selection.") {
  const ids = [...new Set((lines || []).map((l) => String(l?.accountId || "")).filter(Boolean))];
  if (!ids.length) return;
  const rows = await Account.find({ _id: { $in: ids } }).select("_id isActive journalSide").lean();
  const map = new Map(rows.map((a) => [String(a._id), a]));

  const bad = [];
  for (const l of lines || []) {
    const id = String(l?.accountId || "");
    if (!id) continue;
    const a = map.get(id);
    if (!a || a.isActive !== true) {
      bad.push(id);
      continue;
    }
    const side = String(a.journalSide || "BOTH").toUpperCase();
    const debit = toNum(l?.debit);
    const credit = toNum(l?.credit);
    if (debit > 0 && side === "CREDIT") bad.push(id);
    if (credit > 0 && side === "DEBIT") bad.push(id);
  }

  if (bad.length) {
    const err = new Error(errorPrefix);
    err.statusCode = 400;
    throw err;
  }
}

function parseListParam(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((v) => String(v).split(",")).map((x) => x.trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function nextVoucherNo() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const prefix = `JV-${y}${m}${d}-`;
  const latest = await JournalEntry.findOne({ voucherNo: new RegExp(`^${prefix}`) })
    .sort({ voucherNo: -1 })
    .lean();
  let seq = 1;
  if (latest?.voucherNo) {
    const part = latest.voucherNo.split("-").pop();
    const parsed = Number(part);
    if (!Number.isNaN(parsed)) seq = parsed + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

async function getEntriesInRange({ start, end, companyId, companyName, voucherType, status = "POSTED", bookType }) {
    const filter = { date: { $gte: start, $lte: end } };
    if (status) filter.status = status;
    if (companyId) filter.companyId = companyId;
    else if (companyName) {
      filter.$or = [{ companyId: companyName }, { companyName }];
    }
    if (Array.isArray(voucherType)) {
      if (voucherType.length) filter.voucherType = { $in: voucherType };
    } else if (voucherType) {
      filter.voucherType = voucherType;
    }
    if (Array.isArray(bookType) && bookType.length) filter.bookType = { $in: bookType };
    else if (bookType) filter.bookType = bookType;
    return await JournalEntry.find(filter).sort({ date: 1, createdAt: 1 }).lean();
  }

async function getLinesForEntries(entryIds, extraFilter = {}) {
  if (!entryIds?.length) return [];
  return await JournalLine.find({ journalEntryId: { $in: entryIds }, ...extraFilter }).lean();
}

async function getAccountMapForLines(lines) {
  const ids = [...new Set((lines || []).map((l) => String(l.accountId)))].filter(Boolean);
  if (!ids.length) return new Map();
  const accounts = await Account.find({ _id: { $in: ids } }).lean();
  return new Map(accounts.map((a) => [String(a._id), a]));
}

// -------------------- ENTITIES (MULTI-COMPANY) --------------------

exports.getEntities = async (_req, res) => {
  try {
    const includeInactive = String(_req.query?.includeInactive || "").toLowerCase();
    const filter = includeInactive === "1" || includeInactive === "true" ? {} : { isActive: true };
    const rows = await AccountingEntity.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load companies." });
  }
};

exports.createEntity = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Company name is required." });
    const doc = await AccountingEntity.create({ name });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to create company." });
  }
};

exports.updateEntity = async (req, res) => {
  try {
    const { id } = req.params;
    const name = String(req.body?.name || "").trim();
    const isActive = req.body?.isActive;
    const patch = {};
    if (name) patch.name = name;
    if (isActive != null) patch.isActive = !!isActive;
    const doc = await AccountingEntity.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Company not found." });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to update company." });
  }
};

exports.deleteEntity = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await AccountingEntity.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Company not found." });
    res.json({ success: true, message: "Company deleted." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to delete company." });
  }
};

// -------------------- PARTIES (CUSTOMER/SUPPLIER) --------------------

exports.getParties = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const partyType = String(req.query.partyType || "").trim();
    const includeInactive = String(req.query.includeInactive || "").toLowerCase();
    const filter = includeInactive === "1" || includeInactive === "true" ? {} : { isActive: true };
    if (partyType) filter.partyType = partyType;
    if (q) filter.name = new RegExp(escRe(q), "i");
    const rows = await AccountingParty.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load parties." });
  }
};

exports.createParty = async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Party name is required." });
    const doc = await AccountingParty.create({
      name,
      partyType: body.partyType || "OTHER",
      phone: String(body.phone || "").trim(),
      address: String(body.address || "").trim(),
      email: String(body.email || "").trim(),
      isActive: body.isActive !== false,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to create party." });
  }
};

exports.updateParty = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const current = await AccountingParty.findById(id).lean();
    if (!current) return res.status(404).json({ success: false, message: "Party not found." });
    if (current.sourceType && current.sourceType !== "MANUAL") {
      return res.status(400).json({
        success: false,
        message: "Synced parties cannot be edited. Update the Customer instead.",
      });
    }
    const patch = {};
    if (body.name != null) patch.name = String(body.name || "").trim();
    if (body.partyType != null) patch.partyType = body.partyType;
    if (body.phone != null) patch.phone = String(body.phone || "").trim();
    if (body.address != null) patch.address = String(body.address || "").trim();
    if (body.email != null) patch.email = String(body.email || "").trim();
    if (body.isActive != null) patch.isActive = !!body.isActive;
    const doc = await AccountingParty.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Party not found." });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to update party." });
  }
};

exports.deleteParty = async (req, res) => {
  try {
    const { id } = req.params;
    const current = await AccountingParty.findById(id).lean();
    if (!current) return res.status(404).json({ success: false, message: "Party not found." });
    if (current.sourceType && current.sourceType !== "MANUAL") {
      return res.status(400).json({ success: false, message: "Synced parties cannot be deleted." });
    }
    const doc = await AccountingParty.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Party not found." });
    res.json({ success: true, message: "Party deleted." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to delete party." });
  }
};

// -------------------- PRODUCTS (OPTIONAL DIMENSION) --------------------

exports.getProducts = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const includeInactive = String(req.query.includeInactive || "").toLowerCase();
    const filter = includeInactive === "1" || includeInactive === "true" ? {} : { isActive: true };
    if (q) filter.name = new RegExp(escRe(q), "i");
    const rows = await AccountingProduct.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load products." });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Product name is required." });
    const doc = await AccountingProduct.create({
      name,
      unit: String(body.unit || "").trim(),
      sku: String(body.sku || "").trim(),
      isActive: body.isActive !== false,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to create product." });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const current = await AccountingProduct.findById(id).lean();
    if (!current) return res.status(404).json({ success: false, message: "Product not found." });
    if (current.sourceProductTypeId) {
      return res.status(400).json({
        success: false,
        message: "Synced products cannot be edited. Update Product Types instead.",
      });
    }
    const patch = {};
    if (body.name != null) patch.name = String(body.name || "").trim();
    if (body.unit != null) patch.unit = String(body.unit || "").trim();
    if (body.sku != null) patch.sku = String(body.sku || "").trim();
    if (body.isActive != null) patch.isActive = !!body.isActive;
    const doc = await AccountingProduct.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Product not found." });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to update product." });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const current = await AccountingProduct.findById(id).lean();
    if (!current) return res.status(404).json({ success: false, message: "Product not found." });
    if (current.sourceProductTypeId) {
      return res.status(400).json({ success: false, message: "Synced products cannot be deleted." });
    }
    const doc = await AccountingProduct.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Product not found." });
    res.json({ success: true, message: "Product deleted." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to delete product." });
  }
};

// -------------------- MASTER SYNC (CUSTOMERS/PRODUCT TYPES) --------------------

exports.syncPartiesFromMasters = async (_req, res) => {
  try {
    const result = await syncPartiesFromMasters();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || "Failed to sync parties." });
  }
};

exports.syncProductsFromProductTypes = async (_req, res) => {
  try {
    const result = await syncProductsFromProductTypes();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || "Failed to sync products." });
  }
};

// -------------------- FILTER TEMPLATES --------------------

exports.getFilterTemplates = async (req, res) => {
  try {
    const reportKey = String(req.query.reportKey || "").trim();
    const companyId = String(req.query.companyId || "").trim();
    const filter = { isActive: true };
    if (reportKey) filter.reportKey = reportKey;
    if (companyId) filter.companyId = companyId;
    const rows = await AccountingFilterTemplate.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load templates." });
  }
};

exports.createFilterTemplate = async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const reportKey = String(body.reportKey || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Template name is required." });
    if (!reportKey) return res.status(400).json({ success: false, message: "reportKey is required." });
    const doc = await AccountingFilterTemplate.create({
      name,
      reportKey,
      companyId: String(body.companyId || "").trim(),
      filters: body.filters || {},
      createdBy: body.createdBy || "user",
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to create template." });
  }
};

exports.deleteFilterTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await AccountingFilterTemplate.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Template not found." });
    res.json({ success: true, message: "Template deleted." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to delete template." });
  }
};

exports.getGeneratedJournals = async (req, res) => {
  try {
    const reportKey = String(req.query.reportKey || "").trim();
    const query = {};
    if (reportKey) {
      if (reportKey === "journal") {
        query.$or = [{ reportKey }, { reportKey: { $exists: false } }];
      } else {
        query.reportKey = reportKey;
      }
    }
    const rows = await AccountingGeneratedJournal.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load generated journals." });
  }
};

exports.createGeneratedJournal = async (req, res) => {
  try {
    const payload = req.body || {};
    const name = String(payload.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Name is required." });
    const doc = await AccountingGeneratedJournal.create({
      name,
      range: String(payload.range || "all"),
      rangeDate: String(payload.rangeDate || ""),
      startDate: String(payload.startDate || ""),
      endDate: String(payload.endDate || ""),
      companyId: String(payload.companyId || ""),
      companyName: String(payload.companyName || ""),
      accountId: String(payload.accountId || ""),
      accountName: String(payload.accountName || ""),
      partyName: String(payload.partyName || ""),
      itemId: String(payload.itemId || ""),
      itemName: String(payload.itemName || ""),
      voucherType: String(payload.voucherType || ""),
      reportKey: String(payload.reportKey || "journal"),
      customLayout: payload.customLayout ?? [],
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to create generated journal." });
  }
};

exports.updateGeneratedJournal = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    const patch = {};
    if (payload.name != null) patch.name = String(payload.name || "").trim();
    if (payload.customLayout != null) patch.customLayout = payload.customLayout;

    const doc = await AccountingGeneratedJournal.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Generated report not found." });
    return res.json({ success: true, data: doc });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message || "Unable to update generated report." });
  }
};

exports.deleteGeneratedJournal = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await AccountingGeneratedJournal.findByIdAndDelete(id).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Generated journal not found." });
    res.json({ success: true, message: "Generated journal deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Unable to delete generated journal." });
  }
};

// -------------------- REPORTS (MANUAL JOURNALS ONLY) --------------------

exports.getLedger = async (req, res) => {
  try {
    const { start, end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const companyName = String(req.query.companyName || "").trim();
    const accountIds = parseListParam(req.query.accountId || req.query.accountIds);
    const partyIds = parseListParam(req.query.partyId || req.query.partyIds);
    const productIds = parseListParam(req.query.productId || req.query.productIds || req.query.itemId || req.query.itemIds);
    const party = String(req.query.party || "").trim(); // legacy name filter
    const item = String(req.query.item || "").trim(); // legacy product name filter
    const tags = parseListParam(req.query.tag || req.query.tags);

    const entries = await getEntriesInRange({ start, end, companyId, companyName, status: "POSTED" });
    const entryMap = new Map(entries.map((e) => [String(e._id), e]));
    const lines = await getLinesForEntries(entries.map((e) => e._id), {
      ...(accountIds.length ? { accountId: { $in: accountIds } } : {}),
      ...(partyIds.length ? { partyId: { $in: partyIds } } : {}),
      ...(productIds.length ? { itemId: { $in: productIds } } : {}),
      ...(tags.length ? { tags: { $in: tags } } : {}),
      ...(party ? { partyName: new RegExp(escRe(party), "i") } : {}),
      ...(item ? { itemName: new RegExp(escRe(item), "i") } : {}),
    });

    let allLinesForRefs = null;
    let refByEntryId = new Map();
    const useRefs = accountIds.length === 1;
    if (useRefs) {
      allLinesForRefs = await getLinesForEntries(entries.map((e) => e._id));
      const allAccountMap = await getAccountMapForLines(allLinesForRefs);
      const selectedId = String(accountIds[0]);
      const bucket = new Map(); // entryId -> { debitRefs:[], creditRefs:[] }
      allLinesForRefs.forEach((l) => {
        const jeId = String(l.journalEntryId);
        if (String(l.accountId) === selectedId) return;
        const acc = allAccountMap.get(String(l.accountId));
        if (!acc) return;
        const row = bucket.get(jeId) || { debitRefs: new Set(), creditRefs: new Set() };
        if (toNum(l.debit) > 0) row.debitRefs.add(acc.name);
        if (toNum(l.credit) > 0) row.creditRefs.add(acc.name);
        bucket.set(jeId, row);
      });
      refByEntryId = new Map(
        Array.from(bucket.entries()).map(([k, v]) => [
          k,
          {
            debitRefs: Array.from(v.debitRefs.values()),
            creditRefs: Array.from(v.creditRefs.values()),
          },
        ])
      );
    }

    const accountMap = await getAccountMapForLines(lines);

    const rows = lines
      .map((l) => {
        const je = entryMap.get(String(l.journalEntryId));
        const acc = accountMap.get(String(l.accountId));
        const refs = useRefs ? refByEntryId.get(String(l.journalEntryId)) : null;
        const references = useRefs
          ? toNum(l.debit) > 0
            ? (refs?.creditRefs || []).join(", ")
            : (refs?.debitRefs || []).join(", ")
          : "";
        return {
          journalEntryId: String(l.journalEntryId),
          journalLineId: String(l._id),
          date: je?.date || new Date(),
          voucherNo: je?.voucherNo || "",
          description: je?.description || je?.narration || "",
          accountId: String(l.accountId),
          account: acc?.name || "Account",
          references,
          debit: round2(l.debit),
          credit: round2(l.credit),
          partyId: l.partyId ? String(l.partyId) : "",
          party: l.partyName || "",
          productId: l.itemId ? String(l.itemId) : "",
          product: l.itemName || "",
          remarks: l.remarks || "",
          tags: Array.isArray(l.tags) ? l.tags : [],
        };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = 0;
    const withRunning = rows.map((r) => {
      running += toNum(r.debit) - toNum(r.credit);
      return { ...r, balance: round2(running) };
    });

    res.json({ success: true, data: withRunning });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load ledger." });
  }
};

exports.getTrialBalance = async (req, res) => {
  try {
    const { start, end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const voucherTypes = parseListParam(req.query.voucherType || req.query.voucherTypes);
    const bookTypes = parseListParam(req.query.bookType || req.query.bookTypes);
    const companyName = String(req.query.companyName || "").trim();
    const voucherNo = String(req.query.voucherNo || "").trim();
    const accountIds = parseListParam(req.query.accountId || req.query.accountIds);

    const entryFilter = { date: { $gte: start, $lte: end }, status: "POSTED" };
    if (companyId) entryFilter.companyId = companyId;
    if (voucherTypes.length) entryFilter.voucherType = { $in: voucherTypes };
    if (bookTypes.length) entryFilter.bookType = { $in: bookTypes };
    if (companyName) entryFilter.companyName = new RegExp(escRe(companyName), "i");
    if (voucherNo) entryFilter.voucherNo = new RegExp(escRe(voucherNo), "i");
    const entries = await JournalEntry.find(entryFilter).lean();
    const lines = await getLinesForEntries(entries.map((e) => e._id), {
      ...(accountIds.length ? { accountId: { $in: accountIds } } : {}),
    });

    const accounts = await Account.find({}).lean();
    const accountMap = new Map(accounts.map((a) => [String(a._id), a]));

    const bucket = new Map();
    lines.forEach((l) => {
      const acc = accountMap.get(String(l.accountId));
      if (!acc) return;
      const key = String(acc._id);
      const row = bucket.get(key) || {
        accountId: key,
        code: acc.code,
        account: acc.name,
        type: acc.type,
        debit: 0,
        credit: 0,
      };
      row.debit += toNum(l.debit);
      row.credit += toNum(l.credit);
      bucket.set(key, row);
    });

    const data = Array.from(bucket.values())
      .map((r) => {
        const debitTotal = toNum(r.debit);
        const creditTotal = toNum(r.credit);
        const balance = debitTotal - creditTotal;
        const debit = balance > 0 ? balance : 0;
        const credit = balance < 0 ? Math.abs(balance) : 0;
        return { ...r, debit: round2(debit), credit: round2(credit) };
      })
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));

    const totalDebit = round2(data.reduce((s, r) => s + toNum(r.debit), 0));
    const totalCredit = round2(data.reduce((s, r) => s + toNum(r.credit), 0));

    res.json({ success: true, data, totals: { totalDebit, totalCredit } });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load trial balance." });
  }
};

exports.getProfitLoss = async (req, res) => {
  try {
    const { start, end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const voucherType = parseListParam(req.query.voucherType || req.query.voucherTypes);
    const accountIds = parseListParam(req.query.accountId || req.query.accountIds);
    const partyIds = parseListParam(req.query.partyId || req.query.partyIds);
    const partyNames = parseListParam(req.query.partyName || req.query.partyNames || req.query.party);
    const productIds = parseListParam(req.query.productId || req.query.productIds || req.query.itemId || req.query.itemIds);
    const itemNames = parseListParam(req.query.itemName || req.query.itemNames || req.query.item);
    const tags = parseListParam(req.query.tag || req.query.tags);

    const entries = await getEntriesInRange({ start, end, companyId, voucherType, status: "POSTED" });
    const lines = await getLinesForEntries(entries.map((e) => e._id), {
      ...(accountIds.length ? { accountId: { $in: accountIds } } : {}),
      ...(partyIds.length ? { partyId: { $in: partyIds } } : {}),
      ...(productIds.length ? { itemId: { $in: productIds } } : {}),
      ...(tags.length ? { tags: { $in: tags } } : {}),
      ...(partyNames.length ? { partyName: { $in: partyNames } } : {}),
      ...(itemNames.length ? { itemName: { $in: itemNames } } : {}),
    });
    const accountMap = await getAccountMapForLines(lines);

    const byAccount = new Map();
    lines.forEach((l) => {
      const acc = accountMap.get(String(l.accountId));
      if (!acc) return;
      const k = String(acc._id);
      const row = byAccount.get(k) || {
        accountId: k,
        code: acc.code,
        account: acc.name,
        type: acc.type,
        subType: acc.subType || "",
        tags: Array.isArray(acc.tags) ? acc.tags : [],
        debit: 0,
        credit: 0,
      };
      row.debit += toNum(l.debit);
      row.credit += toNum(l.credit);
      byAccount.set(k, row);
    });

    const income = [];
    const expenses = [];
    const cogs = [];
    byAccount.forEach((r) => {
      const netIncome = toNum(r.credit) - toNum(r.debit);
      const netExpense = toNum(r.debit) - toNum(r.credit);
      if (r.type === "INCOME") income.push({ ...r, amount: round2(netIncome) });
      else if (r.type === "COGS") cogs.push({ ...r, amount: round2(netExpense) });
      else if (r.type === "EXPENSE") expenses.push({ ...r, amount: round2(netExpense) });
    });

    const incomeTotal = round2(income.reduce((s, r) => s + toNum(r.amount), 0));
    const cogsTotal = round2(cogs.reduce((s, r) => s + toNum(r.amount), 0));
    const expenseTotal = round2(expenses.reduce((s, r) => s + toNum(r.amount), 0));
    const grossProfit = round2(incomeTotal - cogsTotal);
    const profit = round2(grossProfit - expenseTotal);

    res.json({
      success: true,
      data: {
        income: income.sort((a, b) => String(a.code || a.account || "").localeCompare(String(b.code || b.account || ""))),
        cogs: cogs.sort((a, b) => String(a.code || a.account || "").localeCompare(String(b.code || b.account || ""))),
        expenses: expenses.sort((a, b) => String(a.code || a.account || "").localeCompare(String(b.code || b.account || ""))),
        totals: { incomeTotal, cogsTotal, expenseTotal, grossProfit, profit },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load P&L." });
  }
};

exports.getBalanceSheet = async (req, res) => {
  try {
    const { end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const voucherTypes = parseListParam(req.query.voucherType || req.query.voucherTypes);
    const accountIds = parseListParam(req.query.accountId || req.query.accountIds);
    const partyIds = parseListParam(req.query.partyId || req.query.partyIds);
    const partyNames = parseListParam(req.query.partyName || req.query.partyNames || req.query.party);
    const productIds = parseListParam(req.query.productId || req.query.productIds || req.query.itemId || req.query.itemIds);
    const itemNames = parseListParam(req.query.itemName || req.query.itemNames || req.query.item);
    const tags = parseListParam(req.query.tag || req.query.tags);

    const entryFilter = { date: { $lte: end }, status: "POSTED" };
    if (companyId) entryFilter.companyId = companyId;
    if (voucherTypes.length) entryFilter.voucherType = { $in: voucherTypes };
    const entries = await JournalEntry.find(entryFilter).lean();
    const lines = await getLinesForEntries(entries.map((e) => e._id), {
      ...(accountIds.length ? { accountId: { $in: accountIds } } : {}),
      ...(partyIds.length ? { partyId: { $in: partyIds } } : {}),
      ...(productIds.length ? { itemId: { $in: productIds } } : {}),
      ...(tags.length ? { tags: { $in: tags } } : {}),
      ...(partyNames.length ? { partyName: { $in: partyNames } } : {}),
      ...(itemNames.length ? { itemName: { $in: itemNames } } : {}),
    });
    const accountMap = await getAccountMapForLines(lines);

    const balances = new Map(); // accountId -> { ...acc, balance }
    lines.forEach((l) => {
      const acc = accountMap.get(String(l.accountId));
      if (!acc) return;
      const k = String(acc._id);
      const prev = balances.get(k) || {
        accountId: k,
        code: acc.code,
        account: acc.name,
        type: acc.type,
        subType: acc.subType || "",
        balance: 0,
      };
      // Assets: debit-credit. Liab/Equity/AP: credit-debit. Income/Expense excluded from BS.
      let delta = toNum(l.debit) - toNum(l.credit);
      if (balanceSheetType(acc.type) === "LIABILITY" || acc.type === "EQUITY") delta = -delta;
      prev.balance += delta;
      balances.set(k, prev);
    });

    const rows = Array.from(balances.values())
      .map((r) => ({ ...r, balance: round2(r.balance) }))
      .filter((r) => ["ASSET", "LIABILITY", "EQUITY"].includes(balanceSheetType(r.type)));

    const assets = rows.filter((r) => balanceSheetType(r.type) === "ASSET").sort((a, b) => String(a.code || a.account || "").localeCompare(String(b.code || b.account || "")));
    const liabilities = rows.filter((r) => balanceSheetType(r.type) === "LIABILITY").sort((a, b) => String(a.code || a.account || "").localeCompare(String(b.code || b.account || "")));
    const equity = rows.filter((r) => r.type === "EQUITY").sort((a, b) => String(a.code || a.account || "").localeCompare(String(b.code || b.account || "")));

    const totalAssets = round2(assets.reduce((s, r) => s + toNum(r.balance), 0));
    const totalLiabilities = round2(liabilities.reduce((s, r) => s + toNum(r.balance), 0));
    const totalEquity = round2(equity.reduce((s, r) => s + toNum(r.balance), 0));

    res.json({
      success: true,
      data: {
        asOf: end,
        assets,
        liabilities,
        equity,
        totals: { totalAssets, totalLiabilities, totalEquity, totalLE: round2(totalLiabilities + totalEquity) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load balance sheet." });
  }
};

exports.getCashFlow = async (req, res) => {
  try {
    await ensureDefaultAccounts();
    const { start, end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const companyName = String(req.query.companyName || "").trim();

    const cashAccounts = await Account.find({
      isActive: true,
      subType: { $in: ["CASH", "BANK"] },
    })
      .select("_id name subType code")
      .lean();

    if (!cashAccounts.length) {
      return res.json({
        success: true,
        data: { rows: [], totals: { cashIn: 0, cashOut: 0, netCashFlow: 0, cashInHand: 0 } },
      });
    }

    const accountMap = new Map(cashAccounts.map((a) => [String(a._id), a]));
    const accountIds = cashAccounts.map((a) => String(a._id));

    const entries = await getEntriesInRange({
      start,
      end,
      companyId,
      companyName,
      status: "POSTED",
    });
    const entryIds = entries.map((e) => e._id);
    const lines = await getLinesForEntries(entryIds, { accountId: { $in: accountIds } });

    const bucket = new Map();
    lines.forEach((l) => {
      const id = String(l.accountId || "");
      if (!id || !accountMap.has(id)) return;
      const acc = accountMap.get(id);
      const row = bucket.get(id) || {
        accountId: id,
        accountName: acc?.name || "",
        subType: acc?.subType || "",
        cashIn: 0,
        cashOut: 0,
        net: 0,
      };
      row.cashIn += toNum(l.debit);
      row.cashOut += toNum(l.credit);
      row.net = row.cashIn - row.cashOut;
      bucket.set(id, row);
    });

    const rows = Array.from(bucket.values())
      .map((r) => ({
        ...r,
        cashIn: round2(r.cashIn),
        cashOut: round2(r.cashOut),
        net: round2(r.net),
      }))
      .sort((a, b) => String(a.accountName || "").localeCompare(String(b.accountName || "")));

    const cashIn = round2(rows.reduce((s, r) => s + toNum(r.cashIn), 0));
    const cashOut = round2(rows.reduce((s, r) => s + toNum(r.cashOut), 0));
    const netCashFlow = round2(cashIn - cashOut);

    const cashOnlyIds = cashAccounts
      .filter((a) => String(a.subType || "").toUpperCase() === "CASH")
      .map((a) => String(a._id));
    let cashInHand = 0;
    if (cashOnlyIds.length) {
      const allEntries = await getEntriesInRange({
        start: new Date(0),
        end,
        companyId,
        companyName,
        status: "POSTED",
      });
      const cashLines = await getLinesForEntries(allEntries.map((e) => e._id), { accountId: { $in: cashOnlyIds } });
      cashInHand = round2(cashLines.reduce((s, l) => s + toNum(l.debit) - toNum(l.credit), 0));
    }

    res.json({
      success: true,
      data: {
        rows,
        totals: {
          cashIn,
          cashOut,
          netCashFlow,
          cashInHand,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load cash flow." });
  }
};

exports.getPartyLedger = async (req, res) => {
  try {
    const { start, end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const voucherType = parseListParam(req.query.voucherType || req.query.voucherTypes);

    const entries = await getEntriesInRange({ start, end, companyId, voucherType, status: "POSTED" });
    const lines = await getLinesForEntries(entries.map((e) => e._id));

    const bucket = new Map();
    lines.forEach((l) => {
      const name = String(l.partyName || "").trim();
      if (!name) return;
      const row = bucket.get(name) || { party: name, totalDebit: 0, totalCredit: 0, balance: 0 };
      row.totalDebit += toNum(l.debit);
      row.totalCredit += toNum(l.credit);
      row.balance = row.totalDebit - row.totalCredit;
      bucket.set(name, row);
    });

    const data = Array.from(bucket.values())
      .map((r) => ({
        ...r,
        totalDebit: round2(r.totalDebit),
        totalCredit: round2(r.totalCredit),
        balance: round2(r.balance),
      }))
      .sort((a, b) => a.party.localeCompare(b.party));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load party ledger." });
  }
};

// -------------------- ACCOUNTS --------------------

exports.getAccounts = async (_req, res) => {
  try {
    await ensureAccountCodeIndex();
    const data = await Account.find({ type: { $in: MANUAL_ACCOUNT_TYPES } }).lean();
    data.sort((a, b) => accountSortKey(a).localeCompare(accountSortKey(b)));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load accounts." });
  }
};

exports.createAccount = async (req, res) => {
  try {
    await ensureAccountCodeIndex();
    const payload = req.body || {};
    const name = String(payload.name || "").trim();
    const type = normalizeAccountType(payload.type);
    const createdOn = parseAccountCreatedOn(payload.createdOn);
    if (!name) return res.status(400).json({ success: false, message: "Account name is required." });
    if (!MANUAL_ACCOUNT_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: "Account type must be Expense, Income, or Account Payable." });
    }
    if (!createdOn) return res.status(400).json({ success: false, message: "Created On date is invalid." });
    const doc = await Account.create({
      name,
      createdOn,
      type,
      subType: "",
      parentAccountId: null,
      isControl: false,
      isActive: true,
      journalSide: "BOTH",
      tags: [],
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to create account." });
  }
};

exports.updateAccount = async (req, res) => {
  try {
    await ensureAccountCodeIndex();
    const { id } = req.params;
    const payload = req.body || {};
    const patch = {};
    if (payload.name != null) {
      const name = String(payload.name || "").trim();
      if (!name) return res.status(400).json({ success: false, message: "Account name is required." });
      patch.name = name;
    }
    if (payload.type != null) {
      const type = normalizeAccountType(payload.type);
      if (!MANUAL_ACCOUNT_TYPES.includes(type)) {
        return res.status(400).json({ success: false, message: "Account type must be Expense, Income, or Account Payable." });
      }
      patch.type = type;
      patch.subType = "";
    }
    if (payload.createdOn != null) {
      const createdOn = parseAccountCreatedOn(payload.createdOn);
      if (!createdOn) return res.status(400).json({ success: false, message: "Created On date is invalid." });
      patch.createdOn = createdOn;
    }
    if (payload.isActive != null) patch.isActive = !!payload.isActive;
    patch.parentAccountId = null;
    patch.isControl = false;
    patch.journalSide = "BOTH";
    const doc = await Account.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Account not found." });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to update account." });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Account.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Account not found." });
    res.json({ success: true, message: "Account deleted." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to delete account." });
  }
};

// -------------------- JOURNAL / VOUCHERS --------------------

exports.postManualJournal = async (req, res) => {
  try {
    await ensureDefaultAccounts();
    const body = req.body || {};
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const companyId = String(body.companyId || "").trim();
    const companyName = String(body.companyName || "").trim();
    if (!companyId || !companyName) {
      return res.status(400).json({ success: false, message: "Company is required." });
    }
    const entry = await postJournalEntry({
      date: body.date || new Date(),
      voucherType: body.voucherType || "JOURNAL",
      bookType: body.bookType || "JOURNAL",
      companyId,
      companyName,
      referenceNo: String(body.referenceNo || "").trim(),
      description: String(body.description || "").trim(),
      narration: body.narration || "Manual journal",
      createdBy: body.createdBy || "user",
      sourceModule: "MANUAL",
      sourceRefType: "MANUAL",
      sourceRefId: String(Date.now()),
      lines,
    });
    if (!entry) {
      return res.status(400).json({ success: false, message: "No valid lines to post." });
    }
    const savedLines = await JournalLine.find({ journalEntryId: entry._id }).lean();
    res.status(201).json({
      success: true,
      data: {
        ...entry.toObject?.() ? entry.toObject() : entry,
        lines: savedLines,
      },
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to post journal." });
  }
};

function summarizeEntryAmount(lines) {
  const totalDebit = round2((lines || []).reduce((s, l) => s + toNum(l?.debit), 0));
  const totalCredit = round2((lines || []).reduce((s, l) => s + toNum(l?.credit), 0));
  return { totalDebit, totalCredit, amount: round2(Math.max(totalDebit, totalCredit)) };
}

function isCashAccount(account = {}) {
  return (
    String(account?.subType || "").toUpperCase() === "CASH" ||
    /^\s*cash(\s+in\s+hand)?\s*$/i.test(String(account?.name || ""))
  );
}

function getCashEffectForLines(lines = [], accountMap = new Map()) {
  return round2(
    (lines || []).reduce((sum, line) => {
      const account = accountMap.get(String(line.accountId));
      if (!isCashAccount(account)) return sum;
      return sum + toNum(line.debit) - toNum(line.credit);
    }, 0)
  );
}

async function loadEntryWithLines(entry) {
  if (!entry) return null;
  const lines = await JournalLine.find({ journalEntryId: entry._id }).lean();
  const accountMap = await getAccountMapForLines(lines);
  const withNames = lines.map((l) => ({
    ...l,
    accountCode: accountMap.get(String(l.accountId))?.code || "",
    accountName: accountMap.get(String(l.accountId))?.name || "",
    accountType: accountMap.get(String(l.accountId))?.type || "",
    accountSubType: accountMap.get(String(l.accountId))?.subType || "",
  }));
  const sums = summarizeEntryAmount(withNames);
  return { ...(entry.toObject?.() ? entry.toObject() : entry), lines: withNames, ...sums };
}

// Cascade recalculate cash-in-hand for all POSTED entries in chronological order.
// When { renumber: true } (default), also fixes entryNo in chronological order.
// When called from delete, pass { renumber: false } to keep existing entryNo intact.
async function cascadeCashInHand({ renumber = true } = {}) {
  const entries = await JournalEntry.find({ status: "POSTED" }).sort({ date: 1, createdAt: 1 }).lean();
  if (!entries.length) return;

  const allLines = await JournalLine.find({
    journalEntryId: { $in: entries.map((e) => e._id) },
  }).lean();
  const accountMap = await getAccountMapForLines(allLines);

  // Group lines by entryId
  const linesByEntry = new Map();
  allLines.forEach((line) => {
    const key = String(line.journalEntryId);
    const arr = linesByEntry.get(key) || [];
    arr.push(line);
    linesByEntry.set(key, arr);
  });

  let runningCash = 0;
  const resolvedCashInHand = new Map();

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const entryLines = linesByEntry.get(String(e._id)) || [];
    const cashEffect = getCashEffectForLines(entryLines, accountMap);
    const correctEntryNo = i + 1;

    if (i === 0) {
      resolvedCashInHand.set(String(e._id), round2(toNum(e.cashInHand)));
      runningCash = round2(toNum(e.cashInHand) + cashEffect);
      if (renumber && e.entryNo !== correctEntryNo) {
        await JournalEntry.updateOne({ _id: e._id }, { $set: { entryNo: correctEntryNo } });
      }
      continue;
    }

    const prevId = String(entries[i - 1]._id);
    const prevCashInHand = resolvedCashInHand.get(prevId);
    const prevLines = linesByEntry.get(prevId) || [];
    const prevCashEffect = getCashEffectForLines(prevLines, accountMap);
    const previousCashAfterEntry = round2(prevCashInHand + prevCashEffect);

    if (String(e.cashInHandSource) === "MANUAL_EDIT") {
      resolvedCashInHand.set(String(e._id), round2(toNum(e.cashInHand)));
      runningCash = round2(toNum(e.cashInHand) + cashEffect);
      if (renumber && e.entryNo !== correctEntryNo) {
        await JournalEntry.updateOne({ _id: e._id }, { $set: { entryNo: correctEntryNo } });
      }
      continue;
    }

    const newCashInHand = previousCashAfterEntry;
    resolvedCashInHand.set(String(e._id), newCashInHand);

    const cashChanged = round2(toNum(e.cashInHand)) !== newCashInHand;
    const entryNoChanged = renumber && e.entryNo !== correctEntryNo;

    if (cashChanged || entryNoChanged) {
      const update = {};
      if (cashChanged) {
        update.cashInHand = newCashInHand;
        update.cashInHandSource = "CARRIED";
      }
      if (entryNoChanged) {
        update.entryNo = correctEntryNo;
      }
      await JournalEntry.updateOne({ _id: e._id }, { $set: update });
    }
    runningCash = round2(newCashInHand + cashEffect);
  }
}

exports.getLatestCashInHand = async (_req, res) => {
  try {
    const entry = await JournalEntry.findOne({ status: "POSTED" }).sort({ date: -1, createdAt: -1 }).lean();
    if (!entry) {
      return res.json({ success: true, data: { hasEntry: false, cashInHand: 0, cashAfterEntry: 0 } });
    }
    const lines = await JournalLine.find({ journalEntryId: entry._id }).lean();
    const accountMap = await getAccountMapForLines(lines);
    const cashEffect = getCashEffectForLines(lines, accountMap);
    const cashAfterEntry = round2(toNum(entry.cashInHand) + cashEffect);
    res.json({
      success: true,
      data: {
        hasEntry: true,
        journalEntryId: entry._id,
        voucherNo: entry.voucherNo,
        cashInHand: round2(entry.cashInHand),
        cashEffect,
        cashAfterEntry,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load cash in hand." });
  }
};

exports.getVouchers = async (req, res) => {
  try {
    const { start, end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const voucherTypes = parseListParam(req.query.voucherType || req.query.voucherTypes);
    const accountIds = parseListParam(req.query.accountId || req.query.accountIds);
    const partyIds = parseListParam(req.query.partyId || req.query.partyIds);
    const partyNames = parseListParam(req.query.partyName || req.query.partyNames);
    const partyName = partyNames.length ? "" : String(req.query.partyName || "").trim();
    const itemIds = parseListParam(req.query.itemId || req.query.itemIds || req.query.productId || req.query.productIds);
    const itemName = String(req.query.itemName || "").trim();
    const voucherNo = String(req.query.voucherNo || "").trim();

    // Pagination
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || "500", 10)));
    const skip = (page - 1) * limit;

    const entryFilter = { date: { $gte: start, $lte: end } };
    if (companyId) entryFilter.companyId = companyId;
    if (voucherTypes.length) entryFilter.voucherType = { $in: voucherTypes };
    if (req.query.status) entryFilter.status = String(req.query.status);
    if (voucherNo) entryFilter.voucherNo = new RegExp(escRe(voucherNo), "i");

    const hasLineFilters = accountIds.length || partyIds.length || !!partyName || itemIds.length || !!itemName;

    // Only fetch fields needed for list view (exclude heavy cashInHandHistory)
    const entrySelect = "entryNo voucherNo date voucherType bookType companyId companyName referenceNo cashInHand cashInHandSource cashInHandEdited cashInHandHistory narration description status createdAt updatedAt";

    let filteredEntries;
    let total;

    if (hasLineFilters) {
      // Line filters active: fetch all entries, filter by lines, then paginate in memory
      const allEntries = await JournalEntry.find(entryFilter).select(entrySelect).sort({ date: -1, createdAt: -1 }).lean();

      const lineFilter = { journalEntryId: { $in: allEntries.map((e) => e._id) } };
      if (accountIds.length) lineFilter.accountId = { $in: accountIds };
      if (partyIds.length) lineFilter.partyId = { $in: partyIds };
      if (partyName) lineFilter.partyName = new RegExp(escRe(partyName), "i");
      if (itemIds.length) lineFilter.itemId = { $in: itemIds };
      if (itemName) lineFilter.itemName = new RegExp(escRe(itemName), "i");

      const matchingLines = await JournalLine.find(lineFilter).select("journalEntryId debit credit").lean();
      const matchingIds = new Set(matchingLines.map((l) => String(l.journalEntryId)));

      filteredEntries = allEntries.filter((e) => matchingIds.has(String(e._id)));
      total = filteredEntries.length;
      filteredEntries = filteredEntries.slice(skip, skip + limit);
    } else {
      // No line filters: paginate at DB level (most efficient)
      total = await JournalEntry.countDocuments(entryFilter);
      filteredEntries = await JournalEntry.find(entryFilter)
        .select(entrySelect)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    }

    // Only fetch lines for the paginated entries (huge perf gain)
    const pageEntryIds = filteredEntries.map((e) => e._id);
    const allLinesForCash = await JournalLine.find({ journalEntryId: { $in: pageEntryIds } }).lean();
    const cashAccountMap = await getAccountMapForLines(allLinesForCash);
    const cashBucket = new Map();
    const bucket = new Map();
    allLinesForCash.forEach((line) => {
      const key = String(line.journalEntryId);
      const prev = cashBucket.get(key) || [];
      prev.push(line);
      cashBucket.set(key, prev);

      const row = bucket.get(key) || { debit: 0, credit: 0 };
      row.debit += toNum(line.debit);
      row.credit += toNum(line.credit);
      bucket.set(key, row);
    });

    const data = filteredEntries.map((e, idx) => {
      const t = bucket.get(String(e._id)) || { debit: 0, credit: 0 };
      const entryLines = cashBucket.get(String(e._id)) || [];
      const cashEffect = getCashEffectForLines(entryLines, cashAccountMap);
      const linesWithNames = entryLines.map((l) => ({
        ...l,
        accountCode: cashAccountMap.get(String(l.accountId))?.code || "",
        accountName: cashAccountMap.get(String(l.accountId))?.name || "",
        accountType: cashAccountMap.get(String(l.accountId))?.type || "",
        accountSubType: cashAccountMap.get(String(l.accountId))?.subType || "",
      }));
      return {
        _id: e._id,
        entryNo: e.entryNo || idx + 1,
        voucherNo: e.voucherNo,
        date: e.date,
        voucherType: e.voucherType,
        bookType: e.bookType || "JOURNAL",
        companyId: e.companyId || "",
        companyName: e.companyName || "",
        referenceNo: e.referenceNo || "",
        cashInHand: round2(e.cashInHand),
        cashEffect,
        cashAfterEntry: round2(toNum(e.cashInHand) + cashEffect),
        cashInHandSource: e.cashInHandSource || "INITIAL",
        cashInHandEdited: Boolean(e.cashInHandEdited),
        cashInHandHistory: Array.isArray(e.cashInHandHistory) ? e.cashInHandHistory : [],
        description: e.description || e.narration || "",
        status: e.status || "POSTED",
        amount: round2(Math.max(t.debit, t.credit)),
        lines: linesWithNames,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      };
    });

    res.json({ success: true, data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load vouchers." });
  }
};

exports.getVoucherById = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await JournalEntry.findById(id);
    if (!entry) return res.status(404).json({ success: false, message: "Voucher not found." });
    const data = await loadEntryWithLines(entry);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Failed to load voucher." });
  }
};

exports.createVoucher = async (req, res) => {
  // Alias of postManualJournal but with consistent response.
  try {
    await ensureDefaultAccounts();
    const body = req.body || {};

    // Multi-entry (Save All) mode: create separate vouchers per entry group
    if (Array.isArray(body.entries) && body.entries.length) {
      const vouchers = [];
      for (let i = 0; i < body.entries.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const eBody = body.entries[i] || {};
        const lines = eBody.daybookEntry
          ? await buildDaybookLines(eBody)
          : Array.isArray(eBody.lines)
            ? eBody.lines
            : [];
        const hasLineInput = (lines || []).some((l) => l?.accountId && (toNum(l?.debit) > 0 || toNum(l?.credit) > 0));
        if (!hasLineInput) continue;
        // eslint-disable-next-line no-await-in-loop
        await ensureActiveAccountsForLines(lines, `Inactive/invalid account selected (entry #${i + 1}).`);

        const companyId = String(eBody.companyId || "").trim();
        let companyName = String(eBody.companyName || "").trim();
        if (!eBody.daybookEntry && !companyId && !companyName) {
          return res.status(400).json({ success: false, message: `Company is required (entry #${i + 1}).` });
        }
        if (!companyName && companyId) {
          // eslint-disable-next-line no-await-in-loop
          const match = await AccountingEntity.findById(companyId).lean();
          companyName = match?.name || companyId;
        }

        const narration = String(eBody.narration || eBody.description || "").trim();
        if (!narration) {
          return res.status(400).json({ success: false, message: `Description is required (entry #${i + 1}).` });
        }
        const partyName = String(eBody.customerName || "").trim();
        const itemName = String(eBody.productName || "").trim();
        const cashInHandSource = normalizeCashInHandSource(eBody.cashInHandSource);
        const cashInHandEdited = Boolean(eBody.cashInHandEdited || cashInHandSource === "MANUAL_EDIT");
        const normLines = (lines || []).map((l) => ({
          ...l,
          partyName: String(l.partyName || partyName || "").trim(),
          itemName: String(l.itemName || itemName || "").trim(),
          remarks: String(narration || l.remarks || "").trim(),
        }));

        // eslint-disable-next-line no-await-in-loop
        const entry = await postJournalEntry({
          date: eBody.date || new Date(),
          voucherType: eBody.voucherType || body.voucherType || "JOURNAL",
          companyId: companyId || "",
          companyName,
          customerId: String(eBody.customerId || "").trim(),
          customerName: String(eBody.customerName || "").trim(),
          productTypeId: String(eBody.productTypeId || "").trim(),
          productName: String(eBody.productName || "").trim(),
          cashInHand: eBody.cashInHand,
          cashInHandSource,
          cashInHandEdited,
          cashInHandHistory: [
            buildCashInHandHistoryRow({
              amount: eBody.cashInHand,
              source: cashInHandSource,
              note: cashInHandEdited ? "Cash in hand entered with pencil edit." : "Cash in hand carried from previous entry.",
            }),
          ],
          narration,
          lines: normLines,
        });

        if (entry?._id) vouchers.push(entry);
      }

      if (!vouchers.length) return res.status(400).json({ success: false, message: "No valid lines to post." });

      // Cascade recalculate cash-in-hand for all entries
      await cascadeCashInHand();

      const data = {
        created: vouchers.length,
        vouchers: vouchers.map((v) => ({
          _id: v._id,
          voucherNo: v.voucherNo,
          date: v.date,
          voucherType: v.voucherType,
          companyId: v.companyId,
          companyName: v.companyName,
          status: v.status || "POSTED",
        })),
      };
      res.status(201).json({ success: true, data });
      return;
    }

    // Single-entry (legacy) mode
    const lines = body.daybookEntry ? await buildDaybookLines(body) : Array.isArray(body.lines) ? body.lines : [];
    await ensureActiveAccountsForLines(lines, "Inactive/invalid account selected.");
    const companyId = String(body.companyId || "").trim();
    let companyName = String(body.companyName || "").trim();
    if (!body.daybookEntry && !companyId && !companyName) {
      return res.status(400).json({ success: false, message: "Company is required." });
    }
    if (!companyName && companyId) {
      const match = await AccountingEntity.findById(companyId).lean();
      companyName = match?.name || companyId;
    }
    const narration = String(body.narration || body.description || "").trim();
    if (!narration) {
      return res.status(400).json({ success: false, message: "Description is required." });
    }
    const cashInHandSource = normalizeCashInHandSource(body.cashInHandSource);
    const cashInHandEdited = Boolean(body.cashInHandEdited || cashInHandSource === "MANUAL_EDIT");

    const entry = await postJournalEntry({
      date: body.date || new Date(),
      voucherType: body.voucherType || "JOURNAL",
      companyId: companyId || "",
      companyName,
      customerId: String(body.customerId || "").trim(),
      customerName: String(body.customerName || "").trim(),
      productTypeId: String(body.productTypeId || "").trim(),
      productName: String(body.productName || "").trim(),
      cashInHand: body.cashInHand,
      cashInHandSource,
      cashInHandEdited,
      cashInHandHistory: [
        buildCashInHandHistoryRow({
          amount: body.cashInHand,
          source: cashInHandSource,
          note: cashInHandEdited ? "Cash in hand entered with pencil edit." : "Cash in hand recorded.",
        }),
      ],
      narration,
      lines,
    });
    if (!entry) return res.status(400).json({ success: false, message: "No valid lines to post." });

    // Cascade recalculate cash-in-hand for all entries
    await cascadeCashInHand();

    const data = await loadEntryWithLines(entry);
    res.status(201).json({ success: true, data });
  } catch (err) {
    const code = err?.statusCode || 400;
    res.status(code).json({ success: false, message: err.message || "Unable to create voucher." });
  }
};

exports.updateVoucher = async (req, res) => {
  try {
    await ensureDefaultAccounts();
    const { id } = req.params;
    const entry = await JournalEntry.findById(id);
    if (!entry) return res.status(404).json({ success: false, message: "Voucher not found." });
    if (entry.status === "REVERSED") {
      return res.status(400).json({ success: false, message: "Reversed vouchers cannot be edited." });
    }

    const body = req.body || {};
    const companyId = String(body.companyId || entry.companyId || "").trim();
    let companyName = String(body.companyName || entry.companyName || "").trim();
    if (!body.daybookEntry && !companyId && !companyName) {
      return res.status(400).json({ success: false, message: "Company is required." });
    }
    if (!companyName && companyId) {
      const match = await AccountingEntity.findById(companyId).lean();
      companyName = match?.name || companyId;
    }

    const lines = body.daybookEntry ? await buildDaybookLines(body) : Array.isArray(body.lines) ? body.lines : [];
    // Validate balance before writing to DB.
    const norm = (lines || [])
      .map((l) => ({
        ...l,
        debit: round2(l?.debit),
        credit: round2(l?.credit),
        tags: Array.isArray(l?.tags) ? l.tags.filter(Boolean) : [],
      }))
      .filter((l) => l.accountId && (toNum(l.debit) > 0 || toNum(l.credit) > 0));

    await ensureActiveAccountsForLines(norm, "Inactive/invalid account selected.");

    const totalDebit = round2(norm.reduce((s, l) => s + toNum(l.debit), 0));
    const totalCredit = round2(norm.reduce((s, l) => s + toNum(l.credit), 0));
    if (totalDebit <= 0 || totalDebit !== totalCredit) {
      return res.status(400).json({ success: false, message: "Total debit must equal total credit." });
    }

    const narration = String(body.narration ?? body.description ?? entry.narration ?? entry.description ?? "").trim();
    if (!narration) {
      return res.status(400).json({ success: false, message: "Description is required." });
    }
    const previousCashInHand = round2(entry.cashInHand);
    const nextCashInHand = round2(body.cashInHand ?? entry.cashInHand ?? 0);
    const cashInHandSource = normalizeCashInHandSource(body.cashInHandSource || entry.cashInHandSource);
    const cashChanged = previousCashInHand !== nextCashInHand;
    const cashEdited = Boolean(body.cashInHandEdited || entry.cashInHandEdited || cashChanged || cashInHandSource === "MANUAL_EDIT");

    entry.date = body.date ? new Date(body.date) : entry.date;
    entry.voucherType = body.voucherType || entry.voucherType;
    entry.companyId = companyId;
    entry.companyName = companyName;
    entry.customerId = String(body.customerId ?? entry.customerId ?? "").trim();
    entry.customerName = String(body.customerName ?? entry.customerName ?? "").trim();
    entry.productTypeId = String(body.productTypeId ?? entry.productTypeId ?? "").trim();
    entry.productName = String(body.productName ?? entry.productName ?? "").trim();
    entry.cashInHand = nextCashInHand;
    entry.cashInHandSource = cashEdited ? "MANUAL_EDIT" : cashInHandSource;
    entry.cashInHandEdited = cashEdited;
    if (!Array.isArray(entry.cashInHandHistory)) entry.cashInHandHistory = [];
    if (cashChanged || !entry.cashInHandHistory.length) {
      entry.cashInHandHistory.push(
        buildCashInHandHistoryRow({
          amount: nextCashInHand,
          previousAmount: cashChanged ? previousCashInHand : null,
          source: cashEdited ? "MANUAL_EDIT" : cashInHandSource,
          note: cashChanged ? "Cash in hand edited from locked field." : "Cash in hand recorded during update.",
        })
      );
    }
    entry.referenceNo = entry.referenceNo || "";
    entry.narration = narration;
    await entry.save();

    await JournalLine.deleteMany({ journalEntryId: entry._id });
    await JournalLine.insertMany(
      norm.map((l) => ({
        journalEntryId: entry._id,
        accountId: l.accountId,
        debit: round2(l.debit),
        credit: round2(l.credit),
        partyId: l.partyId || null,
        partyName: String(l.partyName || "").trim(),
        itemId: l.itemId || null,
        itemName: String(l.itemName || "").trim(),
        remarks: String(l.remarks || "").trim(),
        tags: Array.isArray(l.tags) ? l.tags.filter(Boolean) : [],
      }))
    );

    // Cascade recalculate cash-in-hand for all subsequent entries
    await cascadeCashInHand();

    const data = await loadEntryWithLines(entry);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to update voucher." });
  }
};

exports.deleteVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await JournalEntry.findById(id);
    if (!entry) return res.status(404).json({ success: false, message: "Voucher not found." });
    if (entry.status === "REVERSED") {
      return res.status(400).json({ success: false, message: "Reversed vouchers cannot be deleted." });
    }

    // Delete associated journal lines
    await JournalLine.deleteMany({ journalEntryId: entry._id });
    
    // Delete the journal entry
    await JournalEntry.deleteOne({ _id: entry._id });

    // Cascade recalculate cash-in-hand only (keep existing entryNo intact)
    await cascadeCashInHand({ renumber: false });

    res.json({ success: true, message: "Voucher deleted successfully." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to delete entry." });
  }
};

  exports.getJournalEntries = async (req, res) => {
    try {
      const { start, end } = parseRange(req);
      const accountIds = parseListParam(req.query.accountId || req.query.accountIds);
      const companyId = String(req.query.companyId || "").trim();
      const voucherType = parseListParam(req.query.voucherType || req.query.voucherTypes);
      const companyName = String(req.query.companyName || "").trim();
      const voucherNo = String(req.query.voucherNo || "").trim();
      const partyIds = parseListParam(req.query.partyId || req.query.partyIds);
      const partyNames = parseListParam(req.query.partyName || req.query.partyNames);
      const partyName = partyNames.length ? "" : String(req.query.partyName || "").trim();
      const itemIds = parseListParam(req.query.itemId || req.query.itemIds || req.query.productId || req.query.productIds);
      const itemName = String(req.query.itemName || "").trim();

    let entries = await getEntriesInRange({
      start,
      end,
      companyId,
      voucherType,
      status: null,
    });
    const hasFilters =
      !!companyId ||
      !!companyName ||
      !!voucherNo ||
      (Array.isArray(voucherType) && voucherType.length) ||
      partyIds.length ||
      partyNames.length ||
      !!partyName ||
      itemIds.length ||
      !!itemName;
    // Fallback: if empty and only voucherType might be narrowing, retry without voucherType.
    if (!entries.length && Array.isArray(voucherType) && voucherType.length) {
      entries = await getEntriesInRange({
        start,
        end,
        companyId,
        voucherType: [],
        status: null,
      });
    }
    // Fallback only when no filters are applied.
    if (!entries.length && !hasFilters) {
      entries = await JournalEntry.find({}).sort({ date: -1, createdAt: -1 }).lean();
    }
      entries.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Apply company name filter early (companyId is often stored as name string)
      const companyRegex = companyName ? new RegExp(escRe(companyName), "i") : null;
      if (companyRegex) {
        entries = entries.filter(
          (e) => companyRegex.test(String(e.companyName || "")) || companyRegex.test(String(e.companyId || ""))
        );
      }

    const partyNameRegex =
      partyNames.length ? new RegExp(partyNames.map((n) => escRe(n)).join("|"), "i") : partyName ? new RegExp(escRe(partyName), "i") : null;
    const itemNameRegex = itemName ? new RegExp(escRe(itemName), "i") : null;

      const lineFilter = {
        ...(partyIds.length ? { partyId: { $in: partyIds } } : {}),
      };
      if (accountIds.length) lineFilter.accountId = { $in: accountIds };
      const lines = await getLinesForEntries(entries.map((e) => e._id), lineFilter);
    const accountMap = await getAccountMapForLines(lines);

    const entryMatchesParty = (e) =>
      partyNameRegex ? partyNameRegex.test(String(e.customerName || "")) : false;
      const entryMatchesItem = (e) =>
        itemNameRegex ? itemNameRegex.test(String(e.productName || "")) : false;
      const entryMatchesItemId = (e) =>
        itemIds.length ? itemIds.some((id) => String(id) === String(e.productTypeId || "")) : false;
    const lineMatchesParty = (entryId) =>
      partyNameRegex ? lines.some((l) => String(l.journalEntryId) === String(entryId) && partyNameRegex.test(String(l.partyName || ""))) : false;
    const lineMatchesItem = (entryId) =>
      itemNameRegex ? lines.some((l) => String(l.journalEntryId) === String(entryId) && itemNameRegex.test(String(l.itemName || ""))) : false;

      const hasLineFilters = accountIds.length || partyIds.length || partyNameRegex || itemIds.length || itemNameRegex;
      const filteredEntries = hasLineFilters
        ? entries.filter(
            (e) =>
              lines.some((l) => String(l.journalEntryId) === String(e._id)) ||
              entryMatchesParty(e) ||
              entryMatchesItem(e) ||
              entryMatchesItemId(e) ||
              lineMatchesParty(e._id) ||
              lineMatchesItem(e._id)
          )
        : entries;

    const voucherRegex = voucherNo ? new RegExp(escRe(voucherNo), "i") : null;
      const data = filteredEntries
        .filter((e) => (companyRegex ? companyRegex.test(e.companyName || "") || companyRegex.test(String(e.companyId || "")) : true))
        .filter((e) => (voucherRegex ? voucherRegex.test(e.voucherNo || "") : true))
        .map((e, idx) => ({
          ...e,
          entryNo: e.entryNo || idx + 1,
          cashInHand: round2(e.cashInHand),
          cashInHandSource: e.cashInHandSource || "INITIAL",
          cashInHandEdited: Boolean(e.cashInHandEdited),
          cashInHandHistory: Array.isArray(e.cashInHandHistory) ? e.cashInHandHistory : [],
        lines: lines
          .filter((l) => String(l.journalEntryId) === String(e._id))
          .map((l) => ({
            ...l,
            accountCode: accountMap.get(String(l.accountId))?.code || "",
            accountName: accountMap.get(String(l.accountId))?.name || "",
            accountType: accountMap.get(String(l.accountId))?.type || "",
            accountSubType: accountMap.get(String(l.accountId))?.subType || "",
          })),
        }));

      res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load journal." });
  }
};

exports.reverseJournalEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await JournalEntry.findById(id).lean();
    if (!entry) return res.status(404).json({ success: false, message: "Journal entry not found." });
    if (entry.status !== "POSTED") {
      return res.status(400).json({ success: false, message: "Only POSTED entries can be reversed." });
    }
    const lines = await JournalLine.find({ journalEntryId: entry._id }).lean();
    if (!lines.length) {
      return res.status(400).json({ success: false, message: "No lines found for this entry." });
    }

    const reversal = await JournalEntry.create({
      voucherNo: await nextVoucherNo(),
      date: new Date(),
      voucherType: entry.voucherType || "JOURNAL",
      bookType: entry.bookType || "JOURNAL",
      companyId: entry.companyId || "",
      companyName: entry.companyName || "",
      referenceNo: entry.referenceNo || "",
      description: `Reversal of ${entry.voucherNo}`,
      sourceModule: "MANUAL",
      sourceRefType: "REVERSAL",
      sourceRefId: String(entry._id),
      narration: `Reversal of ${entry.voucherNo}`,
      status: "POSTED",
      reversalOf: entry._id,
      createdBy: "user",
    });

    await JournalLine.insertMany(
      lines.map((l) => ({
        journalEntryId: reversal._id,
        accountId: l.accountId,
        debit: round2(l.credit),
        credit: round2(l.debit),
        partyId: l.partyId || null,
        partyName: l.partyName || "",
        itemId: l.itemId || null,
        itemName: l.itemName || "",
        remarks: "Reversal",
      }))
    );

    await JournalEntry.updateOne({ _id: entry._id }, { $set: { status: "REVERSED" } });

    res.json({ success: true, message: "Journal reversed." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to reverse." });
  }
};
