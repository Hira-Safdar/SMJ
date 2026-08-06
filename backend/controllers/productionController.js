// backend/controllers/productionController.js
const mongoose = require("mongoose");
const ProductionBatch = require("../models/productionBatchModel");
const ProductionGroup = require("../models/productionGroupModel");
const StockLedger = require("../models/stockLedgerModel");
const SystemSettings = require("../models/systemSettingsModel");
const ProductType = require("../models/productTypeModel");
const { computeCurrentStock } = require("./stockController");

// PB-YYYYMMDD-HHMMSS / PG-YYYYMMDD-HHMMSS
function generateNo(prefix) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(
    d.getDate()
  )}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normBrand(s) {
  return String(s || "").trim();
}

/**
 * Current stock balance (kg) for a company + product from the live stock view.
 * Mirrors /api/stock/current so validation always matches what the UI shows.
 * paddy (productTypeId null) matches by product name ("Paddy"/"Unprocessed Paddy").
 */
async function getStockBalanceKg(companyName, productTypeId, productTypeName) {
  const name = String(companyName || "").trim().toLowerCase();
  if (!name) return 0;
  const { rows } = await computeCurrentStock();
  const row = (rows || []).find((r) => {
    if (String(r.companyName || "").toLowerCase() !== name) return false;
    if (productTypeId) return String(r.productTypeId || "") === String(productTypeId);
    return (
      String(r.productTypeName || "").toLowerCase() ===
      String(productTypeName || "Unprocessed Paddy").toLowerCase()
    );
  });
  return row ? Number(row.balanceKg || 0) : 0;
}

/** Resolve the standard bag weight (kg) for a product (default 65). */
async function bagWeightOf(productTypeId, productTypeName) {
  if (productTypeId) {
    const p = await ProductType.findById(productTypeId)
      .select("conversionFactors")
      .lean();
    const bw = Number(p?.conversionFactors?.Bag || 0);
    if (bw > 0) return bw;
  }
  return 65;
}

/** Product name to write into the stock ledger (paddy stays legacy "Unprocessed Paddy"). */
function ledgerProductName(productTypeId, productTypeName) {
  return productTypeId
    ? String(productTypeName || "").trim() || "Product"
    : "Unprocessed Paddy";
}

/** Recompute a group's totals from its batches + outputs. */
async function recomputeGroup(group, batches) {
  const totalPaddy = (batches || []).reduce(
    (s, b) => s + (Number(b.paddyWeightKg) || 0),
    0
  );
  const totalOutput = (group.outputs || []).reduce(
    (s, o) => s + (Number(o.netWeightKg) || 0),
    0
  );
  group.totalPaddyWeightKg = +totalPaddy.toFixed(3);
  group.totalOutputWeightKg = +totalOutput.toFixed(3);
  group.remainingPaddyKg = Math.max(0, +(totalPaddy - totalOutput).toFixed(3));

  if (!group.batchDone) {
    const anyInProcess = (batches || []).some((b) => b.status !== "COMPLETED");
    if (!anyInProcess && (batches || []).length > 0) {
      if (group.status === "OPEN") group.status = "READY";
    } else {
      group.status = "OPEN";
    }
  }
}

/**
 * Find (or create) the source-level group for a paddy company.
 * Reuses an active (OPEN/READY) group for the same source so a new batch
 * joins the existing cluster instead of creating a duplicate one.
 * Legacy batches without a groupId are adopted into the same group.
 */
async function ensureGroup(sourceCompanyId, sourceCompanyName) {
  const name = normBrand(sourceCompanyName);
  let group = await ProductionGroup.findOne({
    sourceCompanyName: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
    batchDone: false,
  }).sort({ createdAt: -1 });
  if (!group) {
    const existing = await ProductionGroup.countDocuments();
    group = new ProductionGroup({
      groupNo: generateNo("PG"),
      sourceCompanyId: sourceCompanyId || null,
      sourceCompanyName: name,
      status: "OPEN",
      outputs: [],
    });
    if (existing > 0) {
      // keep groupNo unique even across same-second creation
      let attempts = 0;
      while (
        attempts < 5 &&
        (await ProductionGroup.exists({ groupNo: group.groupNo }))
      ) {
        group.groupNo = generateNo("PG");
        attempts++;
      }
    }
    await group.save();
  } else if (sourceCompanyId) {
    group.sourceCompanyId = sourceCompanyId;
    await group.save();
  }
  // Adopt orphan batches (legacy data without a group) of the same source
  // so the source never shows two separate clusters.
  await ProductionBatch.updateMany(
    {
      groupId: null,
      sourceCompanyName: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
    },
    { $set: { groupId: group._id } }
  );
  return group;
}

