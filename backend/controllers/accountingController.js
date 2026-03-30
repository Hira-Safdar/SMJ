const Account = require("../models/accountModel");
const AccountingEntity = require("../models/accountingEntityModel");
const AccountingParty = require("../models/accountingPartyModel");
const AccountingProduct = require("../models/accountingProductModel");
const AccountingFilterTemplate = require("../models/accountingFilterTemplateModel");
const JournalEntry = require("../models/journalEntryModel");
const JournalLine = require("../models/journalLineModel");
const { getDateRangeFromQuery } = require("../utils/dateRange");
const { ensureDefaultAccounts, postJournalEntry } = require("../services/accountingJournalService");

const parseRange = (req) => getDateRangeFromQuery(req.query);
const toNum = (v) => Number(v || 0);
const round2 = (n) => Number((Number(n || 0)).toFixed(2));
const escRe = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

async function getEntriesInRange({ start, end, companyId, voucherType, status = "POSTED", bookType }) {
  const filter = { date: { $gte: start, $lte: end } };
  if (status) filter.status = status;
  if (companyId) filter.companyId = companyId;
  if (Array.isArray(voucherType) && voucherType.length) filter.voucherType = { $in: voucherType };
  else if (voucherType) filter.voucherType = voucherType;
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
    const rows = await AccountingEntity.find({ isActive: true }).sort({ name: 1 }).lean();
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

// -------------------- PARTIES (CUSTOMER/SUPPLIER) --------------------

exports.getParties = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const partyType = String(req.query.partyType || "").trim();
    const filter = { isActive: true };
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
    const filter = { isActive: true };
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
    const doc = await AccountingProduct.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Product not found." });
    res.json({ success: true, message: "Product deleted." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to delete product." });
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

// -------------------- REPORTS (MANUAL JOURNALS ONLY) --------------------

exports.getDaybook = async (req, res) => {
  try {
    const { start, end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const voucherType = parseListParam(req.query.voucherType || req.query.voucherTypes);
    const bookType = parseListParam(req.query.bookType || req.query.bookTypes);
    const companyName = String(req.query.companyName || "").trim();

    const entries = await getEntriesInRange({ start, end, companyId, voucherType, bookType, status: "POSTED" });
    const entryIds = entries.map((e) => e._id);
    const lines = await getLinesForEntries(entryIds);

    const totalsByEntry = new Map();
    lines.forEach((l) => {
      const k = String(l.journalEntryId);
      const row = totalsByEntry.get(k) || { debit: 0, credit: 0 };
      row.debit += toNum(l.debit);
      row.credit += toNum(l.credit);
      totalsByEntry.set(k, row);
    });

    const rows = entries
      .filter((e) => (companyName ? new RegExp(escRe(companyName), "i").test(e.companyName || "") : true))
      .map((e) => {
      const t = totalsByEntry.get(String(e._id)) || { debit: 0, credit: 0 };
      return {
        journalEntryId: String(e._id),
        date: e.date,
        voucherNo: e.voucherNo,
        type: e.voucherType || "JOURNAL",
        bookType: e.bookType || "JOURNAL",
        companyId: e.companyId || "",
        companyName: e.companyName || "",
        referenceNo: e.referenceNo || "",
        description: e.description || e.narration || "",
        debit: round2(t.debit),
        credit: round2(t.credit),
        amount: round2(Math.max(t.debit, t.credit)),
        status: e.status || "POSTED",
      };
    });

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load daybook." });
  }
};

exports.getLedger = async (req, res) => {
  try {
    const { start, end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const accountIds = parseListParam(req.query.accountId || req.query.accountIds);
    const partyIds = parseListParam(req.query.partyId || req.query.partyIds);
    const productIds = parseListParam(req.query.productId || req.query.productIds || req.query.itemId || req.query.itemIds);
    const party = String(req.query.party || "").trim(); // legacy name filter
    const item = String(req.query.item || "").trim(); // legacy product name filter
    const tags = parseListParam(req.query.tag || req.query.tags);

    const entries = await getEntriesInRange({ start, end, companyId, status: "POSTED" });
    const entryMap = new Map(entries.map((e) => [String(e._id), e]));
    const lines = await getLinesForEntries(entries.map((e) => e._id), {
      ...(accountIds.length ? { accountId: { $in: accountIds } } : {}),
      ...(partyIds.length ? { partyId: { $in: partyIds } } : {}),
      ...(productIds.length ? { itemId: { $in: productIds } } : {}),
      ...(tags.length ? { tags: { $in: tags } } : {}),
      ...(party ? { partyName: new RegExp(escRe(party), "i") } : {}),
      ...(item ? { itemName: new RegExp(escRe(item), "i") } : {}),
    });
    const accountMap = await getAccountMapForLines(lines);

    const rows = lines
      .map((l) => {
        const je = entryMap.get(String(l.journalEntryId));
        const acc = accountMap.get(String(l.accountId));
        return {
          journalEntryId: String(l.journalEntryId),
          journalLineId: String(l._id),
          date: je?.date || new Date(),
          voucherNo: je?.voucherNo || "",
          description: je?.description || je?.narration || "",
          accountId: String(l.accountId),
          account: acc?.name || "Account",
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
    const { end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const voucherTypes = parseListParam(req.query.voucherType || req.query.voucherTypes);
    const bookTypes = parseListParam(req.query.bookType || req.query.bookTypes);
    const companyName = String(req.query.companyName || "").trim();
    const voucherNo = String(req.query.voucherNo || "").trim();
    const accountIds = parseListParam(req.query.accountId || req.query.accountIds);

    const entryFilter = { date: { $lte: end }, status: "POSTED" };
    if (companyId) entryFilter.companyId = companyId;
    if (voucherTypes.length) entryFilter.voucherType = { $in: voucherTypes };
    if (bookTypes.length) entryFilter.bookType = { $in: bookTypes };
    if (companyName) entryFilter.companyName = new RegExp(escRe(companyName), "i");
    if (voucherNo) entryFilter.voucherNo = new RegExp(escRe(voucherNo), "i");
    if (bookTypes.length) entryFilter.bookType = { $in: bookTypes };
    if (companyName) entryFilter.companyName = new RegExp(escRe(companyName), "i");
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
      .map((r) => ({ ...r, debit: round2(r.debit), credit: round2(r.credit) }))
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
    const productIds = parseListParam(req.query.productId || req.query.productIds || req.query.itemId || req.query.itemIds);
    const tags = parseListParam(req.query.tag || req.query.tags);

    const entries = await getEntriesInRange({ start, end, companyId, voucherType, status: "POSTED" });
    const lines = await getLinesForEntries(entries.map((e) => e._id), {
      ...(accountIds.length ? { accountId: { $in: accountIds } } : {}),
      ...(partyIds.length ? { partyId: { $in: partyIds } } : {}),
      ...(productIds.length ? { itemId: { $in: productIds } } : {}),
      ...(tags.length ? { tags: { $in: tags } } : {}),
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
        income: income.sort((a, b) => a.code.localeCompare(b.code)),
        cogs: cogs.sort((a, b) => a.code.localeCompare(b.code)),
        expenses: expenses.sort((a, b) => a.code.localeCompare(b.code)),
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
    const productIds = parseListParam(req.query.productId || req.query.productIds || req.query.itemId || req.query.itemIds);
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
    });
    const accountMap = await getAccountMapForLines(lines);

    const balances = new Map(); // accountId -> { ...acc, balance }
    lines.forEach((l) => {
      const acc = accountMap.get(String(l.accountId));
      if (!acc) return;
      const k = String(acc._id);
      const prev = balances.get(k) || { accountId: k, code: acc.code, account: acc.name, type: acc.type, balance: 0 };
      // Assets: debit-credit. Liab/Equity: credit-debit. Income/Expense excluded from BS.
      let delta = toNum(l.debit) - toNum(l.credit);
      if (acc.type === "LIABILITY" || acc.type === "EQUITY") delta = -delta;
      prev.balance += delta;
      balances.set(k, prev);
    });

    const rows = Array.from(balances.values())
      .map((r) => ({ ...r, balance: round2(r.balance) }))
      .filter((r) => ["ASSET", "LIABILITY", "EQUITY"].includes(r.type));

    const assets = rows.filter((r) => r.type === "ASSET").sort((a, b) => a.code.localeCompare(b.code));
    const liabilities = rows.filter((r) => r.type === "LIABILITY").sort((a, b) => a.code.localeCompare(b.code));
    const equity = rows.filter((r) => r.type === "EQUITY").sort((a, b) => a.code.localeCompare(b.code));

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

exports.getOutstandingReceivables = async (req, res) => {
  try {
    await ensureDefaultAccounts();
    const { end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const voucherTypes = parseListParam(req.query.voucherType || req.query.voucherTypes);

    const arAccounts = await Account.find({ subType: "AR", isActive: true }).lean();
    const arIds = arAccounts.map((a) => String(a._id));
    if (!arIds.length) return res.json({ success: true, data: [] });

    const entryFilter = { date: { $lte: end }, status: "POSTED" };
    if (companyId) entryFilter.companyId = companyId;
    if (voucherTypes.length) entryFilter.voucherType = { $in: voucherTypes };
    const entries = await JournalEntry.find(entryFilter).select("_id").lean();
    const lines = await getLinesForEntries(entries.map((e) => e._id), { accountId: { $in: arIds } });

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
      .filter((r) => r.balance > 0)
      .map((r) => ({
        ...r,
        totalDebit: round2(r.totalDebit),
        totalCredit: round2(r.totalCredit),
        balance: round2(r.balance),
      }))
      .sort((a, b) => b.balance - a.balance);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load receivables." });
  }
};

exports.getOutstandingPayables = async (req, res) => {
  try {
    await ensureDefaultAccounts();
    const { end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const voucherTypes = parseListParam(req.query.voucherType || req.query.voucherTypes);

    const apAccounts = await Account.find({ subType: "AP", isActive: true }).lean();
    const apIds = apAccounts.map((a) => String(a._id));
    if (!apIds.length) return res.json({ success: true, data: [] });

    const entryFilter = { date: { $lte: end }, status: "POSTED" };
    if (companyId) entryFilter.companyId = companyId;
    if (voucherTypes.length) entryFilter.voucherType = { $in: voucherTypes };
    const entries = await JournalEntry.find(entryFilter).select("_id").lean();
    const lines = await getLinesForEntries(entries.map((e) => e._id), { accountId: { $in: apIds } });

    const bucket = new Map();
    lines.forEach((l) => {
      const name = String(l.partyName || "").trim();
      if (!name) return;
      const row = bucket.get(name) || { party: name, totalDebit: 0, totalCredit: 0, balance: 0 };
      row.totalDebit += toNum(l.debit);
      row.totalCredit += toNum(l.credit);
      // AP balance: credits - debits
      row.balance = row.totalCredit - row.totalDebit;
      bucket.set(name, row);
    });

    const data = Array.from(bucket.values())
      .filter((r) => r.balance > 0)
      .map((r) => ({
        ...r,
        totalDebit: round2(r.totalDebit),
        totalCredit: round2(r.totalCredit),
        balance: round2(r.balance),
      }))
      .sort((a, b) => b.balance - a.balance);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load payables." });
  }
};

// -------------------- ACCOUNTS --------------------

exports.getAccounts = async (_req, res) => {
  try {
    await ensureDefaultAccounts();
    const data = await Account.find({}).sort({ code: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load accounts." });
  }
};

exports.createAccount = async (req, res) => {
  try {
    const payload = req.body || {};
    const doc = await Account.create({
      code: String(payload.code || "").trim(),
      name: String(payload.name || "").trim(),
      type: payload.type,
      subType: String(payload.subType || "").trim(),
      parentAccountId: payload.parentAccountId || null,
      isControl: !!payload.isControl,
      isActive: payload.isActive !== false,
      tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [],
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to create account." });
  }
};

exports.updateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    const patch = {};
    if (payload.code != null) patch.code = String(payload.code || "").trim();
    if (payload.name != null) patch.name = String(payload.name || "").trim();
    if (payload.type != null) patch.type = payload.type;
    if (payload.subType != null) patch.subType = String(payload.subType || "").trim();
    if (payload.parentAccountId != null) patch.parentAccountId = payload.parentAccountId || null;
    if (payload.isControl != null) patch.isControl = !!payload.isControl;
    if (payload.isActive != null) patch.isActive = !!payload.isActive;
    if (payload.tags != null) patch.tags = Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [];
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

async function loadEntryWithLines(entry) {
  if (!entry) return null;
  const lines = await JournalLine.find({ journalEntryId: entry._id }).lean();
  const accountMap = await getAccountMapForLines(lines);
  const withNames = lines.map((l) => ({
    ...l,
    accountCode: accountMap.get(String(l.accountId))?.code || "",
    accountName: accountMap.get(String(l.accountId))?.name || "",
  }));
  const sums = summarizeEntryAmount(withNames);
  return { ...(entry.toObject?.() ? entry.toObject() : entry), lines: withNames, ...sums };
}

exports.getVouchers = async (req, res) => {
  try {
    const { start, end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const voucherTypes = parseListParam(req.query.voucherType || req.query.voucherTypes);
    const accountIds = parseListParam(req.query.accountId || req.query.accountIds);
    const partyIds = parseListParam(req.query.partyId || req.query.partyIds);

    const entryFilter = { date: { $gte: start, $lte: end } };
    if (companyId) entryFilter.companyId = companyId;
    if (voucherTypes.length) entryFilter.voucherType = { $in: voucherTypes };
    // Status filter optional
    if (req.query.status) entryFilter.status = String(req.query.status);

    const entries = await JournalEntry.find(entryFilter).sort({ date: -1, createdAt: -1 }).lean();
    const entryIds = entries.map((e) => e._id);

    const lineFilter = { journalEntryId: { $in: entryIds } };
    if (accountIds.length) lineFilter.accountId = { $in: accountIds };
    if (partyIds.length) lineFilter.partyId = { $in: partyIds };
    if (partyName) lineFilter.partyName = new RegExp(escRe(partyName), "i");

    const lines = await JournalLine.find(lineFilter).lean();
    const bucket = new Map(); // entryId -> { debit, credit }
    lines.forEach((l) => {
      const k = String(l.journalEntryId);
      const row = bucket.get(k) || { debit: 0, credit: 0 };
      row.debit += toNum(l.debit);
      row.credit += toNum(l.credit);
      bucket.set(k, row);
    });

    // If account/party filters are applied, only show entries that have at least one matching line.
    const filteredEntries = (accountIds.length || partyIds.length)
      ? entries.filter((e) => bucket.has(String(e._id)))
      : entries;

    const data = filteredEntries.map((e) => {
      const t = bucket.get(String(e._id)) || { debit: 0, credit: 0 };
      return {
        _id: e._id,
        voucherNo: e.voucherNo,
        date: e.date,
        voucherType: e.voucherType,
        bookType: e.bookType || "JOURNAL",
        companyId: e.companyId || "",
        companyName: e.companyName || "",
        referenceNo: e.referenceNo || "",
        description: e.description || e.narration || "",
        status: e.status || "POSTED",
        amount: round2(Math.max(t.debit, t.credit)),
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      };
    });

    res.json({ success: true, data });
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
      narration: String(body.narration || "").trim(),
      createdBy: body.createdBy || "user",
      sourceModule: "MANUAL",
      sourceRefType: "VOUCHER",
      sourceRefId: String(Date.now()),
      lines,
    });
    if (!entry) return res.status(400).json({ success: false, message: "No valid lines to post." });
    const data = await loadEntryWithLines(entry);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to create voucher." });
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
    const companyName = String(body.companyName || entry.companyName || "").trim();
    if (!companyId || !companyName) {
      return res.status(400).json({ success: false, message: "Company is required." });
    }

    const lines = Array.isArray(body.lines) ? body.lines : [];
    // Validate balance before writing to DB.
    const norm = (lines || [])
      .map((l) => ({
        ...l,
        debit: round2(l?.debit),
        credit: round2(l?.credit),
        tags: Array.isArray(l?.tags) ? l.tags.filter(Boolean) : [],
      }))
      .filter((l) => l.accountId && (toNum(l.debit) > 0 || toNum(l.credit) > 0));

    const totalDebit = round2(norm.reduce((s, l) => s + toNum(l.debit), 0));
    const totalCredit = round2(norm.reduce((s, l) => s + toNum(l.credit), 0));
    if (totalDebit <= 0 || totalDebit !== totalCredit) {
      return res.status(400).json({ success: false, message: "Total debit must equal total credit." });
    }

    entry.date = body.date ? new Date(body.date) : entry.date;
    entry.voucherType = body.voucherType || entry.voucherType;
    entry.bookType = body.bookType || entry.bookType || "JOURNAL";
    entry.companyId = companyId;
    entry.companyName = companyName;
    entry.referenceNo = String(body.referenceNo ?? entry.referenceNo ?? "").trim();
    entry.description = String(body.description ?? entry.description ?? "").trim();
    entry.narration = String(body.narration ?? entry.narration ?? "").trim();
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
    await JournalLine.deleteMany({ journalEntryId: entry._id });
    await JournalEntry.deleteOne({ _id: entry._id });
    res.json({ success: true, message: "Voucher deleted." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to delete voucher." });
  }
};

exports.getJournalEntries = async (req, res) => {
  try {
    const { start, end } = parseRange(req);
    const companyId = String(req.query.companyId || "").trim();
    const voucherType = String(req.query.voucherType || "").trim();
    const bookTypes = parseListParam(req.query.bookType || req.query.bookTypes);
    const companyName = String(req.query.companyName || "").trim();
    const partyIds = parseListParam(req.query.partyId || req.query.partyIds);

    const entries = await getEntriesInRange({
      start,
      end,
      companyId,
      voucherType,
      bookType: bookTypes,
      status: null,
    });
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    const lineFilter = {
      ...(partyIds.length ? { partyId: { $in: partyIds } } : {}),
      ...(partyName ? { partyName: new RegExp(escRe(partyName), "i") } : {}),
    };
    const lines = await getLinesForEntries(entries.map((e) => e._id), lineFilter);
    const accountMap = await getAccountMapForLines(lines);

    const filteredEntries = partyIds.length
      ? entries.filter((e) => lines.some((l) => String(l.journalEntryId) === String(e._id)))
      : entries;

    const data = filteredEntries
      .filter((e) => (companyName ? new RegExp(escRe(companyName), "i").test(e.companyName || "") : true))
      .filter((e) => (voucherNo ? new RegExp(escRe(voucherNo), "i").test(e.voucherNo || "") : true))
      .map((e) => ({
        ...e,
        lines: lines
          .filter((l) => String(l.journalEntryId) === String(e._id))
          .map((l) => ({
            ...l,
            accountCode: accountMap.get(String(l.accountId))?.code || "",
            accountName: accountMap.get(String(l.accountId))?.name || "",
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
        partyId: l.partyId || "",
        partyName: l.partyName || "",
        itemId: l.itemId || "",
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
