const toIso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

const safeStr = (v) => String(v == null ? "" : v).trim();
const safeNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function truncate(text, maxLen) {
  const s = safeStr(text);
  if (!maxLen || s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 12))} …(truncated)`;
}

function txToDoc(tx) {
  const kind =
    tx.type === "PURCHASE"
      ? `PURCHASE/${safeStr(tx.purchaseKind || "MANAGERIAL")}`
      : `SALE/${safeStr(tx.saleKind || "SMJ")}`;

  const party =
    tx.type === "SALE"
      ? safeStr(tx.partyName || tx.companyName || "Unknown party")
      : safeStr(tx.companyName || "Unknown company");

  const items = Array.isArray(tx.items)
    ? tx.items
        .slice(0, 20)
        .map((it) => {
          const name = safeStr(it.productTypeName || it.productName || "Item");
          const kg = safeNum(it.netWeightKg);
          const bags = safeNum(it.numBags);
          const rate = safeNum(it.rate);
          const amount = safeNum(it.amount);
          const parts = [
            name,
            bags ? `${bags} bags` : null,
            kg ? `${kg} kg` : null,
            rate ? `rate ${rate}/${safeStr(it.rateType || "per_kg")}` : null,
            amount ? `amount ${amount}` : null,
          ].filter(Boolean);
          return `- ${parts.join(", ")}`;
        })
        .join("\n")
    : "";

  const title = `${kind} ${safeStr(tx.invoiceNo || "")}`.trim();

  const text = [
    `Transaction: ${title}`,
    `Date: ${toIso(tx.date)}`,
    `Party: ${party}`,
    `Payment: ${safeStr(tx.paymentStatus || "")}${tx.dueDate ? `, due ${toIso(tx.dueDate)}` : ""}`,
    `Total: ${safeNum(tx.totalAmount)}`,
    tx.partialPaid ? `PartialPaid: ${safeNum(tx.partialPaid)}` : null,
    items ? `Items:\n${items}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return { title, text };
}

