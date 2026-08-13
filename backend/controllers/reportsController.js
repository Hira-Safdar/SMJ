const mongoose = require("mongoose");
const StockLedger = require("../models/stockLedgerModel");
const ProductionBatch = require("../models/productionBatchModel");
const ProductionGroup = require("../models/productionGroupModel");
const GatePass = require("../models/gatePassModel");
const ProductType = require("../models/productTypeModel");
const AccountingFilterTemplate = require("../models/accountingFilterTemplateModel");
const { getDateRangeFromQuery } = require("../utils/dateRange");

const parseRange = (req) => getDateRangeFromQuery(req.query);
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const parseListParam = (value) => {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((v) => String(v).split(","))
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
};

const buildNameOrIdFilter = async (Model, values = [], { idField, nameField }) => {
  const list = parseListParam(values);
  if (!list.length) return null;

  const ids = list.filter((value) => mongoose.isValidObjectId(value));
  const directNames = list.filter((value) => !mongoose.isValidObjectId(value));
  const matchedRows = ids.length && Model ? await Model.find({ _id: { $in: ids } }).select("_id name").lean() : [];
  const matchedNames = (matchedRows || []).map((row) => String(row?.name || "").trim()).filter(Boolean);
  const uniqueNames = Array.from(new Set([...directNames, ...matchedNames]));

  const clauses = [];
  if (ids.length) clauses.push({ [idField]: { $in: ids } });
  uniqueNames.forEach((name) => {
    clauses.push({ [nameField]: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") } });
  });

  if (!clauses.length) return null;
  if (clauses.length === 1) return clauses[0];
  return { $or: clauses };
};

exports.getStockReport = async (req, res) => {
  try {
    const { start, end } = parseRange(req);
    const companyIds = parseListParam(req.query.companyId || req.query.companyIds);
    const productTypeIds = parseListParam(req.query.productTypeId || req.query.productTypeIds);

    const filter = { date: { $gte: start, $lte: end } };
    if (companyIds.length) {
      const companyFilter = await buildNameOrIdFilter(null, companyIds, {
        idField: "companyId",
        nameField: "companyName",
      });
      if (companyFilter) Object.assign(filter, companyFilter);
    }
    if (productTypeIds.length) {
      const productFilter = await buildNameOrIdFilter(ProductType, productTypeIds, {
        idField: "productTypeId",
        nameField: "productTypeName",
      });
      if (productFilter) Object.assign(filter, productFilter);
    }

    const productionLedgers = await StockLedger.find(filter).lean();
    const productTypes = await ProductType.find({}).lean().select("_id name pricePerKg defaultSaleRate");
    const ptMap = new Map(productTypes.map((p) => [String(p._id), p]));
    const productionMap = new Map();
    productionLedgers.forEach((l) => {
      const key = `${l.companyName || ""}__${l.productTypeName || ""}`;
      const prev = productionMap.get(key) || {
        companyName: l.companyName || "-",
        productTypeName: l.productTypeName || "-",
        productTypeId: l.productTypeId ? String(l.productTypeId) : "",
        balanceKg: 0,
        valuePKR: 0,
        lastEntryDate: l.createdAt || l.date || null,
      };
      const qty = Number(l.netWeightKg || 0);
      prev.balanceKg += l.type === "OUT" ? -qty : qty;
      const currentRowDate = new Date(l.createdAt || l.date || 0).getTime();
      const prevRowDate = new Date(prev.lastEntryDate || 0).getTime();
      if (currentRowDate > prevRowDate) prev.lastEntryDate = l.createdAt || l.date || prev.lastEntryDate;
      const pt = l.productTypeId ? ptMap.get(String(l.productTypeId)) : null;
      const rate = Number(pt?.pricePerKg || 0) || Number(pt?.defaultSaleRate || 0) || 0;
      // Value is derived from current balance only (not movement).
      prev.valuePKR = Number((Number(prev.balanceKg || 0) * rate).toFixed(2));
      productionMap.set(key, prev);
    });

    res.json({
      success: true,
        data: {
          production: Array.from(productionMap.values()),
          asOfDate: end,
          rangeStart: start,
        },
      });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load stock report." });
  }
};

exports.getGatePassReport = async (req, res) => {
  try {
    const { start, end } = parseRange(req);
    const type = String(req.query.type || "").trim().toUpperCase();
    const sender = String(req.query.sender || req.query.senderName || "").trim();
    const company = String(req.query.company || req.query.companyName || "").trim();
    const product = String(req.query.product || req.query.productName || "").trim();
    const customer = String(req.query.customer || req.query.customerName || "").trim();

    const filter = { date: { $gte: start, $lte: end } };
    if (type === "IN" || type === "OUT") filter.type = type;

    const rows = await GatePass.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const matches = (haystack = "", needle = "") => {
      const h = String(haystack || "").toLowerCase();
      const n = String(needle || "").trim().toLowerCase();
      return n ? h.includes(n) : true;
    };

    const data = (rows || []).map((gp) => {
      const items = Array.isArray(gp.items) ? gp.items : [];
      const companyNames = Array.from(
        new Set(
          items
            .map((it) =>
              String(
                it?.brand ||
                  it?.brandName ||
                  it?.companyName ||
                  it?.company ||
                  it?.supplier ||
                  gp.supplier ||
                  ""
              ).trim()
            )
            .filter(Boolean)
        )
      );
      const productNames = Array.from(
        new Set(
          items
            .map((it) => {
              const custom = String(it?.customItemName || "").trim();
              const itemType = String(it?.itemType || "").trim();
              return custom || itemType;
            })
            .filter(Boolean)
        )
      );
      const totalBags = items.reduce((sum, it) => sum + (Number(it?.bagCount) || 0), 0);
      const totalWeightKg = items.reduce(
        (sum, it) => sum + (Number(it?.netWeightKg || it?.quantity) || 0),
        0
      );

      return {
        _id: gp._id,
        date: gp.date || gp.createdAt,
        gatePassNo: gp.gatePassNo || "-",
        type: gp.type || "-",
        senderName: String(gp.senderName || gp.supplier || "").trim() || "-",
        partyName: gp.type === "OUT" ? gp.customer || "-" : gp.supplier || "-",
        truckNo: gp.truckNo || "-",
        freightCharges: Number(gp.freightCharges || 0),
        companyNames: companyNames.join(", ") || "-",
        productNames: productNames.join(", ") || "-",
        totalBags: Number(totalBags || 0),
        totalWeightKg: Number(totalWeightKg.toFixed(3)),
        totalAmount: Number(Number(gp.totalAmount || 0).toFixed(2)),
        amountPaid: Number(gp.amountPaid || 0),
        remainingAmount: Number(gp.remainingAmount || 0),
        paymentStatus: gp.paymentStatus || "-",
        status: gp.status || "-",
        items: items,
        targetPath: `/gatepass?tab=${gp.type || "IN"}&highlight=${encodeURIComponent(String(gp._id || ""))}`,
      };
    });

    let result = data;
    if (sender) result = result.filter((r) => matches(r.senderName, sender) || matches(r.partyName, sender));
    if (company) result = result.filter((r) => matches(r.companyNames, company));
    if (product) result = result.filter((r) => matches(r.productNames, product));
    if (customer) result = result.filter((r) => matches(r.partyName, customer));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load gatepass report." });
  }
};

// -------------------- STOCK MOVEMENT (LEDGER) --------------------

exports.getStockMovementReport = async (req, res) => {
  try {
    const { start, end } = parseRange(req);
    const companyIds = parseListParam(req.query.companyId || req.query.companyIds);
    const productTypeIds = parseListParam(req.query.productTypeId || req.query.productTypeIds);

    const filter = { date: { $gte: start, $lte: end } };
    if (companyIds.length) {
      const companyFilter = await buildNameOrIdFilter(null, companyIds, {
        idField: "companyId",
        nameField: "companyName",
      });
      if (companyFilter) Object.assign(filter, companyFilter);
    }
    if (productTypeIds.length) {
      const productFilter = await buildNameOrIdFilter(ProductType, productTypeIds, {
        idField: "productTypeId",
        nameField: "productTypeName",
      });
      if (productFilter) Object.assign(filter, productFilter);
    }

    const rows = await StockLedger.find(filter).sort({ date: 1, createdAt: 1 }).lean();
    const batchNoSet = new Set();
    const gatePassIdSet = new Set();
    rows.forEach((r) => {
      const batchMatch = String(r.remarks || "").match(/\bPB-\d{8}-\d{6}\b/i);
      if (batchMatch?.[0]) batchNoSet.add(batchMatch[0]);
      if (r.gatePassId) gatePassIdSet.add(String(r.gatePassId));
    });

    const [batchRows, gatePassRows] = await Promise.all([
      batchNoSet.size
        ? ProductionBatch.find({ batchNo: { $in: Array.from(batchNoSet) } })
            .select("_id batchNo status")
            .lean()
        : Promise.resolve([]),
      gatePassIdSet.size
        ? GatePass.find({ _id: { $in: Array.from(gatePassIdSet) } })
            .select("_id gatePassNo type")
            .lean()
        : Promise.resolve([]),
    ]);
    const batchMap = new Map((batchRows || []).map((b) => [String(b.batchNo || ""), b]));
    const gatePassMap = new Map((gatePassRows || []).map((g) => [String(g._id), g]));

    let balance = 0;
    const data = rows.map((r) => {
      const qty = Number(r.netWeightKg || 0);
      const stockIn = r.type === "OUT" ? 0 : qty;
      const stockOut = r.type === "OUT" ? qty : 0;
      balance += stockIn - stockOut;
      const batchMatch = String(r.remarks || "").match(/\bPB-\d{8}-\d{6}\b/i);
      const batchNo = batchMatch?.[0] || "";
      const gatePass = r.gatePassId ? gatePassMap.get(String(r.gatePassId)) : null;
      const referenceType = gatePass?.gatePassNo || r.gatePassNo ? "gatepass" : batchNo && batchMap.has(batchNo) ? "production" : "other";
      const reference = gatePass?.gatePassNo || r.gatePassNo || batchNo || (r.transactionId ? `TX-${String(r.transactionId).slice(-6)}` : "");
      const referenceTarget =
        referenceType === "gatepass"
          ? {
              path: `/gatepass?tab=${
                gatePass?.type || (String(reference).startsWith("GPO-") ? "OUT" : "IN")
              }&highlight=${encodeURIComponent(String(gatePass?._id || reference))}`,
            }
          : referenceType === "production"
          ? {
              path: `/production?batchNo=${encodeURIComponent(batchNo)}`,
            }
          : null;
      return {
        _id: r._id,
        date: r.date,
        companyId: r.companyId ? String(r.companyId) : "",
        companyName: r.companyName || "",
        productTypeId: r.productTypeId ? String(r.productTypeId) : "",
        productTypeName: r.productTypeName || "",
        stockInKg: Number(stockIn.toFixed(3)),
        stockOutKg: Number(stockOut.toFixed(3)),
        balanceKg: Number(balance.toFixed(3)),
        reference,
        referenceType,
        referenceTarget,
        remarks: r.remarks || "",
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load stock movement." });
  }
};

// -------------------- PRODUCTION SUMMARY / BY-PRODUCT --------------------

function normName(s) {
  return String(s || "").toLowerCase().trim();
}

exports.getProductionSummaryReport = async (req, res) => {
  try {
    const { start, end } = parseRange(req);
    const companyIds = parseListParam(req.query.companyId || req.query.companyIds);

    // Batches in range decide WHICH groups appear in the report.
    const filter = { date: { $gte: start, $lte: end } };
    if (companyIds.length) filter.sourceCompanyId = { $in: companyIds };

    const batches = await ProductionBatch.find(filter).sort({ date: -1 }).lean();
    const groupIds = Array.from(
      new Set(batches.map((b) => b.groupId).filter(Boolean))
    );

    // Full detail for every included group (all of its batches + outputs +
    // remaining), so each group report is complete regardless of range overlap.
    const [groups, allGroupBatches] = await Promise.all([
      groupIds.length
        ? ProductionGroup.find({ _id: { $in: groupIds } })
            .sort({ createdAt: -1 })
            .lean()
        : Promise.resolve([]),
      groupIds.length
        ? ProductionBatch.find({ groupId: { $in: groupIds } }).sort({ date: 1 }).lean()
        : Promise.resolve([]),
    ]);
    const groupMap = new Map(groups.map((g) => [String(g._id), g]));

    // key -> batches (legacy batches without a group are keyed by company name)
    const byGroup = new Map();
    batches.forEach((b) => {
      const key = b.groupId ? String(b.groupId) : `legacy:${b.sourceCompanyName || "other"}`;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(b);
    });

    const statusLabel = (s) =>
      ({ OPEN: "In-Process", READY: "Ready", DONE: "Done" }[s] || s || "-");

    const data = Array.from(byGroup.entries()).map(([key]) => {
      const group = groupMap.get(key) || null;
      // Full sub-batch list of the group (or just the in-range batches for legacy rows).
      const bsSorted = (
        group
          ? allGroupBatches.filter((b) => String(b.groupId) === key)
          : batches.filter((b) => `legacy:${b.sourceCompanyName || "other"}` === key)
      ).sort((a, b) => new Date(a.date || a.createdAt || 0) - new Date(b.date || b.createdAt || 0));

      const outputsArr = [...(group?.outputs || [])].sort(
        (a, b) => new Date(a.outputDate || 0) - new Date(b.outputDate || 0)
      );

      const totalInputKg = Number(
        bsSorted.reduce((s, b) => s + (Number(b.paddyWeightKg) || 0), 0).toFixed(3)
      );
      const totalSourceBags = Number(
        bsSorted.reduce((s, b) => s + (Number(b.sourceBags) || 0), 0).toFixed(0)
      );
      const totalOutputKg = Number(
        outputsArr.reduce((s, o) => s + (Number(o.netWeightKg) || 0), 0).toFixed(3)
      );
      const totalOutputBags = Number(
        outputsArr.reduce((s, o) => s + (Number(o.numBags) || 0), 0).toFixed(0)
      );
      const remainingKg = Number(
        (
          group?.remainingPaddyKg ??
          Math.max(0, totalInputKg - totalOutputKg)
        ).toFixed(3)
      );
      const remainingPct =
        totalInputKg > 0 ? Number(((remainingKg / totalInputKg) * 100).toFixed(1)) : 0;
      const recoveryPct =
        totalInputKg > 0 ? Number(((totalOutputKg / totalInputKg) * 100).toFixed(1)) : 0;
      const lossPct = totalInputKg > 0
        ? Number(Math.max(0, 100 - recoveryPct - remainingPct).toFixed(1))
        : 0;

      const status =
        group?.status ||
        (bsSorted.length &&
        bsSorted.every((b) => b.status === "COMPLETED")
          ? "READY"
          : "OPEN") ||
        "-";
      const latest = bsSorted[bsSorted.length - 1] || null;

      const movements = [];
      bsSorted.forEach((b) =>
        movements.push({
          date: b.date || b.createdAt || null,
          type: "INPUT",
          label: "Sub-batch added",
          product: String(b.sourceProductTypeName || "Unprocessed Paddy").trim(),
          weightKg: Number(Number(b.paddyWeightKg || 0).toFixed(3)),
          bags: Number(b.sourceBags || 0),
          batchNo: b.batchNo || "",
        })
      );
      outputsArr.forEach((o) =>
        movements.push({
          date: o.outputDate || null,
          type: "OUTPUT",
          label: "Product produced",
          product: o.productTypeName || "",
          weightKg: Number(Number(o.netWeightKg || 0).toFixed(3)),
          bags: Number(o.numBags || 0),
          batchNo: group?.groupNo || "",
        })
      );
      if (group && group.status === "DONE" && group.batchDoneAt) {
        movements.push({
          date: group.batchDoneAt,
          type: "STATUS",
          label: "Group finalized (batch done)",
          product: "",
          weightKg: 0,
          bags: 0,
          batchNo: group.groupNo || "",
        });
      }
      movements.sort(
        (a, b) => new Date(a.date || 0) - new Date(b.date || 0)
      );

      const pick = (needle) =>
        outputsArr
          .filter((o) => normName(o.productTypeName).includes(needle))
          .reduce((s, o) => s + (Number(o.netWeightKg) || 0), 0);
      const pickBags = (needle) =>
        outputsArr
          .filter((o) => normName(o.productTypeName).includes(needle))
          .reduce((s, o) => s + (Number(o.numBags) || 0), 0);

      return {
        _id: key,
        groupId: group ? String(group._id) : "",
        groupNo: group?.groupNo || bsSorted[0]?.batchNo || "",
        companyId: bsSorted[0]?.sourceCompanyId ? String(bsSorted[0].sourceCompanyId) : "",
        companyName: group?.sourceCompanyName || bsSorted[0]?.sourceCompanyName || "",
        status,
        statusLabel: statusLabel(status),
        createdDate: group?.createdAt || bsSorted[0]?.date || null,
        completedDate:
          group?.batchDoneAt || (group?.status === "DONE" ? group?.updatedAt : null) || null,
        remarks: group?.remarks || "",
        rawMaterial:
          String(latest?.sourceProductTypeName || "").trim() || "Unprocessed Paddy",
        inputs: {
          rawMaterial: String(latest?.sourceProductTypeName || "").trim() || "Unprocessed Paddy",
          totalWeightKg: totalInputKg,
          totalSourceBags,
          batchCount: bsSorted.length,
        },
        batches: bsSorted.map((b) => ({
          batchNo: b.batchNo,
          date: b.date || b.createdAt || null,
          rawMaterial: String(b.sourceProductTypeName || "Unprocessed Paddy").trim(),
          weightKg: Number(Number(b.paddyWeightKg || 0).toFixed(3)),
          sourceBags: Number(b.sourceBags || 0),
          status: b.status || "IN_PROCESS",
          statusLabel: b.status === "COMPLETED" ? "Completed" : "In-Process",
          ownerType: b.ownerType || "SMJ",
        })),
        outputs: outputsArr.map((o) => ({
          productTypeName: o.productTypeName,
          weightKg: Number(Number(o.netWeightKg || 0).toFixed(3)),
          bags: Number(o.numBags || 0),
          outputDate: o.outputDate || null,
          pctOfOutput:
            totalOutputKg > 0
              ? Number(((Number(o.netWeightKg) / totalOutputKg) * 100).toFixed(1))
              : 0,
          pctOfInput:
            totalInputKg > 0
              ? Number(((Number(o.netWeightKg) / totalInputKg) * 100).toFixed(1))
              : 0,
        })),
        totals: {
          totalInputKg,
          totalOutputKg,
          totalOutputBags,
          remainingKg,
          remainingPct,
          recoveryPct,
          lossPct,
        },
        movements,
        // Flat summary fields (backward compatible with generated reports)
        date: bsSorted[0]?.date || null,
        batchNo: group?.groupNo || bsSorted[0]?.batchNo || "",
        companyName: group?.sourceCompanyName || bsSorted[0]?.sourceCompanyName || "",
        sourceProductTypeName: String(latest?.sourceProductTypeName || "").trim() || "Unprocessed Paddy",
        sourceBags: totalSourceBags,
        paddyInputKg: totalInputKg,
        riceOutputKg: Number(pick("rice").toFixed(3)),
        brokenOutputKg: Number(pick("broken").toFixed(3)),
        huskOutputKg: Number(pick("husk").toFixed(3)),
        branOutputKg: Number(pick("bran").toFixed(3)),
        riceBags: Number(pickBags("rice").toFixed(0)),
        brokenBags: Number(pickBags("broken").toFixed(0)),
        huskBags: Number(pickBags("husk").toFixed(0)),
        branBags: Number(pickBags("bran").toFixed(0)),
        totalOutputKg,
        totalBags: totalOutputBags,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load production summary." });
  }
};

// -------------------- REPORT FILTER TEMPLATES --------------------

exports.getReportTemplates = async (req, res) => {
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

exports.createReportTemplate = async (req, res) => {
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