/**
 * POST /api/production/batches
 * Body: { date, sourceCompanyName, sourceProductTypeId?, sourceProductTypeName?, sourceBags?, sourceWeightKg?, remarks? }
 * Creates a daily batch run and reserves the raw material (OUT) from stock
 * for the selected company + product. Products (not only paddy) can be the raw material.
 */
exports.createBatch = async (req, res) => {
  try {
    const {
      date,
      remarks,
      sourceCompanyId,
      sourceCompanyName,
      sourceProductTypeId,
      sourceProductTypeName,
      sourceBags,
      sourceWeightKg,
    } = req.body;
    if (!date)
      return res
        .status(400)
        .json({ success: false, message: "Field 'date' is required" });

    const sourceName = normBrand(sourceCompanyName);
    if (!sourceName) {
      return res.status(400).json({
        success: false,
        message: "Field 'sourceCompanyName' is required",
      });
    }

    const productTypeId = sourceProductTypeId || null;
    const productTypeName =
      String(sourceProductTypeName || "").trim() || "Unprocessed Paddy";

    let consumedKg = 0;
    if (sourceWeightKg != null && !isNaN(Number(sourceWeightKg))) {
      consumedKg = Number(sourceWeightKg);
    } else {
      const bags = Number(sourceBags) || 0;
      const bw = await bagWeightOf(productTypeId, productTypeName);
      consumedKg = bags * bw;
    }
    if (!(consumedKg > 0)) {
      return res.status(400).json({
        success: false,
        message: "Raw material weight must be greater than 0.",
      });
    }

    const bags =
      sourceBags != null && !isNaN(Number(sourceBags))
        ? Math.floor(Number(sourceBags))
        : Math.floor(consumedKg / (await bagWeightOf(productTypeId, productTypeName)));

    const available = await getStockBalanceKg(
      sourceName,
      productTypeId,
      productTypeName
    );
    if (available < consumedKg) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock for ${productTypeName} at ${sourceName}. Available: ${available.toFixed(
          3
        )} kg.`,
      });
    }

    let batchNo = generateNo("PB");
    let attempts = 0;
    while (attempts < 5 && (await ProductionBatch.exists({ batchNo }))) {
      batchNo = generateNo("PB");
      attempts++;
    }

    const settings = await SystemSettings.findOne({}).lean();
    const ownBrand =
      settings?.general?.companyName ||
      settings?.generalSettings?.companyName ||
      "SMJ";
    const ownerType =
      ownBrand && sourceName.toLowerCase() === String(ownBrand).trim().toLowerCase()
        ? "SMJ"
        : "CUSTOM";

    const group = await ensureGroup(sourceCompanyId, sourceName);

    const batch = new ProductionBatch({
      batchNo,
      date,
      status: "IN_PROCESS",
      paddyWeightKg: consumedKg,
      sourceCompanyId: sourceCompanyId || null,
      sourceCompanyName: sourceName,
      sourceProductTypeId: productTypeId,
      sourceProductTypeName: productTypeName,
      sourceBags: bags,
      ownerType,
      groupId: group._id,
      remarks: remarks || "",
    });
    const saved = await batch.save();

    try {
      const ledger = new StockLedger({
        date: saved.date,
        type: "OUT",
        companyId: sourceCompanyId || null,
        companyName: sourceName,
        productTypeId: productTypeId,
        productTypeName: ledgerProductName(productTypeId, productTypeName),
        numBags: bags,
        netWeightKg: saved.paddyWeightKg,
        gatePassId: null,
        gatePassNo: "",
        remarks: `Raw material assigned to production batch ${saved.batchNo} (${sourceName}) - ${productTypeName}`,
      });
      await ledger.save();
    } catch (e) {
      console.error("StockLedger (createBatch) error:", e);
    }

    const groups = await ProductionBatch.find({ groupId: group._id }).lean();
    await recomputeGroup(group, groups);
    await group.save();

    return res.status(201).json({ success: true, data: saved });
  } catch (err) {
    console.error("createBatch error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error creating batch." });
  }
};

/**
 * PUT /api/production/batches/:id
 * Body: { date?, paddyWeightKg?, sourceBags?, sourceWeightKg?, remarks? } — only for IN_PROCESS.
 */
exports.updateBatch = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid id" });

    const batch = await ProductionBatch.findById(id);
    if (!batch)
      return res
        .status(404)
        .json({ success: false, message: "Batch not found" });

    if (batch.status !== "IN_PROCESS") {
      return res.status(400).json({
        success: false,
        message: "Only in-process batches can be edited.",
      });
    }

    const { date, paddyWeightKg, sourceBags, sourceWeightKg, remarks } = req.body;

    if (date) batch.date = date;

    const productTypeId = batch.sourceProductTypeId || null;
    const productTypeName =
      String(batch.sourceProductTypeName || "").trim() || "Unprocessed Paddy";

    let delta = 0;
    let newWeight = null;
    if (sourceBags != null && !isNaN(Number(sourceBags))) {
      const bw = await bagWeightOf(productTypeId, productTypeName);
      newWeight = Number(sourceBags) * bw;
    } else if (sourceWeightKg != null && !isNaN(Number(sourceWeightKg))) {
      newWeight = Number(sourceWeightKg);
    } else if (paddyWeightKg != null && !isNaN(Number(paddyWeightKg))) {
      newWeight = Number(paddyWeightKg);
    }
    if (newWeight != null) {
      delta = newWeight - batch.paddyWeightKg;
      if (delta > 0) {
        const sourceName = String(batch.sourceCompanyName || "").trim();
        const available = await getStockBalanceKg(
          sourceName,
          productTypeId,
          productTypeName
        );
        if (available < delta) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${productTypeName} at ${sourceName}. Available extra: ${available.toFixed(
              3
            )} kg.`,
          });
        }
      }
      batch.paddyWeightKg = newWeight;
      if (sourceBags != null && !isNaN(Number(sourceBags))) {
        batch.sourceBags = Number(sourceBags);
      } else if (newWeight > 0) {
        const bw = await bagWeightOf(productTypeId, productTypeName);
        batch.sourceBags = Math.floor(newWeight / bw);
      }
    }

    if (remarks !== undefined) {
      batch.remarks = remarks || "";
    }

    const saved = await batch.save();

    if (delta !== 0) {
      try {
        const sourceName = String(batch.sourceCompanyName || "").trim();
        const isIncrease = delta > 0;
        const ledger = new StockLedger({
          date: saved.date,
          type: isIncrease ? "OUT" : "IN",
          companyId: batch.sourceCompanyId || null,
          companyName: sourceName,
          productTypeId: productTypeId,
          productTypeName: ledgerProductName(productTypeId, productTypeName),
          numBags: isIncrease ? (batch.sourceBags || 0) : 0,
          netWeightKg: Math.abs(delta),
          gatePassId: null,
          gatePassNo: "",
          remarks: isIncrease
            ? `Raw material adjustment (extra) - ${saved.batchNo} (${sourceName})`
            : `Raw material adjustment (return) - ${saved.batchNo} (${sourceName})`,
        });
        await ledger.save();
      } catch (e) {
        console.error("StockLedger (updateBatch) error:", e);
      }
    }

    if (batch.groupId) {
      const group = await ProductionGroup.findById(batch.groupId);
      if (group) {
        const groups = await ProductionBatch.find({ groupId: group._id }).lean();
        await recomputeGroup(group, groups);
        await group.save();
      }
    }

    return res.json({ success: true, data: saved });
  } catch (err) {
    console.error("updateBatch error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error updating batch." });
  }
};

