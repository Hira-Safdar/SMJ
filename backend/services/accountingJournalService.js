const Account = require("../models/accountModel");
const JournalEntry = require("../models/journalEntryModel");
const JournalLine = require("../models/journalLineModel");

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
  return null;
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
  companyId,
  companyName,
  customerId,
  customerName,
  productTypeId,
  productName,
  cashInHand,
  cashInHandSource,
  cashInHandEdited,
  cashInHandHistory,
  narration,
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

  // Assign next entryNo (max existing + 1)
  const lastEntry = await JournalEntry.findOne({}).sort({ entryNo: -1 }).lean();
  const nextEntryNo = (lastEntry?.entryNo || 0) + 1;

  const normalizedCashInHand = round2(cashInHand);
  const normalizedCashSource = ["INITIAL", "CARRIED", "MANUAL_EDIT"].includes(String(cashInHandSource || ""))
    ? String(cashInHandSource)
    : "INITIAL";
  const entry = await JournalEntry.create({
    entryNo: nextEntryNo,
    voucherNo,
    date: date ? new Date(date) : new Date(),
    voucherType: voucherType || "JOURNAL",
    companyId: String(companyId || ""),
    companyName: String(companyName || ""),
    customerId: String(customerId || ""),
    customerName: String(customerName || ""),
    productTypeId: String(productTypeId || ""),
    productName: String(productName || ""),
    cashInHand: normalizedCashInHand,
    cashInHandSource: normalizedCashSource,
    cashInHandEdited: Boolean(cashInHandEdited || normalizedCashSource === "MANUAL_EDIT"),
    cashInHandHistory: Array.isArray(cashInHandHistory) && cashInHandHistory.length
      ? cashInHandHistory
      : [
          {
            amount: normalizedCashInHand,
            previousAmount: null,
            source: normalizedCashSource,
            note: normalizedCashSource === "MANUAL_EDIT" ? "Cash in hand entered manually." : "Cash in hand recorded.",
            at: new Date(),
          },
        ],
    narration: narration || "",
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

