// backend/controllers/dashboardController.js
const Company = require("../models/companyModel");
const ProductType = require("../models/productTypeModel");
const ProductionBatch = require("../models/productionBatchModel");
const Transaction = require("../models/transactionModel");
const GatePass = require("../models/gatePassModel");
const SystemSettings = require("../models/systemSettingsModel");
const StockLedger = require("../models/stockLedgerModel");

const paidAmount = (t) => {
  const status = String(t?.paymentStatus || "").toUpperCase();
  const total = Number(t?.totalAmount || 0);
  const partial = Number(t?.partialPaid || 0);
  if (status === "PAID") return total;
  if (status === "PARTIAL") return partial;
  return 0;
};

const getDashboardStats = async (req, res) => {
  try {
    // Today range (server local time)
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );

    const [settings, totalCompanies, totalProducts, gatePasses] =
      await Promise.all([
        SystemSettings.findOne({}).lean(),
        Company.countDocuments(),
        ProductType.countDocuments(),
        GatePass.find({
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        })
          .select("type items totalAmount supplier customer gatePassNo createdAt")
          .lean(),
      ]);

    const bagKg = Number(settings?.defaultBagWeightKg || 65) || 65;
    const moundKg = 40;

    const toKg = (qty, unit) => {
      if (!qty) return 0;
      const u = String(unit || "").toLowerCase();
      if (u === "kg") return qty;
      if (u === "ton") return qty * 1000;
      if (u === "bags") return qty * bagKg;
      if (u === "mounds") return qty * moundKg;
      return qty;
    };

    const toBags = (qty, unit) => {
      if (!qty) return 0;
      const u = String(unit || "").toLowerCase();
      if (u === "bags") return qty;
      const kg = toKg(qty, unit);
      return kg ? kg / bagKg : 0;
    };

    let todayTotalPaddyKg = 0;
    let todayTotalOutputKg = 0;
    let bagsInward = 0;
    let bagsOutward = 0;
    let inwardEntries = 0;
    let outwardEntries = 0;

    gatePasses.forEach((gp) => {
      const items = Array.isArray(gp.items) ? gp.items : [];
      const sumKg = items.reduce(
        (sum, it) => sum + toKg(Number(it.quantity || 0), it.unit),
        0
      );
      const sumBags = items.reduce(
        (sum, it) => sum + toBags(Number(it.quantity || 0), it.unit),
        0
      );
      if (gp.type === "IN") {
        todayTotalPaddyKg += sumKg;
        bagsInward += sumBags;
        inwardEntries += 1;
      }
      if (gp.type === "OUT") {
        todayTotalOutputKg += sumKg;
        bagsOutward += sumBags;
        outwardEntries += 1;
      }
    });

    const gatePassOutPayments = await GatePass.find({ type: "OUT" })
      .select("paymentStatus amountPaid remainingAmount customer gatePassNo")
      .lean();

    let cashInHand = 0;
    let pendingPayments = 0;
    let pendingGatePass = 0;
    const pendingGatePassDetails = [];
    gatePassOutPayments.forEach((gp) => {
      const paid = Number(gp.amountPaid || 0);
      const rem = Number(gp.remainingAmount || 0);
      cashInHand += paid;
      if (rem > 0) {
        pendingPayments += rem;
        pendingGatePass += rem;
        pendingGatePassDetails.push({
          _id: gp._id,
          customer: gp.customer || "Customer",
          gatePassNo: gp.gatePassNo || "-",
          paymentStatus: gp.paymentStatus || "UNPAID",
          amountPaid: paid,
          totalAmount: Number(gp.totalAmount || 0),
          remainingAmount: rem,
        });
      }
    });

    const RECENT_LIMIT = 8;
    const [recentGatePasses, recentSales, recentBatches, recentProdOutputs] = await Promise.all([
      GatePass.find({})
        .sort({ createdAt: -1 })
        .limit(RECENT_LIMIT)
        .select("type items totalAmount supplier customer gatePassNo createdAt")
        .lean(),
      Transaction.find({ type: "SALE" })
        .sort({ date: -1, createdAt: -1 })
        .limit(RECENT_LIMIT)
        .select("companyName invoiceNo paymentStatus totalAmount partialPaid date createdAt")
        .lean(),
      ProductionBatch.find({ status: "COMPLETED" })
        .sort({ updatedAt: -1 })
        .limit(RECENT_LIMIT)
        .select("batchNo totalOutputWeightKg updatedAt")
        .lean(),
      StockLedger.find({
        type: "IN",
        remarks: { $regex: "^Production output \\(", $options: "i" },
      })
        .sort({ date: -1, createdAt: -1 })
        .limit(RECENT_LIMIT)
        .select("companyName productTypeName netWeightKg remarks date createdAt")
        .lean(),
    ]);

    const activityRows = [];
    recentGatePasses.forEach((gp) => {
      const items = Array.isArray(gp.items) ? gp.items : [];
      const sumKg = items.reduce(
        (sum, it) => sum + toKg(Number(it.quantity || 0), it.unit),
        0
      );
      const title =
        gp.type === "IN" ? "Inward Entry - Raw Paddy" : "Outward Entry";
      const party =
        gp.type === "IN" ? gp.supplier || "SMJ Own" : gp.customer || "Customer";
      activityRows.push({
        type: "GATE_PASS",
        title,
        meta: `${party} · ${items.length || 0} items · ${sumKg.toFixed(0)} kg`,
        amount: gp.totalAmount || 0,
        createdAt: gp.createdAt,
      });
    });
    recentSales.forEach((t) => {
      const paid = paidAmount(t);
      if (paid <= 0) return;
      activityRows.push({
        type: "PAYMENT",
        title: "Payment Received",
        meta: `${t.companyName || "Customer"} · Invoice ${t.invoiceNo}`,
        amount: paid,
        createdAt: t.createdAt || t.date,
      });
    });
    recentBatches.forEach((b) => {
      activityRows.push({
        type: "PRODUCTION",
        title: "Production Complete",
        meta: `${b.batchNo} · ${Number(b.totalOutputWeightKg || 0).toFixed(0)} kg`,
        amount: 0,
        createdAt: b.updatedAt,
      });
    });
    (recentProdOutputs || []).forEach((l) => {
      activityRows.push({
        type: "PRODUCTION_OUTPUT",
        title: "Production Output Completed",
        meta: `${l.companyName || "-"} · ${l.productTypeName || "-"} · ${Number(l.netWeightKg || 0).toFixed(0)} kg`,
        amount: 0,
        createdAt: l.date || l.createdAt,
      });
    });
    (Array.isArray(settings?.backupHistory) ? settings.backupHistory.slice(0, 2) : []).forEach((entry) => {
      const isRestore = String(entry.action || "").toUpperCase() === "RESTORE";
      const isFailed = String(entry.status || "").toUpperCase() === "FAILED";
      const scope = String(entry.scope || "").toLowerCase() === "full" ? "Full System" : entry.moduleName || "Module";
      activityRows.push({
        type: isFailed ? "BACKUP_ERROR" : isRestore ? "RESTORE" : "BACKUP",
        title: isFailed
          ? `${isRestore ? "Restore" : "Backup"} Failed`
          : isRestore
          ? "Backup Restored"
          : "Backup Completed",
        meta: `${scope} · ${entry.fileName || "backup.json"} · ${Number(entry.recordCount || 0)} entries`,
        amount: 0,
        createdAt: entry.createdAt,
      });
    });

    activityRows.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const recentActivities = activityRows.slice(0, RECENT_LIMIT);

    const [completedBatches, salesAll, purchasesAll] =
      await Promise.all([
        ProductionBatch.find({ status: "COMPLETED" })
          .select("outputs")
          .lean(),
        Transaction.find({ type: "SALE" })
          .select("items")
          .lean(),
        Transaction.find({ type: "PURCHASE" })
          .select("items")
          .lean(),
      ]);

    const productionInKg = completedBatches.reduce((sum, b) => {
      const outputs = b.outputs || [];
      const outSum = outputs.reduce(
        (s, o) => s + Number(o.netWeightKg || 0),
        0
      );
      return sum + outSum;
    }, 0);
    const productionByProductMap = new Map();
    const addToProduct = (name, delta) => {
      const key = name || "Unknown";
      const current = productionByProductMap.get(key) || 0;
      productionByProductMap.set(key, current + delta);
    };
    completedBatches.forEach((b) => {
      const outputs = b.outputs || [];
      outputs.forEach((o) => {
        const name = o.productTypeName || "Unknown";
        const net = Number(o.netWeightKg || 0);
        if (net > 0) addToProduct(name, net);
      });
    });
    const purchaseInKg = purchasesAll.reduce((sum, t) => {
      const items = t.items || [];
      const s = items.reduce((acc, it) => {
        if (it.productTypeId && it.netWeightKg) {
          return acc + Number(it.netWeightKg || 0);
        }
        return acc;
      }, 0);
      return sum + s;
    }, 0);
    purchasesAll.forEach((t) => {
      const items = t.items || [];
      items.forEach((it) => {
        if (!it.productTypeId) return;
        const name = it.productTypeName || "Unknown";
        const net = Number(it.netWeightKg || 0);
        if (net > 0) addToProduct(name, net);
      });
    });
    const salesOutKg = salesAll.reduce((sum, t) => {
      const items = t.items || [];
      const s = items.reduce(
        (acc, it) => acc + Number(it.netWeightKg || 0),
        0
      );
      return sum + s;
    }, 0);
    salesAll.forEach((t) => {
      const items = t.items || [];
      items.forEach((it) => {
        const name = it.productTypeName || "Unknown";
        const net = Number(it.netWeightKg || 0);
        if (net > 0) addToProduct(name, -net);
      });
    });
    // Gate pass stock adjustments for finished products (non-paddy).
    // Use ledger rows tied to gate passes only to avoid double-counting production outputs.
    const gatePassFinishedLedger = await StockLedger.find({
      gatePassId: { $ne: null },
      productTypeName: { $not: /^(paddy|unprocessed paddy)\s*$/i },
    })
      .select("type netWeightKg productTypeName")
      .lean();

    let gatePassFinishedDeltaKg = 0;
    gatePassFinishedLedger.forEach((l) => {
      const net = Number(l.netWeightKg || 0);
      if (!net) return;
      const delta = l.type === "OUT" ? -net : net;
      gatePassFinishedDeltaKg += delta;
      const name = l.productTypeName || "Unknown";
      addToProduct(name, delta);
    });

    const productionStockKg =
      productionInKg + purchaseInKg - salesOutKg + gatePassFinishedDeltaKg;

    // Raw paddy stock from full paddy ledger (gate pass + production batch allocation/returns)
    const paddyLedgerRows = await StockLedger.find({ productTypeId: null })
      .select("type netWeightKg productTypeName")
      .lean();
    const paddyKg = paddyLedgerRows.reduce((sum, l) => {
      const n = String(l.productTypeName || "").toLowerCase().trim();
      if (!(n === "paddy" || n === "unprocessed paddy")) return sum;
      const net = Number(l.netWeightKg || 0);
      if (!net) return sum;
      return sum + (l.type === "OUT" ? -net : net);
    }, 0);
    const productionBreakdown = Array.from(productionByProductMap.entries())
      .map(([name, value]) => ({ name, value: Math.max(0, value) }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);

    res.status(200).json({
      success: true,
      data: {
        totalCompanies,
        totalProducts,

        // Real-time from production
        todayTotalPaddyKg, // kg
        todayTotalOutputKg, // kg
        bagsInward: inwardEntries,
        bagsOutward: outwardEntries,

        // Finance
        cashInHand,
        pendingPayments,
        pendingPaymentsBreakdown: {
          gatePassOut: pendingGatePass,
          total: pendingPayments,
        },
        pendingGatePassDetails,

        recentActivities,
        stockSummary: {
          productionKg: Math.max(0, Number(productionStockKg.toFixed(3))),
          paddyKg: Math.max(0, Number(paddyKg.toFixed(3))),
        },
        stockSummaryBreakdown: {
          production: productionBreakdown,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard data",
      error: error.message,
    });
  }
};

module.exports = { getDashboardStats };