/**
 * DELETE /api/production/batches/:id
 * Returns paddy to stock (IN) and removes the batch.
 */
exports.deleteBatch = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid id" });

    const batch = await ProductionBatch.findById(id);
    if (!batch)
      return res
        .status(404)
        .json({ success: false, message: "Batch not found" });

    const paddyWeight = batch.paddyWeightKg || 0;
    const sourceName = String(batch.sourceCompanyName || "").trim();
    const groupId = batch.groupId;
    const productTypeId = batch.sourceProductTypeId || null;
    const productTypeName =
      String(batch.sourceProductTypeName || "").trim() || "Unprocessed Paddy";

    await batch.deleteOne();

    if (paddyWeight > 0) {
      try {
        await StockLedger.create({
          date: batch.date,
          type: "IN",
          companyId: batch.sourceCompanyId || null,
          companyName: sourceName,
          productTypeId: productTypeId,
          productTypeName: ledgerProductName(productTypeId, productTypeName),
          numBags: batch.sourceBags || 0,
          netWeightKg: paddyWeight,
          gatePassId: null,
          gatePassNo: "",
          remarks: `Batch deleted, raw material returned - ${batch.batchNo} (${sourceName}) - ${productTypeName}`,
        });
      } catch (e) {
        console.error("StockLedger (deleteBatch) error:", e);
      }
    }

    if (groupId) {
      const group = await ProductionGroup.findById(groupId);
      if (group) {
        const groups = await ProductionBatch.find({ groupId: group._id }).lean();
        if (groups.length === 0 && (group.outputs || []).length === 0) {
          await ProductionGroup.deleteOne({ _id: group._id });
        } else {
          await recomputeGroup(group, groups);
          await group.save();
        }
      }
    }

    return res.json({ success: true, message: "Batch deleted and paddy returned to stock." });
  } catch (err) {
    console.error("deleteBatch error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error deleting batch." });
  }
};

