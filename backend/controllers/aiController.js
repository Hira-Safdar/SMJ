const AIChat = require("../models/AIChat");
const Transaction = require("../models/transactionModel");
const ProductionBatch = require("../models/productionBatchModel");
const GatePass = require("../models/gatePassModel");
const StockLedger = require("../models/stockLedgerModel");
const Company = require("../models/companyModel");
const JournalEntry = require("../models/journalEntryModel");
const AccountingGeneratedJournal = require("../models/accountingGeneratedJournalModel");
const axios = require("axios");
const {
  retrieveKnowledgeContext,
  formatKnowledgeForPrompt,
} = require("../services/aiKnowledgeRetrieval");
const { answerFromManual } = require("../services/aiManualHelp");

const DAY_MS = 24 * 60 * 60 * 1000;


const toNum = (value) => Number(value || 0);
const fmtAmount = (value) => Math.round(toNum(value)).toLocaleString("en-US");
const fmtKg = (value) => `${Math.round(toNum(value)).toLocaleString("en-US")} kg`;

const paidAmount = (tx) => {
  const total = toNum(tx.totalAmount);
  if (tx.paymentStatus === "PAID") return total;
  if (tx.paymentStatus === "PARTIAL") return toNum(tx.partialPaid);
  return 0;
};

const remainingAmount = (tx) => {
  const total = toNum(tx.totalAmount);
  if (tx.paymentStatus === "UNPAID") return total;
  if (tx.paymentStatus === "PARTIAL") return Math.max(total - toNum(tx.partialPaid), 0);
  return 0;
};

