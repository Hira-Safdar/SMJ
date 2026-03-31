const Account = require("../models/accountModel");
const JournalEntry = require("../models/journalEntryModel");
const JournalLine = require("../models/journalLineModel");

const DEFAULT_COA = [
  { code: "1100", name: "Cash", type: "ASSET", subType: "CASH", isControl: true },
  { code: "1110", name: "Bank", type: "ASSET", subType: "BANK", isControl: true },
  { code: "1200", name: "Accounts Receivable", type: "ASSET", subType: "AR", isControl: true },
  { code: "1400", name: "Employee Advances", type: "ASSET", subType: "HR_ADVANCE", isControl: true },
  { code: "1300", name: "Raw Paddy Inventory", type: "ASSET", subType: "INVENTORY_RAW", isControl: true },
  { code: "1310", name: "Finished Goods Inventory", type: "ASSET", subType: "INVENTORY_FINISHED", isControl: true },
  { code: "2100", name: "Accounts Payable", type: "LIABILITY", subType: "AP", isControl: true },
  { code: "2200", name: "Payroll Payable", type: "LIABILITY", subType: "PAYROLL", isControl: true },
  { code: "3000", name: "Owner Equity", type: "EQUITY", subType: "EQUITY", isControl: true },
  { code: "3100", name: "Owner Capital", type: "EQUITY", subType: "CAPITAL", isControl: true },
  { code: "3200", name: "Owner Drawings", type: "EQUITY", subType: "DRAWING", isControl: true },
  { code: "4100", name: "Sales Revenue", type: "INCOME", subType: "SALES", isControl: true },
  { code: "5100", name: "Purchases Expense", type: "EXPENSE", subType: "PURCHASE", isControl: true },
  { code: "5200", name: "Operating Expense", type: "EXPENSE", subType: "OPERATING", isControl: true },
  { code: "5300", name: "Payroll Expense", type: "EXPENSE", subType: "PAYROLL", isControl: true },
  { code: "6100", name: "Cost of Goods Sold", type: "COGS", subType: "COGS", isControl: true },
];

const round2 = (n) => Number((Number(n || 0)).toFixed(2));

const nextVoucherNo = async () => {
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
};

const ensureDefaultAccounts = async () => {
  for (const a of DEFAULT_COA) {
    // eslint-disable-next-line no-await-in-loop
    await Account.updateOne({ code: a.code }, { $setOnInsert: a }, { upsert: true });
  }
};

const getAccountsMap = async () => {
  const rows = await Account.find({ isActive: true }).lean();
  const map = new Map();
  rows.forEach((r) => map.set(r.code, r));
  return map;
};

const postJournalEntry = async ({
  date,
  voucherType,
  bookType,
  companyId,
  companyName,
  referenceNo,
  description,
  sourceModule,
  sourceRefType,
  sourceRefId,
  narration,
  createdBy = "system",
  lines,
}) => {
  const normLines = (lines || [])
    .map((l) => ({
      ...l,
      debit: round2(l.debit),
      credit: round2(l.credit),
    }))
    .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));

  if (!normLines.length) return null;
  const totalDebit = round2(normLines.reduce((s, l) => s + (l.debit || 0), 0));
  const totalCredit = round2(normLines.reduce((s, l) => s + (l.credit || 0), 0));
  if (totalDebit <= 0 || totalDebit !== totalCredit) {
    throw new Error("Unbalanced journal entry.");
  }

  const voucherNo = await nextVoucherNo();
  const entry = await JournalEntry.create({
    voucherNo,
    date: date ? new Date(date) : new Date(),
    voucherType: voucherType || "JOURNAL",
    bookType: bookType || "JOURNAL",
    companyId: String(companyId || ""),
    companyName: String(companyName || ""),
    referenceNo: String(referenceNo || ""),
    description: String(description || ""),
    sourceModule: sourceModule || "",
    sourceRefType: sourceRefType || "",
    sourceRefId: String(sourceRefId || ""),
    narration: narration || "",
    createdBy,
    status: "POSTED",
  });

  await JournalLine.insertMany(
    normLines.map((l) => ({
      journalEntryId: entry._id,
      accountId: l.accountId,
      debit: l.debit,
      credit: l.credit,
      partyId: l.partyId || null,
      partyName: l.partyName || "",
      itemId: l.itemId || null,
      itemName: l.itemName || "",
      remarks: l.remarks || "",
    }))
  );

  return entry;
};

const reverseBySource = async ({ sourceModule, sourceRefType, sourceRefId, reason = "" }) => {
  const posted = await JournalEntry.find({
    sourceModule: sourceModule || "",
    sourceRefType: sourceRefType || "",
    sourceRefId: String(sourceRefId || ""),
    status: "POSTED",
  });
  for (const entry of posted) {
    // eslint-disable-next-line no-await-in-loop
    const lines = await JournalLine.find({ journalEntryId: entry._id }).lean();
    const reversal = await JournalEntry.create({
      voucherNo: await nextVoucherNo(),
      date: new Date(),
      sourceModule: entry.sourceModule,
      sourceRefType: entry.sourceRefType,
      sourceRefId: entry.sourceRefId,
      bookType: entry.bookType || "JOURNAL",
      narration: `Reversal of ${entry.voucherNo}${reason ? `: ${reason}` : ""}`,
      createdBy: "system",
      status: "POSTED",
      reversalOf: entry._id,
    });
    // eslint-disable-next-line no-await-in-loop
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
        remarks: `Reversal`,
      }))
    );
    entry.status = "REVERSED";
    // eslint-disable-next-line no-await-in-loop
    await entry.save();
  }
};

module.exports = {
  ensureDefaultAccounts,
  postJournalEntry,
  reverseBySource,
};