/**
 * GET /api/production/batches
 * Query: status?, page?, limit?  (compat: batch list)
 */
exports.listBatches = async (req, res) => {
  try {
    let { status, page = 1, limit = 50 } = req.query;
    page = Number(page) || 1;
    limit = Number(limit) || 50;

    const q = {};
    if (status && ["IN_PROCESS", "COMPLETED"].includes(status))
      q.status = status;

    const total = await ProductionBatch.countDocuments(q);
    const data = await ProductionBatch.find(q)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({ success: true, total, page, limit, data });
  } catch (err) {
    console.error("listBatches error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching batches." });
  }
};

/**
 * GET /api/production/batches/:id
 */
exports.getBatchById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid id" });

    const batch = await ProductionBatch.findById(id).lean();
    if (!batch)
      return res
        .status(404)
        .json({ success: false, message: "Batch not found" });

    return res.json({ success: true, data: batch });
  } catch (err) {
    console.error("getBatchById error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching batch." });
  }
};

/**
 * POST /api/production/batches/:id/complete
 * Marks a daily run COMPLETED. Group becomes READY when all its batches are completed.
 */
exports.completeBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await ProductionBatch.findById(id);

    if (!batch)
      return res
        .status(404)
        .json({ success: false, message: "Batch not found" });

    if (batch.status === "COMPLETED") {
      return res
        .status(400)
        .json({ success: false, message: "Batch already completed." });
    }

    batch.status = "COMPLETED";
    const saved = await batch.save();

    if (batch.groupId) {
      const group = await ProductionGroup.findById(batch.groupId);
      if (group) {
        const groups = await ProductionBatch.find({ groupId: group._id }).lean();
        await recomputeGroup(group, groups);
        await group.save();
      }
    }

    return res.json({ success: true, data: saved });
  } catch (err) {
    console.error("completeBatch error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error completing batch." });
  }
};

/**
 * POST /api/production/batches/:id/reopen
 * Moves a completed daily run back to IN_PROCESS (group back to OPEN).
 */
exports.reopenBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await ProductionBatch.findById(id);

    if (!batch)
      return res.status(404).json({ success: false, message: "Batch not found" });

    if (batch.status !== "COMPLETED") {
      return res.status(400).json({ success: false, message: "Only completed batches can be reopened." });
    }

    batch.status = "IN_PROCESS";
    const saved = await batch.save();

    if (batch.groupId) {
      const group = await ProductionGroup.findById(batch.groupId);
      if (group) {
        group.status = "OPEN";
        await group.save();
      }
    }

    return res.json({ success: true, data: saved });
  } catch (err) {
    console.error("reopenBatch error:", err);
    return res.status(500).json({ success: false, message: "Error reopening batch." });
  }
};