async function buildBusinessSnapshot() {
  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);

  const inRange = (since) => ({
    $or: [{ date: { $gte: since } }, { createdAt: { $gte: since } }],
  });

  const [
    sales7,
    sales30,
    purchases7,
    purchases30,
    stockAgg,
    paddyAgg,
    inProcessCount,
    completedCount,
    batchDoneCount,
    outputAgg,
    gateIn7,
    gateOut7,
    gateIn30,
    gateOut30,
    journalTotals,
    savedJournalReportsTotal,
  ] =
    await Promise.all([
      Transaction.find({ type: "SALE", ...inRange(since7) })
        .select("totalAmount partialPaid paymentStatus saleKind date createdAt")
        .lean(),
      Transaction.find({ type: "SALE", ...inRange(since30) })
        .select("totalAmount partialPaid paymentStatus saleKind date createdAt")
        .lean(),
      Transaction.find({ type: "PURCHASE", ...inRange(since7) })
        .select("totalAmount partialPaid paymentStatus purchaseKind date createdAt")
        .lean(),
      Transaction.find({ type: "PURCHASE", ...inRange(since30) })
        .select("totalAmount partialPaid paymentStatus purchaseKind date createdAt")
        .lean(),
      // IMPORTANT: brands are unique, and the same productType can appear under different brands.
      // Group by brand/trademark (companyName) + productTypeId to avoid mixing different brands together.
      StockLedger.aggregate([
        {
          $group: {
            _id: { brandName: "$companyName", productTypeId: "$productTypeId" },
            brandName: { $last: "$companyName" },
            productTypeId: { $last: "$productTypeId" },
            productTypeName: { $last: "$productTypeName" },
            inKg: {
              $sum: {
                $cond: [{ $eq: ["$type", "IN"] }, "$netWeightKg", 0],
              },
            },
            outKg: {
              $sum: {
                $cond: [{ $eq: ["$type", "OUT"] }, "$netWeightKg", 0],
              },
            },
          },
        },
      ]),
      // Unprocessed Paddy is stored in ledger with productTypeId null and productTypeName "Paddy"/"Unprocessed Paddy".
      StockLedger.aggregate([
        {
          $match: {
            productTypeId: null,
            productTypeName: { $in: ["Paddy", "Unprocessed Paddy", "paddy", "unprocessed paddy"] },
          },
        },
        {
          $group: {
            _id: { brandName: "$companyName" },
            brandName: { $last: "$companyName" },
            inKg: {
              $sum: {
                $cond: [{ $eq: ["$type", "IN"] }, "$netWeightKg", 0],
              },
            },
            outKg: {
              $sum: {
                $cond: [{ $eq: ["$type", "OUT"] }, "$netWeightKg", 0],
              },
            },
          },
        },
      ]),
      ProductionBatch.countDocuments({ status: "IN_PROCESS" }),
      ProductionBatch.countDocuments({ status: "COMPLETED", batchDone: false }),
      ProductionBatch.countDocuments({ batchDone: true }),
      ProductionBatch.aggregate([
        { $unwind: "$outputs" },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalKg: { $sum: "$outputs.netWeightKg" },
          },
        },
      ]),
      GatePass.aggregate([
        { $match: { type: "IN", date: { $gte: since7 } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalQty: { $sum: "$totalQuantity" },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]),
      GatePass.aggregate([
        { $match: { type: "OUT", date: { $gte: since7 } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalQty: { $sum: "$totalQuantity" },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]),
      GatePass.aggregate([
        { $match: { type: "IN", date: { $gte: since30 } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalQty: { $sum: "$totalQuantity" },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]),
      GatePass.aggregate([
        { $match: { type: "OUT", date: { $gte: since30 } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalQty: { $sum: "$totalQuantity" },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]),
      JournalEntry.aggregate([
        {
          $facet: {
            total: [{ $count: "count" }],
            posted: [{ $match: { status: "POSTED" } }, { $count: "count" }],
            reversed: [{ $match: { status: "REVERSED" } }, { $count: "count" }],
            last7: [{ $match: { date: { $gte: since7 } } }, { $count: "count" }],
            last30: [{ $match: { date: { $gte: since30 } } }, { $count: "count" }],
            byVoucherType: [
              { $group: { _id: "$voucherType", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
          },
        },
      ]),
      AccountingGeneratedJournal.countDocuments({ reportKey: "journal" }),
    ]);

  const effectiveTimeMs = (tx) => {
    const dateMs = tx?.date ? new Date(tx.date).getTime() : NaN;
    const createdMs = tx?.createdAt ? new Date(tx.createdAt).getTime() : NaN;
    if (!Number.isNaN(dateMs)) return dateMs;
    if (!Number.isNaN(createdMs)) return createdMs;
    return 0;
  };

  const filterSince = (rows, since) => {
    const sinceMs = since.getTime();
    return (Array.isArray(rows) ? rows : []).filter(
      (tx) => effectiveTimeMs(tx) >= sinceMs,
    );
  };

  // Defensive: query uses $or(date/createdAt), but we re-filter using effective timestamp
  // so totals always match the intended window.
  const sales7Filtered = filterSince(sales7, since7);
  const sales30Filtered = filterSince(sales30, since30);
  const purchases7Filtered = filterSince(purchases7, since7);
  const purchases30Filtered = filterSince(purchases30, since30);

  const sales7Total = sales7Filtered.reduce((sum, tx) => sum + toNum(tx.totalAmount), 0);
  const sales30Total = sales30Filtered.reduce((sum, tx) => sum + toNum(tx.totalAmount), 0);
  const purchases7Total = purchases7Filtered.reduce((sum, tx) => sum + toNum(tx.totalAmount), 0);
  const purchases30Total = purchases30Filtered.reduce((sum, tx) => sum + toNum(tx.totalAmount), 0);

  const received30 = sales30Filtered.reduce((sum, tx) => sum + paidAmount(tx), 0);
  const receivable30 = sales30Filtered.reduce((sum, tx) => sum + remainingAmount(tx), 0);

  const splitByKind = (rows, key) =>
    rows.reduce((acc, tx) => {
      const kind = String(tx?.[key] || "UNKNOWN").toUpperCase();
      acc[kind] = (acc[kind] || 0) + toNum(tx.totalAmount);
      return acc;
    }, {});

  const sales30ByKind = splitByKind(sales30Filtered, "saleKind");
  const sales7ByKind = splitByKind(sales7Filtered, "saleKind");
  const purchases30ByKind = splitByKind(purchases30Filtered, "purchaseKind");
  const purchases7ByKind = splitByKind(purchases7Filtered, "purchaseKind");

  const aggRow = (arr) => (Array.isArray(arr) && arr[0] ? arr[0] : { count: 0, totalQty: 0, totalAmount: 0 });
  const in7 = aggRow(gateIn7);
  const out7 = aggRow(gateOut7);
  const in30 = aggRow(gateIn30);
  const out30 = aggRow(gateOut30);

  const outputsByStatus = (Array.isArray(outputAgg) ? outputAgg : []).reduce((acc, row) => {
    const key = String(row?._id || "ALL");
    acc[key] = { count: toNum(row.count), totalKg: toNum(row.totalKg) };
    return acc;
  }, {});

  const stockRows = stockAgg
    .filter((row) => row && row.productTypeId)
    .map((row) => {
      const balanceKg = toNum(row.inKg) - toNum(row.outKg);
      return {
        brandName: String(row.brandName || "").trim() || "Unbranded",
        productTypeId: String(row.productTypeId),
        productTypeName: String(row.productTypeName || "Unknown").trim() || "Unknown",
        balanceKg,
      };
    });

  const paddyByBrand = (Array.isArray(paddyAgg) ? paddyAgg : [])
    .map((row) => ({
      brandName: String(row.brandName || "").trim() || "Unbranded",
      balanceKg: toNum(row.inKg) - toNum(row.outKg),
    }))
    .filter((row) => row.balanceKg > 0)
    .sort((a, b) => b.balanceKg - a.balanceKg);

  const totalPositiveKg = stockRows.reduce(
    (sum, row) => sum + Math.max(0, toNum(row.balanceKg)),
    0,
  );

  const topStockItems = [...stockRows]
    .filter((row) => toNum(row.balanceKg) > 0)
    .sort((a, b) => toNum(b.balanceKg) - toNum(a.balanceKg))
    .slice(0, 12);

  const lowStockItems = stockRows
    .filter((row) => row.balanceKg > 0 && row.balanceKg <= 300)
    .sort((a, b) => a.balanceKg - b.balanceKg)
    .slice(0, 5);

  const outOfStockItems = stockRows
    .filter((row) => row.balanceKg <= 0)
    .sort((a, b) => a.productTypeName.localeCompare(b.productTypeName))
    .slice(0, 5);

  const jt = Array.isArray(journalTotals) && journalTotals[0] ? journalTotals[0] : {};
  const pickCount = (arr) => (Array.isArray(arr) && arr[0] ? toNum(arr[0].count) : 0);
  const journalByVoucherType = Array.isArray(jt.byVoucherType)
    ? jt.byVoucherType.reduce((acc, r) => {
        const k = String(r?._id || "UNKNOWN");
        acc[k] = toNum(r?.count);
        return acc;
      }, {})
    : {};

  return {
    generatedAt: now.toISOString(),
    windows: {
      last7DaysSince: since7.toISOString(),
      last30DaysSince: since30.toISOString(),
    },
    sales: {
      last7Days: sales7Total,
      last30Days: sales30Total,
      collectedLast30Days: received30,
      receivableLast30Days: receivable30,
      last7DaysByKind: sales7ByKind,
      last30DaysByKind: sales30ByKind,
    },
    purchases: {
      last7Days: purchases7Total,
      last30Days: purchases30Total,
      last7DaysByKind: purchases7ByKind,
      last30DaysByKind: purchases30ByKind,
    },
    stock: {
      productionTotalKg: totalPositiveKg,
      topStockItems,
      lowStockItems,
      outOfStockItems,
      totalTrackedProducts: stockRows.length,
      unprocessedPaddyByBrand: paddyByBrand,
    },
    production: {
      inProcessBatches: inProcessCount,
      completedBatches: completedCount,
      batchDoneBatches: batchDoneCount,
      outputsByStatus,
    },
    gatepass: {
      inwardLast7Days: { count: toNum(in7.count), totalQty: toNum(in7.totalQty), totalAmount: toNum(in7.totalAmount) },
      outwardLast7Days: { count: toNum(out7.count), totalQty: toNum(out7.totalQty), totalAmount: toNum(out7.totalAmount) },
      inwardLast30Days: { count: toNum(in30.count), totalQty: toNum(in30.totalQty), totalAmount: toNum(in30.totalAmount) },
      outwardLast30Days: { count: toNum(out30.count), totalQty: toNum(out30.totalQty), totalAmount: toNum(out30.totalAmount) },
    },
    accounting: {
      journalEntries: {
        total: pickCount(jt.total),
        posted: pickCount(jt.posted),
        reversed: pickCount(jt.reversed),
        last7Days: pickCount(jt.last7),
        last30Days: pickCount(jt.last30),
        byVoucherType: journalByVoucherType,
      },
      savedJournalReports: {
        total: toNum(savedJournalReportsTotal),
      },
    },
  };
}

function generateAutoSuggestions(snapshot) {
  const items = [];
  const receivable = toNum(snapshot?.sales?.receivableLast30Days);
  const lowStockItems = Array.isArray(snapshot?.stock?.lowStockItems)
    ? snapshot.stock.lowStockItems
    : [];
  const inProcess = toNum(snapshot?.production?.inProcessBatches);
  const sales7 = toNum(snapshot?.sales?.last7Days);
  const purchases7 = toNum(snapshot?.purchases?.last7Days);

  if (receivable > 0) {
    items.push({
      type: "customer",
      title: "Follow up pending receivables",
      description: `Outstanding receivables in last 30 days are around PKR ${fmtAmount(
        receivable,
      )}. Prioritize follow-ups for unpaid and partial invoices.`,
      priority: receivable >= 500000 ? "high" : "medium",
      data: { receivableLast30Days: receivable },
      userId: "system",
      status: "pending",
    });
  }

  if (lowStockItems.length > 0) {
    const names = lowStockItems
      .slice(0, 3)
      .map((x) => `${x.productTypeName} (${Math.round(x.balanceKg)} kg)`)
      .join(", ");
    items.push({
      type: "inventory",
      title: "Replenish low stock products",
      description: `Low stock detected: ${names}. Plan purchase/production before these SKUs run out.`,
      priority: "high",
      data: { lowStockItems },
      userId: "system",
      status: "pending",
    });
  }

  if (inProcess >= 5) {
    items.push({
      type: "gatepass",
      title: "Review in-process production load",
      description: `${inProcess} production batches are currently in process. Review bottlenecks and close aged batches.`,
      priority: "medium",
      data: { inProcessBatches: inProcess },
      userId: "system",
      status: "pending",
    });
  }

  if (sales7 > 0 && purchases7 > sales7 * 1.2) {
    items.push({
      type: "pricing",
      title: "Check pricing and sales conversion",
      description: `Last 7 days purchases (PKR ${fmtAmount(
        purchases7,
      )}) are much higher than sales (PKR ${fmtAmount(
        sales7,
      )}). Review pricing, promotions, and sales follow-up.`,
      priority: "medium",
      data: { sales7Days: sales7, purchases7Days: purchases7 },
      userId: "system",
      status: "pending",
    });
  }

  if (items.length === 0) {
    items.push({
      type: "general",
      title: "Business metrics are stable",
      description:
        "No high-risk pattern detected right now. Continue daily monitoring for receivables, stock, and in-process batches.",
      priority: "low",
      data: { stable: true },
      userId: "system",
      status: "pending",
    });
  }

  return items.slice(0, 6);
}



function buildLocalAIReply(message, snapshot) {
  const text = String(message || "").toLowerCase().trim();
  const sales30 = toNum(snapshot?.sales?.last30Days);
  const collected30 = toNum(snapshot?.sales?.collectedLast30Days);
  const receivable30 = toNum(snapshot?.sales?.receivableLast30Days);
  const purchases30 = toNum(snapshot?.purchases?.last30Days);
  const inProcess = toNum(snapshot?.production?.inProcessBatches);
  const lowStockItems = Array.isArray(snapshot?.stock?.lowStockItems)
    ? snapshot.stock.lowStockItems
    : [];

  if (text.includes("sale") || text.includes("sales") || text.includes("revenue")) {
    return [
      `Sales in last 30 days: PKR ${fmtAmount(sales30)}.`,
      `Collected amount: PKR ${fmtAmount(collected30)}.`,
      `Pending receivable: PKR ${fmtAmount(receivable30)}.`,
    ].join("\n");
  }

  if (text.includes("purchase") || text.includes("expense")) {
    return `Purchases in last 30 days are about PKR ${fmtAmount(
      purchases30,
    )}. Compare this with current sales trend before the next procurement cycle.`;
  }

  if (text.includes("stock") || text.includes("inventory")) {
    const totalKg = toNum(snapshot?.stock?.totalPositiveKg);
    if (!lowStockItems.length) {
      if (text.includes("total") || text.includes("how much") || text.includes("kitna")) {
        return `Total available stock is about ${fmtKg(totalKg)}.`;
      }
      return "No low-stock alert under 300 kg right now. Inventory looks stable.";
    }
    if (text.includes("total") || text.includes("how much") || text.includes("kitna")) {
      return `Total available stock is about ${fmtKg(totalKg)}.`;
    }
    const lines = lowStockItems
      .slice(0, 5)
      .map((row) => `- ${row.productTypeName}: ${fmtKg(row.balanceKg)}`)
      .join("\n");
    return `Low stock items (<= 300 kg):\n${lines}`;
  }

  if (text.includes("production") || text.includes("batch")) {
    return `Currently ${inProcess} production batch(es) are in process.`;
  }

  if (
    text.includes("suggest") ||
    text.includes("advice") ||
    text.includes("recommend")
  ) {
    const items = generateAutoSuggestions(snapshot).slice(0, 3);
    return items.map((x, i) => `${i + 1}. ${x.title} - ${x.description}`).join("\n");
  }

  return [
    "Current business snapshot:",
    `- Sales (30d): PKR ${fmtAmount(sales30)}`,
    `- Purchases (30d): PKR ${fmtAmount(purchases30)}`,
    `- Receivables (30d): PKR ${fmtAmount(receivable30)}`,
    `- In-process batches: ${inProcess}`,
    'Ask me about sales, stock, purchases, receivables, or production for focused insights.',
  ].join("\n");
}

function detectIntent(rawMessage) {
  const msg = String(rawMessage || "").toLowerCase();
  const has = (s) => msg.includes(s);

  const wantsTotal = has("total") || has("overall") || has("kitna") || has("how much") || has("sum");
  const wantsCount = wantsTotal || has("count") || has("numbers") || has("how many") || has("kitne");
  const wantsList = has("list") || has("show") || has("all") || has("names") || has("name") || has("customers") || has("customer");
  const wantsProduction = has("production") || has("finished") || has("rice stock");

  const navWords =
    has("how to") ||
    has("how do i") ||
    has("where is") ||
    has("where can i") ||
    has("open") ||
    has("navigate") ||
    has("sub tab") ||
    has("submenu") ||
    has("module") ||
    has("tab") ||
    has("kahan") ||
    has("kaise") ||
    has("kaisy") ||
    has("kaisa") ||
    has("kidhr");

  const moduleWords =
    has("gate pass") ||
    has("gatepass") ||
    has("production") ||
    has("stock") ||
    has("inventory") ||
    has("accounting") ||
    has("finance") ||
    has("journal") ||
    has("voucher") ||
    has("ledger") ||
    has("trial") ||
    has("profit") ||
    has("loss") ||
    has("balance sheet") ||
    has("cash flow") ||
    has("reports") ||
    has("settings") ||
    has("system settings") ||
    has("masterdata") ||
    has("master data") ||
    has("customer list");

  if (navWords && moduleWords) return { type: "nav_help", q: String(rawMessage || "").trim() };

  // Managerial stock module has been removed from the system UI.
  if (has("managerial") || has("office") || has("admin stock")) {
    return { type: "managerial_removed" };
  }

  if ((has("stock") || has("inventory")) && wantsTotal) {
    if (wantsProduction) return { type: "stock_total_production" };
    return { type: "stock_total_production" };
  }
  if (has("low stock") || (has("stock") && has("low"))) return { type: "stock_low" };
  if (has("top stock") || (has("stock") && (has("top") || has("highest")))) return { type: "stock_top" };
  if ((has("stock") || has("inventory")) && wantsProduction) return { type: "stock_top" };
  if (has("paddy") || has("unprocessed paddy") || has("unprocessed")) {
    if (has("which") || has("brand") || has("brnd")) return { type: "paddy_brands" };
    return { type: "paddy_brands" };
  }

  if (has("sale") || has("sales") || has("revenue")) return { type: "sales_summary" };
  if (has("purchase") || has("purchases")) return { type: "purchases_summary" };
  if (has("receivable") || has("pending payment") || has("due") || has("overdue")) return { type: "receivables_summary" };
  if (has("production") || has("batch")) return { type: "production_summary" };

  if (has("journal") || has("voucher")) {
    if (wantsCount) return { type: "journal_entries_summary" };
    if (wantsList) return { type: "journal_entries_recent" };
    return { type: "journal_entries_summary" };
  }

  if (has("suggest") || has("recommend") || has("advice")) return { type: "suggestions" };

  if (has("customer") || has("customers")) {
    // Try to capture a search query: "customer <name/phone>"
    const m = String(rawMessage || "").match(/customers?\s+(?:named|name|with|of|for)?\s*[:\-]?\s*(.+)$/i);
    const q = m && m[1] ? String(m[1]).trim() : "";
    if (q && q.length >= 2) return { type: "customer_search", q };
    if (wantsList) return { type: "customer_list" };
    return { type: "customer_list" };
  }

  // "invoice INV-..." -> return customer name
  const inv = String(rawMessage || "").match(/inv[-\s]*[a-z0-9\-]+/i);
  if (inv) return { type: "invoice_customer", invoiceNo: inv[0].replace(/\s+/g, "") };

  return { type: "general" };
}

function answerFromSnapshot(intent, snapshot) {
  if (!snapshot) return null;
  const lowStockItems = Array.isArray(snapshot?.stock?.lowStockItems)
    ? snapshot.stock.lowStockItems
    : [];
  const topStockItems = Array.isArray(snapshot?.stock?.topStockItems)
    ? snapshot.stock.topStockItems
    : [];
  const paddyByBrand = Array.isArray(snapshot?.stock?.unprocessedPaddyByBrand)
    ? snapshot.stock.unprocessedPaddyByBrand
    : [];

  if (intent.type === "stock_total") {
    return `Total available production stock is about ${fmtKg(
      toNum(snapshot?.stock?.productionTotalKg),
    )}.`;
  }
  if (intent.type === "stock_total_production") {
    return `Available production stock is about ${fmtKg(
      toNum(snapshot?.stock?.productionTotalKg),
    )}.`;
  }
  if (intent.type === "stock_low") {
    if (!lowStockItems.length) return "No low-stock items under 300 kg right now.";
    return (
      "Low stock items (<= 300 kg):\n" +
      lowStockItems.map((r) => `- ${r.productTypeName}: ${fmtKg(r.balanceKg)}`).join("\n")
    );
  }
  if (intent.type === "stock_top") {
    if (!topStockItems.length) return "No stock items found.";
    return (
      "Top stock items:\n" +
      topStockItems.map((r) => `- ${r.productTypeName}: ${fmtKg(r.balanceKg)}`).join("\n")
    );
  }
  if (intent.type === "managerial_removed") {
    return "Managerial stock module has been removed. Ask about Production Stock instead.";
  }
  if (intent.type === "paddy_brands") {
    if (!paddyByBrand.length)
      return "No Unprocessed Paddy stock found for any company name.";
    const top = paddyByBrand[0];
    const lines = paddyByBrand.slice(0, 10).map((r) => `- ${r.brandName}: ${fmtKg(r.balanceKg)}`).join("\n");
    return `Company Names with Unprocessed Paddy:\n${lines}\n\nTop company: ${top.brandName} (${fmtKg(top.balanceKg)}).`;
  }
  if (intent.type === "sales_summary") {
    return [
      `Sales (7d): PKR ${fmtAmount(snapshot?.sales?.last7Days)}`,
      `Sales (30d): PKR ${fmtAmount(snapshot?.sales?.last30Days)}`,
      `Collected (30d): PKR ${fmtAmount(snapshot?.sales?.collectedLast30Days)}`,
      `Receivables (30d): PKR ${fmtAmount(snapshot?.sales?.receivableLast30Days)}`,
    ].join("\n");
  }
  if (intent.type === "purchases_summary") {
    return [
      `Purchases (7d): PKR ${fmtAmount(snapshot?.purchases?.last7Days)}`,
      `Purchases (30d): PKR ${fmtAmount(snapshot?.purchases?.last30Days)}`,
    ].join("\n");
  }
  if (intent.type === "receivables_summary") {
    return `Receivables (30d): PKR ${fmtAmount(snapshot?.sales?.receivableLast30Days)}`;
  }
  if (intent.type === "production_summary") {
    return `In-process batches: ${toNum(snapshot?.production?.inProcessBatches)}`;
  }
  if (intent.type === "journal_entries_summary") {
    const j = snapshot?.accounting?.journalEntries || {};
    const total = toNum(j.total);
    const last30 = toNum(j.last30Days);
    const posted = toNum(j.posted);
    const reversed = toNum(j.reversed);
    return [
      `Journal entries (total): ${total}`,
      `Posted: ${posted}`,
      `Reversed: ${reversed}`,
      `Last 30 days: ${last30}`,
    ].join("\n");
  }
  if (intent.type === "suggestions") {
    const items = generateAutoSuggestions(snapshot).slice(0, 5);
    return items.map((x, i) => `${i + 1}. ${x.title} - ${x.description}`).join("\n");
  }
  return null;
}

async function answerFromDatabase(intent) {
  if (intent.type === "customer_list") {
    const rows = await Company.find({})
      .sort({ createdAt: -1 })
      .limit(25)
      .select("name phone")
      .lean();
    if (!rows.length) return "No customers found.";
    return (
      "Recent customers:\n" +
      rows
        .map((c) => `- ${String(c.name || "").trim() || "Unnamed"}${c.phone ? ` (${c.phone})` : ""}`)
        .join("\n")
    );
  }

  if (intent.type === "customer_search") {
    const q = String(intent.q || "").trim();
    if (!q) return "Tell me the customer name/phone to search.";
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const rows = await Company.find({ $or: [{ name: rx }, { phone: rx }] })
      .limit(20)
      .select("name phone address email")
      .lean();
    if (!rows.length) return `No customer matched "${q}".`;
    return (
      `Customers matching "${q}":\n` +
      rows
        .map((c) => `- ${String(c.name || "").trim() || "Unnamed"}${c.phone ? ` (${c.phone})` : ""}`)
        .join("\n")
    );
  }

  if (intent.type === "invoice_customer") {
    const invoiceNo = String(intent.invoiceNo || "").trim();
    const tx = await Transaction.findOne({ invoiceNo: new RegExp(`^${invoiceNo}$`, "i") })
      .select("invoiceNo companyName")
      .lean();
    if (!tx) return `Invoice not found: ${invoiceNo}`;
    return `Invoice ${tx.invoiceNo}: Customer is ${tx.companyName || "Unknown"}.`;
  }

  return null;
}

async function generateAIResponse({ message, context, history, snapshot, ragText, forceProvider }) {
  const hfToken = process.env.HF_API_TOKEN || process.env.HUGGINGFACE_API_TOKEN;
  const hfModel = process.env.HF_MODEL || process.env.HUGGINGFACE_MODEL;
  const hfBaseUrl = String(process.env.HF_BASE_URL || "https://router.huggingface.co").replace(
    /\/+$/,
    "",
  );
  const debug = String(process.env.AI_DEBUG || "").trim() === "1";
  const forceHF = String(forceProvider || "").trim().toLowerCase() === "huggingface";
  if (debug && hfToken) {
    const tail = String(hfToken).slice(-6);
    console.log(`[AI] HF token loaded (last6=${tail}) model=${hfModel || "n/a"}`);
  }
  if (hfToken && hfModel) {
    try {
      const chatHistory = Array.isArray(history)
        ? history.slice(-8).map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content || ""),
          }))
        : [];

      const baseRules = [
        "You are the SMJ Rice Mill AI assistant.",
        "Give concise and practical answers based on the provided business snapshot and retrieved knowledge.",
        "Never invent financial values not present in snapshot.",
        "For journals, use snapshot.accounting.journalEntries.* counts.",
      ].join(" ");

      const isFlanT5 = String(hfModel || "").toLowerCase().includes("flan-t5");

      const prompt = isFlanT5
        ? [
            "Instruction: Answer using the snapshot + retrieved knowledge. If data is missing, say what is missing.",
            `Rules: ${baseRules}`,
            `Context: ${context || "general"}`,
            `Snapshot JSON: ${JSON.stringify(snapshot)}`,
            ragText ? `Retrieved Knowledge:\n${ragText}` : null,
            `Question: ${String(message || "")}`,
            "Answer:",
          ]
            .filter(Boolean)
            .join("\n")
        : [
            baseRules,
            `Context: ${context || "general"}`,
            `Snapshot: ${JSON.stringify(snapshot)}`,
            ragText ? `Retrieved Knowledge:\n${ragText}` : null,
          ].join("\n");

      const headers = { Authorization: `Bearer ${hfToken}` };
      const axiosCfg = { headers, timeout: 45000 };

      // Hugging Face Router provides OpenAI-compatible endpoints.
      // Try chat completions first (works for many instruction/chat-tuned models).
      if (!isFlanT5) {
        try {
            const chatRes = await axios.post(
              `${hfBaseUrl}/v1/chat/completions`,
              {
                model: hfModel,
                messages: [
                  {
                    role: "system",
                    content: [
                      "You are the SMJ Rice Mill AI assistant.",
                      "Answer naturally and helpfully.",
                      "If a question needs current system data, use the snapshot; if data is missing, say so.",
                      "Never invent financial numbers.",
                      "For journal totals, read snapshot.accounting.journalEntries.*",
                      `Context: ${context || "general"}`,
                      `Snapshot JSON: ${JSON.stringify(snapshot)}`,
                      ragText ? `Retrieved Knowledge:\n${ragText}` : null,
                    ].join("\n"),
                  },
                  ...chatHistory,
                  { role: "user", content: String(message || "") },
                ],
                temperature: 0.3,
                max_tokens: 256,
              },
            axiosCfg,
          );
          const text = chatRes?.data?.choices?.[0]?.message?.content;
          if (text && String(text).trim()) {
            return { text: String(text).trim(), provider: "huggingface", model: hfModel };
          }
        } catch (err) {
            if (debug || forceHF) {
              const status = err?.response?.status;
              const statusText = err?.response?.statusText;
              const snippet = JSON.stringify(err?.response?.data || {}).slice(0, 300);
              return {
                text: buildLocalAIReply(message, snapshot),
                provider: forceHF ? "huggingface" : "local",
                model: hfModel,
                error: `HF chat ${status || "ERR"} ${statusText || ""}${snippet ? ` - ${snippet}` : ""}`.trim(),
              };
            }
        }
      }

      // For Flan-T5 and other non-chat models, use HF router inference path.
      // The old api-inference domain is deprecated; router uses /hf-inference/models/<model>.
      if (isFlanT5) {
        try {
          const inferRes = await axios.post(
            `${hfBaseUrl}/hf-inference/models/${encodeURIComponent(hfModel)}`,
            { inputs: prompt },
            axiosCfg,
          );
          const data = inferRes?.data;
          const generated = Array.isArray(data) ? data?.[0]?.generated_text : null;
          if (generated && String(generated).trim()) {
            return { text: String(generated).trim(), provider: "huggingface", model: hfModel };
          }
          if (data?.generated_text && String(data.generated_text).trim()) {
            return { text: String(data.generated_text).trim(), provider: "huggingface", model: hfModel };
          }
        } catch (err) {
          if (debug || forceHF) {
            const status = err?.response?.status;
            const statusText = err?.response?.statusText;
            const snippet = JSON.stringify(err?.response?.data || {}).slice(0, 300);
            return {
              text: buildLocalAIReply(message, snapshot),
              provider: forceHF ? "huggingface" : "local",
              model: hfModel,
              error: `HF inference ${status || "ERR"} ${statusText || ""}${snippet ? ` - ${snippet}` : ""}`.trim(),
            };
          }
        }
      }

      // Fallback to classic completions endpoint (only for providers that support it).
      try {
        const compRes = await axios.post(
          `${hfBaseUrl}/v1/completions`,
          {
            model: hfModel,
            prompt,
            temperature: 0.3,
            max_tokens: 256,
          },
          axiosCfg,
        );
        const text = compRes?.data?.choices?.[0]?.text;
        if (text && String(text).trim()) {
          return { text: String(text).trim(), provider: "huggingface", model: hfModel };
        }
      } catch (err) {
        if (debug || forceHF) {
          const status = err?.response?.status;
          const statusText = err?.response?.statusText;
          const snippet = JSON.stringify(err?.response?.data || {}).slice(0, 300);
          return {
            text: buildLocalAIReply(message, snapshot),
            provider: forceHF ? "huggingface" : "local",
            model: hfModel,
            error: `HF completion ${status || "ERR"} ${statusText || ""}${snippet ? ` - ${snippet}` : ""}`.trim(),
          };
        }
      }
    } catch (err) {
      console.error("HF AI fallback to local:", err.message);
      if (debug || forceHF) {
        return {
          text: buildLocalAIReply(message, snapshot),
          provider: forceHF ? "huggingface" : "local",
          model: hfModel,
          error: `HF request failed - ${err.message}`,
        };
      }
    }
  }

  // If HF is configured but failed (and debug isn't enabled), we still return model so UI can show "configured but not used".
  if (hfToken && hfModel) {
    if (forceHF) {
      return {
        text: buildLocalAIReply(message, snapshot),
        provider: "huggingface",
        model: hfModel,
        error: "HF request failed (no response).",
      };
    }
    return { text: buildLocalAIReply(message, snapshot), provider: "local", model: hfModel, error: null };
  }
  return { text: buildLocalAIReply(message, snapshot), provider: "local", model: null, error: null };
}

// ============ CHATBOT ENDPOINTS ============

// Send message to AI chatbot
exports.sendMessage = async (req, res) => {
  try {
    const { sessionId, message, context } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({
        success: false,
        message: "Session ID and message are required",
      });
    }

    const cleanMessage = String(message).trim();
    if (!cleanMessage) {
      return res.status(400).json({
        success: false,
        message: "Message cannot be empty",
      });
    }
    if (cleanMessage.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Message is too long (max 2000 characters)",
      });
    }

    const saveChat = String(process.env.AI_SAVE_CHAT || "").trim() === "1";

    // Find or create chat session (optional persistence)
    let chat = null;
    if (saveChat) {
      chat = await AIChat.findOne({ sessionId, active: true });

      if (!chat) {
        chat = new AIChat({
          userId: req.body.userId || "anonymous",
          sessionId,
          context:
            ["gatepass", "inventory", "general", "reports"].includes(context)
              ? context
              : "general",
          messages: [],
        });
      }

      // Add user message
      chat.messages.push({
        role: "user",
        content: cleanMessage,
        timestamp: new Date(),
      });
    }

    const forceProvider = String(process.env.AI_FORCE_PROVIDER || "").trim().toLowerCase();
    const snapshot = await buildBusinessSnapshot();
    const intent = detectIntent(cleanMessage);
    const shouldForceRemote = forceProvider === "huggingface";

    const ragCtx = await retrieveKnowledgeContext(cleanMessage);
    const ragText = formatKnowledgeForPrompt(ragCtx);

    // Deterministic answers for key queries to avoid hallucination (always allowed, even when HF is enabled).
    const direct = shouldForceRemote ? null : answerFromSnapshot(intent, snapshot);
    const manualDirect =
      shouldForceRemote || direct != null ? null : await answerFromManual(intent, cleanMessage);
    const dbDirect =
      shouldForceRemote || direct != null || manualDirect != null
        ? null
        : await answerFromDatabase(intent);

    const ai =
      direct != null
        ? { text: direct, provider: "local", model: process.env.HF_MODEL || null, error: null }
        : manualDirect != null
          ? { text: manualDirect, provider: "local", model: process.env.HF_MODEL || null, error: null }
        : dbDirect != null
          ? { text: dbDirect, provider: "local", model: process.env.HF_MODEL || null, error: null }
          : await generateAIResponse({
              message: cleanMessage,
              context: (chat && chat.context) || "general",
              history: (chat && chat.messages) || [],
              snapshot,
              ragText,
              forceProvider,
            });

    const aiResponse = {
      role: "assistant",
      content: ai.text,
      timestamp: new Date(),
    };

    if (saveChat && chat) {
      // Add AI response
      chat.messages.push(aiResponse);
      await chat.save();
    }

    res.json({
      success: true,
      data: {
        response: aiResponse.content,
        sessionId,
        messageCount: saveChat && chat ? chat.messages.length : null,
        aiProvider: ai.provider,
        aiModel: ai.model,
        ...(ai.error ? { aiError: ai.error } : {}),
      },
    });
  } catch (error) {
    console.error("AI chat error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process message",
    });
  }
};