function companyToDoc(c) {
  const title = `Company ${safeStr(c.name || "")}`.trim();
  const text = [
    `Company: ${safeStr(c.name)}`,
    c.phone ? `Phone: ${safeStr(c.phone)}` : null,
    c.email ? `Email: ${safeStr(c.email)}` : null,
    c.address ? `Address: ${safeStr(c.address)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, text };
}

function customerToDoc(c) {
  const title = `Customer ${safeStr(c.name || "")}`.trim();
  const text = [
    `Customer: ${safeStr(c.name)}`,
    c.phone ? `Phone: ${safeStr(c.phone)}` : null,
    c.email ? `Email: ${safeStr(c.email)}` : null,
    c.address ? `Address: ${safeStr(c.address)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, text };
}

function stockLedgerToDoc(r) {
  const title = `Stock ${safeStr(r.type || "")} ${toIso(r.date) || ""}`.trim();
  const text = [
    `StockLedger: ${safeStr(r.type)} on ${toIso(r.date)}`,
    r.companyName ? `Brand/Company: ${safeStr(r.companyName)}` : null,
    r.productTypeName ? `Product: ${safeStr(r.productTypeName)}` : null,
    r.numBags ? `Bags: ${safeNum(r.numBags)}` : null,
    `NetKg: ${safeNum(r.netWeightKg)}`,
    r.gatePassNo ? `GatePassNo: ${safeStr(r.gatePassNo)}` : null,
    r.remarks ? `Remarks: ${safeStr(r.remarks)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, text };
}

function gatePassToDoc(g) {
  const title = `GatePass ${safeStr(g.gatePassNo || g.gatePassNumber || "")}`.trim();
  const text = [
    `GatePass: ${safeStr(g.type || "")}`,
    g.gatePassNo || g.gatePassNumber ? `No: ${safeStr(g.gatePassNo || g.gatePassNumber)}` : null,
    g.date ? `Date: ${toIso(g.date)}` : null,
    g.companyName ? `Company: ${safeStr(g.companyName)}` : null,
    g.partyName ? `Party: ${safeStr(g.partyName)}` : null,
    g.totalQuantity != null ? `TotalQty: ${safeNum(g.totalQuantity)}` : null,
    g.totalAmount != null ? `TotalAmount: ${safeNum(g.totalAmount)}` : null,
    g.remarks ? `Remarks: ${safeStr(g.remarks)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, text };
}

function productionBatchToDoc(b) {
  const outs = Array.isArray(b.outputs)
    ? b.outputs
        .slice(0, 20)
        .map((o) => {
          const name = safeStr(o.productTypeName || o.productName || "Output");
          const kg = safeNum(o.netWeightKg);
          const bags = safeNum(o.numBags);
          return `- ${name}${bags ? `, ${bags} bags` : ""}${kg ? `, ${kg} kg` : ""}`;
        })
        .join("\n")
    : "";

  const title = `Batch ${safeStr(b.batchNo || "")}`.trim();
  const text = [
    `ProductionBatch: ${safeStr(b.batchNo)}`,
    b.status ? `Status: ${safeStr(b.status)}` : null,
    b.sourceCompanyName ? `Brand: ${safeStr(b.sourceCompanyName)}` : null,
    b.inputNetWeightKg != null ? `InputKg: ${safeNum(b.inputNetWeightKg)}` : null,
    outs ? `Outputs:\n${outs}` : null,
    b.batchDone != null ? `BatchDone: ${String(!!b.batchDone)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return { title, text };
}

function productTypeToDoc(p) {
  const title = `ProductType ${safeStr(p.name || "")}`.trim();
  const text = [
    `ProductType: ${safeStr(p.name)}`,
    p.category ? `Category: ${safeStr(p.category)}` : null,
    p.defaultBagWeightKg != null ? `DefaultBagKg: ${safeNum(p.defaultBagWeightKg)}` : null,
    p.description ? `Description: ${safeStr(p.description)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, text };
}

function expenseCategoryToDoc(e) {
  const title = `ExpenseCategory ${safeStr(e.name || "")}`.trim();
  const text = [
    `ExpenseCategory: ${safeStr(e.name)}`,
    e.description ? `Description: ${safeStr(e.description)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, text };
}

function journalEntryToDoc(j) {
  const title = `JournalEntry ${safeStr(j.voucherNo || "")}`.trim();
  const text = [
    `JournalEntry: ${safeStr(j.voucherNo)}`,
    j.date ? `Date: ${toIso(j.date)}` : null,
    j.voucherType ? `VoucherType: ${safeStr(j.voucherType)}` : null,
    j.status ? `Status: ${safeStr(j.status)}` : null,
    j.companyName ? `Company: ${safeStr(j.companyName)}` : null,
    j.customerName ? `Customer: ${safeStr(j.customerName)}` : null,
    j.productName ? `Product: ${safeStr(j.productName)}` : null,
    j.narration ? `Narration: ${safeStr(j.narration)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, text };
}

function accountingGeneratedJournalToDoc(r) {
  const title = `SavedJournal ${safeStr(r.name || "")}`.trim();
  const text = [
    `SavedJournalReport: ${safeStr(r.name)}`,
    r.reportKey ? `ReportKey: ${safeStr(r.reportKey)}` : null,
    r.range ? `Range: ${safeStr(r.range)}` : null,
    r.rangeDate ? `RangeDate: ${safeStr(r.rangeDate)}` : null,
    r.startDate ? `StartDate: ${safeStr(r.startDate)}` : null,
    r.endDate ? `EndDate: ${safeStr(r.endDate)}` : null,
    r.companyName ? `Company: ${safeStr(r.companyName)}` : null,
    r.accountName ? `Account: ${safeStr(r.accountName)}` : null,
    r.partyName ? `Party: ${safeStr(r.partyName)}` : null,
    r.itemName ? `Item: ${safeStr(r.itemName)}` : null,
    r.voucherType ? `VoucherType: ${safeStr(r.voucherType)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, text };
}

function guessBuilder(collectionName) {
  switch (collectionName) {
    case "Transaction":
      return txToDoc;
    case "Company":
      return companyToDoc;
    case "Customer":
      return customerToDoc;
    case "StockLedger":
      return stockLedgerToDoc;
    case "GatePass":
      return gatePassToDoc;
    case "ProductionBatch":
      return productionBatchToDoc;
    case "ProductType":
      return productTypeToDoc;
    case "ExpenseCategory":
      return expenseCategoryToDoc;
    case "JournalEntry":
      return journalEntryToDoc;
    case "AccountingGeneratedJournal":
      return accountingGeneratedJournalToDoc;
    default:
      return (doc) => ({
        title: `${collectionName} ${safeStr(doc?._id || "")}`.trim(),
        text: truncate(JSON.stringify(doc || {}), 1800),
      });
  }
}

module.exports = {
  truncate,
  guessBuilder,
};