/** Attach batches to groups (handles legacy batches with no groupId). */
function attachBatches(groups, batches) {
  const byId = new Map();
  groups.forEach((g) => {
    byId.set(String(g._id), { ...g, batches: [], outputs: g.outputs || [] });
  });
  const orphanBatches = [];
  batches.forEach((b) => {
    const key = String(b.groupId || "");
    if (byId.has(key)) byId.get(key).batches.push(b);
    else orphanBatches.push(b);
  });
  const result = Array.from(byId.values());
  if (orphanBatches.length) {
    const bySource = new Map();
    orphanBatches.forEach((b) => {
      const name = normBrand(b.sourceCompanyName) || "SMJ Own";
      if (!bySource.has(name)) {
        bySource.set(name, {
          _id: null,
          groupNo: "",
          sourceCompanyId: b.sourceCompanyId || null,
          sourceCompanyName: name,
          status: b.status === "COMPLETED" ? "READY" : "OPEN",
          batchDone: false,
          totalPaddyWeightKg: 0,
          totalOutputWeightKg: 0,
          remainingPaddyKg: 0,
          batches: [],
          outputs: [],
          legacy: true,
        });
      }
      bySource.get(name).batches.push(b);
    });
    bySource.forEach((g) => {
      g.totalPaddyWeightKg = +g.batches
        .reduce((s, b) => s + (Number(b.paddyWeightKg) || 0), 0)
        .toFixed(3);
      g.remainingPaddyKg = g.totalPaddyWeightKg;
      g.allBatchesCompleted = g.batches.every((b) => b.status === "COMPLETED");
      result.push(g);
    });
  }
  result.forEach((g) => {
    g.batches.sort((a, b) => new Date(b.date) - new Date(a.date));
    g.allBatchesCompleted =
      g.batches.length > 0 && g.batches.every((b) => b.status === "COMPLETED");
    if (g.batchDone) g.status = "DONE";
    else if (!g.allBatchesCompleted) g.status = "OPEN";
    else g.status = "READY";
  });
  result.sort((a, b) => {
    const aDate = a.batches[0]?.date || 0;
    const bDate = b.batches[0]?.date || 0;
    return new Date(bDate) - new Date(aDate);
  });
  return result;
}

/**
 * GET /api/production/overview
 * Returns all source groups with their batches and outputs.
 */
exports.getOverview = async (req, res) => {
  try {
    const [groups, batches] = await Promise.all([
      ProductionGroup.find({}).sort({ createdAt: -1 }).lean(),
      ProductionBatch.find({}).sort({ date: -1 }).lean(),
    ]);

    const data = attachBatches(groups, batches);

    const summary = {
      groups: data.length,
      openGroups: data.filter((g) => g.status === "OPEN").length,
      readyGroups: data.filter((g) => g.status === "READY").length,
      doneGroups: data.filter((g) => g.status === "DONE").length,
      totalPaddyKg: +data
        .reduce((s, g) => s + (Number(g.totalPaddyWeightKg) || 0), 0)
        .toFixed(3),
      totalOutputKg: +data
        .reduce((s, g) => s + (Number(g.totalOutputWeightKg) || 0), 0)
        .toFixed(3),
    };

    return res.json({ success: true, data, summary });
  } catch (err) {
    console.error("getOverview error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching production overview." });
  }
};

/**
 * GET /api/production/groups/:id
 */
exports.getGroupById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid id" });

    const [group, batches] = await Promise.all([
      ProductionGroup.findById(id).lean(),
      ProductionBatch.find({ groupId: id }).sort({ date: -1 }).lean(),
    ]);
    if (!group)
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });

    const data = attachBatches([group], batches)[0] || { ...group, batches: [], outputs: group.outputs || [] };
    return res.json({ success: true, data });
  } catch (err) {
    console.error("getGroupById error:", err);
    return res.status(500).json({ success: false, message: "Error fetching group." });
  }
};

/**
 * POST /api/production/groups/:id/outputs
 * Body: { productTypeId, productTypeName, weightKg, bagWeightEachKg, emptyBagWeightKg, outputDate? }
 * Requires group READY (all batches completed).
 *   numBags = floor(weightKg / bagWeightEachKg)   (like gatepass)
 *   netWeight = weightKg - numBags * emptyBagWeightKg
 */