// Get chat history
exports.getChatHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const saveChat = String(process.env.AI_SAVE_CHAT || "").trim() === "1";
    if (!saveChat) {
      return res.json({
        success: true,
        data: { messages: [] },
      });
    }

    const chat = await AIChat.findOne({ sessionId, active: true });

    if (!chat) {
      return res.json({
        success: true,
        data: { messages: [] },
      });
    }

    res.json({
      success: true,
      data: {
        messages: chat.messages,
        context: chat.context,
        sessionId: chat.sessionId,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Clear chat history
exports.clearChat = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const saveChat = String(process.env.AI_SAVE_CHAT || "").trim() === "1";
    const result = saveChat ? await AIChat.deleteMany({ sessionId }) : { deletedCount: 0 };

    res.json({
      success: true,
      message: "Chat deleted",
      data: { deletedCount: result?.deletedCount || 0 },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ============ DEBUG / CONFIG ============

exports.getConfig = async (_req, res) => {
  const hfToken = process.env.HF_API_TOKEN || process.env.HUGGINGFACE_API_TOKEN || "";
  const hfModel = process.env.HF_MODEL || process.env.HUGGINGFACE_MODEL || "";
  const debug = String(process.env.AI_DEBUG || "").trim() === "1";
  const forceProvider = String(process.env.AI_FORCE_PROVIDER || "").trim().toLowerCase() || null;

  res.json({
    success: true,
    data: {
      aiDebug: debug,
      forceProvider,
      hfModel: hfModel || null,
      hfModelSet: !!hfModel,
      hfTokenSet: !!hfToken,
      hfTokenPrefix: hfToken ? String(hfToken).slice(0, 6) : null,
    },
  });
};