exports.addOutput = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid id" });

    const { productTypeId, productTypeName, weightKg, bagWeightEachKg, emptyBagWeightKg, outputDate } = req.body;

    if (!productTypeId || !productTypeName) {
      return res.status(400).json({
        success: false,
        message: "Fields productTypeId and productTypeName are required.",
      });
    }

    const group = await ProductionGroup.findById(id);
    if (!group)
      return res.status(404).json({ success: false, message: "Group not found" });

    if (group.status !== "READY") {
      return res.status(400).json({
        success: false,
        message: "All batches must be completed before adding products.",
      });
    }
    if (group.batchDone) {
      return res.status(400).json({
        success: false,
        message: "This production group is already finalized.",
      });
    }

    const gross = Number(weightKg) || 0;
    const bagW = Number(bagWeightEachKg) || 0;
    const emptyBag = Number(emptyBagWeightKg) || 0;

    if (gross <= 0) {
      return res.status(400).json({
        success: false,
        message: "Weight must be greater than 0.",
      });
    }
    if (bagW <= 0) {
      return res.status(400).json({
        success: false,
        message: "Weight of bag must be greater than 0.",
      });
    }

    const bags = Math.floor(gross / bagW);
    const netWeight = +Math.max(gross - bags * emptyBag, 0).toFixed(3);

    if (netWeight <= 0) {
      return res.status(400).json({
        success: false,
        message: "Net weight must be greater than 0. Check weight, bag weight and empty bag weight.",
      });
    }

    const currentOutput = (group.outputs || []).reduce(
      (s, o) => s + (Number(o.netWeightKg) || 0),
      0
    );
    const remaining = Math.max(
      0,
      (Number(group.totalPaddyWeightKg) || 0) - currentOutput
    );
    if (netWeight > remaining) {
      return res.status(400).json({
        success: false,
        message: `Maximum product weight remaining: ${Math.round(remaining)} kg.`,
      });
    }

    const output = {
      productTypeId,
      productTypeName,
      weightKg: gross,
      bagWeightEachKg: bagW,
      numBags: bags,
      emptyBagWeightKg: emptyBag,
      netWeightKg: netWeight,
      outputDate: outputDate ? new Date(outputDate) : new Date(),
    };

    group.outputs.push(output);
    group.totalOutputWeightKg = +(
      (group.outputs || []).reduce((s, o) => s + (Number(o.netWeightKg) || 0), 0)
    ).toFixed(3);
    group.remainingPaddyKg = Math.max(
      0,
      +(Number(group.totalPaddyWeightKg || 0) - group.totalOutputWeightKg).toFixed(3)
    );
    const saved = await group.save();

    // Post finished-product stock for the source company.
    try {
      await StockLedger.create({
        date: output.outputDate || new Date(),
        type: "IN",
        companyId: group.sourceCompanyId || null,
        companyName: group.sourceCompanyName || "",
        productTypeId: output.productTypeId,
        productTypeName: output.productTypeName,
        numBags: output.numBags,
        netWeightKg: output.netWeightKg,
        gatePassId: null,
        gatePassNo: "",
        remarks: `Production output - ${saved.groupNo} (${group.sourceCompanyName})`,
      });
    } catch (e) {
      console.error("StockLedger (addOutput) error:", e);
    }

    return res.json({ success: true, data: saved });
  } catch (err) {
    console.error("addOutput error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error adding output." });
  }
};

/**
 * PATCH /api/production/groups/:id/outputs/:outputId
 * Body: { weightKg?, bagWeightEachKg?, emptyBagWeightKg?, productTypeId?, productTypeName? }
 */
exports.updateOutput = async (req, res) => {
  try {
    const { id, outputId } = req.params;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(outputId)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const group = await ProductionGroup.findById(id);
    if (!group)
      return res.status(404).json({ success: false, message: "Group not found" });
    if (group.batchDone) {
      return res.status(400).json({ success: false, message: "Group is finalized." });
    }

    const output = group.outputs.id(outputId);
    if (!output) {
      return res.status(404).json({ success: false, message: "Output not found" });
    }

    const oldNet = Number(output.netWeightKg) || 0;
    const oldProductTypeId = output.productTypeId;
    const oldProductTypeName = output.productTypeName;

    if (req.body.weightKg != null) output.weightKg = Number(req.body.weightKg) || 0;
    if (req.body.bagWeightEachKg != null)
      output.bagWeightEachKg = Number(req.body.bagWeightEachKg) || 0;
    if (req.body.emptyBagWeightKg != null)
      output.emptyBagWeightKg = Number(req.body.emptyBagWeightKg) || 0;
    if (req.body.productTypeId !== undefined) output.productTypeId = req.body.productTypeId;
    if (req.body.productTypeName !== undefined) output.productTypeName = req.body.productTypeName || "";
    if (req.body.outputDate) output.outputDate = new Date(req.body.outputDate);

    if (output.bagWeightEachKg <= 0) {
      return res.status(400).json({ success: false, message: "Weight of bag must be greater than 0." });
    }
    output.numBags = Math.floor(output.weightKg / output.bagWeightEachKg);
    output.netWeightKg = +Math.max(
      output.weightKg - output.numBags * output.emptyBagWeightKg,
      0
    ).toFixed(3);

    if (output.netWeightKg <= 0) {
      return res.status(400).json({ success: false, message: "Net weight must be greater than 0." });
    }

    const otherTotal = (group.outputs || [])
      .filter((o) => String(o._id) !== String(output._id))
      .reduce((s, o) => s + (Number(o.netWeightKg) || 0), 0);
    if (output.netWeightKg + otherTotal > (Number(group.totalPaddyWeightKg) || 0)) {
      const remaining = Math.max(0, (Number(group.totalPaddyWeightKg) || 0) - otherTotal);
      return res.status(400).json({
        success: false,
        message: `Maximum product weight remaining: ${Math.round(remaining)} kg.`,
      });
    }

    group.totalOutputWeightKg = +(
      (group.outputs || []).reduce((s, o) => s + (Number(o.netWeightKg) || 0), 0)
    ).toFixed(3);
    group.remainingPaddyKg = Math.max(
      0,
      +(Number(group.totalPaddyWeightKg || 0) - group.totalOutputWeightKg).toFixed(3)
    );
    const saved = await group.save();

    try {
      await StockLedger.create({
        date: new Date(),
        type: "OUT",
        companyId: group.sourceCompanyId || null,
        companyName: group.sourceCompanyName || "",
        productTypeId: oldProductTypeId,
        productTypeName: oldProductTypeName,
        numBags: 0,
        netWeightKg: oldNet,
        gatePassId: null,
        gatePassNo: "",
        remarks: `Production output edit reverse - ${saved.groupNo}`,
      });
      await StockLedger.create({
        date: output.outputDate || new Date(),
        type: "IN",
        companyId: group.sourceCompanyId || null,
        companyName: group.sourceCompanyName || "",
        productTypeId: output.productTypeId,
        productTypeName: output.productTypeName,
        numBags: output.numBags,
        netWeightKg: output.netWeightKg,
        gatePassId: null,
        gatePassNo: "",
        remarks: `Production output - ${saved.groupNo} (${group.sourceCompanyName})`,
      });
    } catch (e) {
      console.error("StockLedger (updateOutput) error:", e);
    }

    return res.json({ success: true, data: saved });
  } catch (err) {
    console.error("updateOutput error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error updating output." });
  }
};

/**
 * DELETE /api/production/groups/:id/outputs/:outputId
 */
exports.deleteOutput = async (req, res) => {
  try {
    const { id, outputId } = req.params;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(outputId)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const group = await ProductionGroup.findById(id);
    if (!group)
      return res.status(404).json({ success: false, message: "Group not found" });
    if (group.batchDone) {
      return res.status(400).json({ success: false, message: "Group is finalized." });
    }

    const output = group.outputs.id(outputId);
    if (!output) {
      return res.status(404).json({ success: false, message: "Output not found" });
    }

    const removed = { ...output.toObject() };
    group.outputs.pull(output._id);

    group.totalOutputWeightKg = +(
      (group.outputs || []).reduce((s, o) => s + (Number(o.netWeightKg) || 0), 0)
    ).toFixed(3);
    group.remainingPaddyKg = Math.max(
      0,
      +(Number(group.totalPaddyWeightKg || 0) - group.totalOutputWeightKg).toFixed(3)
    );
    const saved = await group.save();

    try {
      await StockLedger.create({
        date: new Date(),
        type: "OUT",
        companyId: group.sourceCompanyId || null,
        companyName: group.sourceCompanyName || "",
        productTypeId: removed.productTypeId,
        productTypeName: removed.productTypeName,
        numBags: removed.numBags,
        netWeightKg: removed.netWeightKg,
        gatePassId: null,
        gatePassNo: "",
        remarks: `Production output deleted - ${saved.groupNo}`,
      });
    } catch (e) {
      console.error("StockLedger (deleteOutput) error:", e);
    }

    return res.json({ success: true, data: saved });
  } catch (err) {
    console.error("deleteOutput error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error deleting output." });
  }
};

/**
 * POST /api/production/groups/:id/done
 * Finalizes the group: returns remaining paddy to stock and marks DONE.
 */
exports.markGroupDone = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid id" });

    const group = await ProductionGroup.findById(id);
    if (!group)
      return res.status(404).json({ success: false, message: "Group not found" });

    if (group.status !== "READY") {
      return res.status(400).json({
        success: false,
        message: "Complete all batches first before finalizing the group.",
      });
    }
    if (group.batchDone) {
      return res.status(400).json({ success: false, message: "Group already finalized." });
    }

    const remaining = Number(group.remainingPaddyKg || 0);
    if (remaining > 0) {
      try {
        // Return unused raw material to stock. Use the most recent batch's source product.
        const lastBatch = await ProductionBatch.findOne({
          groupId: group._id,
        })
          .sort({ createdAt: -1 })
          .lean();
        const retProductTypeId = lastBatch?.sourceProductTypeId ?? null;
        const retProductTypeName =
          String(lastBatch?.sourceProductTypeName || "").trim() ||
          "Unprocessed Paddy";
        await StockLedger.create({
          date: new Date(),
          type: "IN",
          companyId: group.sourceCompanyId || null,
          companyName: group.sourceCompanyName || "",
          productTypeId: retProductTypeId,
          productTypeName: ledgerProductName(retProductTypeId, retProductTypeName),
          numBags: 0,
          netWeightKg: remaining,
          gatePassId: null,
          gatePassNo: "",
          remarks: `Remaining raw material returned - ${group.groupNo} (${group.sourceCompanyName}) - ${retProductTypeName}`,
        });
      } catch (e) {
        console.error("StockLedger (markGroupDone) error:", e);
      }
    }

    group.batchDone = true;
    group.batchDoneAt = new Date();
    group.status = "DONE";
    const saved = await group.save();

    return res.json({ success: true, data: saved });
  } catch (err) {
    console.error("markGroupDone error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error finalizing group." });
  }
};

/**
 * GET /api/production/summary/today
 * Cards: total output today (product-wise) and batch count today.
 */
exports.getTodaySummary = async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [groups, batches] = await Promise.all([
      ProductionGroup.find({}).select("outputs").lean(),
      ProductionBatch.find({}).select("date").lean(),
    ]);

    let totalOutput = 0;
    const productWise = {};
    groups.forEach((g) => {
      (g.outputs || []).forEach((o) => {
        const outDate = new Date(o.outputDate);
        if (outDate < start || outDate > end) return;
        const net = Number(o.netWeightKg) || 0;
        totalOutput += net;
        const name = o.productTypeName || "Other";
        productWise[name] = (productWise[name] || 0) + net;
      });
    });

    const batchCount = batches.filter((b) => {
      const d = new Date(b.date);
      return d >= start && d <= end;
    }).length;

    const productWiseOutput = Object.entries(productWise).map(([productTypeName, totalKg]) => ({
      productTypeName,
      totalKg: +Number(totalKg).toFixed(3),
    }));

    return res.json({
      success: true,
      data: {
        totalOutputWeightKg: +totalOutput.toFixed(3),
        batchCount,
        productWiseOutput,
      },
    });
  } catch (err) {
    console.error("getTodaySummary error:", err);
    return res.status(500).json({
      success: false,
      message: "Error fetching production summary.",
    });
  }
};
