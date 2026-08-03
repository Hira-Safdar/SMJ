// backend/controllers/productionController.js
const mongoose = require("mongoose");
const ProductionBatch = require("../models/productionBatchModel");
const ProductionGroup = require("../models/productionGroupModel");
const StockLedger = require("../models/stockLedgerModel");
const SystemSettings = require("../models/systemSettingsModel");

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
 * Get current paddy balance (kg) from stock ledger (Paddy only).
 */
async function getPaddyBalanceKg(companyName = "") {
  const name = String(companyName || "").trim();
  if (!name) return 0;
  const rows = await StockLedger.find({
    productTypeId: null,
    productTypeName: { $in: ["Paddy", "Unprocessed Paddy"] },
    companyName: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
  }).lean();
  let balance = 0;
  rows.forEach((r) => {
    const qty = Number(r.netWeightKg) || 0;
    balance += r.type === "OUT" ? -qty : qty;
  });
  return balance;
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

/** Find (or create) the source-level group for a paddy company. */
async function ensureGroup(sourceCompanyId, sourceCompanyName) {
  const name = normBrand(sourceCompanyName);
  let group = await ProductionGroup.findOne({
    sourceCompanyName: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
  });
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
  } else if (group.sourceCompanyId && sourceCompanyId) {
    group.sourceCompanyId = sourceCompanyId;
    await group.save();
  }
  return group;
}

/**
 * POST /api/production/batches
 * Body: { date, paddyWeightKg, sourceCompanyName?, remarks? }
 * Creates a daily batch run and reserves paddy (OUT).
 */
exports.createBatch = async (req, res) => {
  try {
    const { date, paddyWeightKg, remarks, sourceCompanyId, sourceCompanyName } =
      req.body;
    if (!date)
      return res
        .status(400)
        .json({ success: false, message: "Field 'date' is required" });

    if (paddyWeightKg == null || isNaN(Number(paddyWeightKg))) {
      return res
        .status(400)
        .json({ success: false, message: "Field 'paddyWeightKg' is required" });
    }

    const requestedKg = Number(paddyWeightKg);
    if (requestedKg <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Paddy weight must be greater than 0" });
    }

    const sourceName = normBrand(sourceCompanyName);
    if (!sourceName) {
      return res.status(400).json({
        success: false,
        message: "Field 'sourceCompanyName' is required",
      });
    }

    const paddyBalance = await getPaddyBalanceKg(sourceName);
    if (paddyBalance < requestedKg) {
      return res.status(400).json({
        success: false,
        message: `Insufficient paddy stock for ${sourceName}. Available: ${paddyBalance.toFixed(
          3
        )} kg. Add paddy via Gate Pass Inward.`,
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
      paddyWeightKg: requestedKg,
      sourceCompanyId: sourceCompanyId || null,
      sourceCompanyName: sourceName,
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
        productTypeId: null,
        productTypeName: "Unprocessed Paddy",
        numBags: 0,
        netWeightKg: saved.paddyWeightKg,
        gatePassId: null,
        gatePassNo: "",
        remarks: `Paddy assigned to production batch ${saved.batchNo} (${sourceName})`,
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
 * Body: { date?, paddyWeightKg?, remarks? } — only for IN_PROCESS.
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

    const { date, paddyWeightKg, remarks } = req.body;

    if (date) batch.date = date;

    let delta = 0;
    if (paddyWeightKg != null && !isNaN(Number(paddyWeightKg))) {
      const newWeight = Number(paddyWeightKg);
      delta = newWeight - batch.paddyWeightKg;
      if (delta > 0) {
        const sourceName = String(batch.sourceCompanyName || "").trim();
        const available = await getPaddyBalanceKg(sourceName);
        if (available < delta) {
          return res.status(400).json({
            success: false,
            message: `Insufficient paddy stock for ${sourceName}. Available extra: ${available.toFixed(
              3
            )} kg.`,
          });
        }
      }
      batch.paddyWeightKg = newWeight;
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
          productTypeId: null,
          productTypeName: "Unprocessed Paddy",
          numBags: 0,
          netWeightKg: Math.abs(delta),
          gatePassId: null,
          gatePassNo: "",
          remarks: isIncrease
            ? `Paddy adjustment (extra) - ${saved.batchNo} (${sourceName})`
            : `Paddy adjustment (return) - ${saved.batchNo} (${sourceName})`,
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

    await batch.deleteOne();

    if (paddyWeight > 0) {
      try {
        await StockLedger.create({
          date: batch.date,
          type: "IN",
          companyId: batch.sourceCompanyId || null,
          companyName: sourceName,
          productTypeId: null,
          productTypeName: "Unprocessed Paddy",
          numBags: 0,
          netWeightKg: paddyWeight,
          gatePassId: null,
          gatePassNo: "",
          remarks: `Batch deleted, paddy returned - ${batch.batchNo} (${sourceName})`,
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
 * Body: { productTypeId, productTypeName, weightKg, numBags, emptyBagWeightKg, outputDate? }
 * Requires group READY (all batches completed). netWeight = weightKg - numBags*emptyBagWeightKg.
 */
exports.addOutput = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid id" });

    const { productTypeId, productTypeName, weightKg, numBags, emptyBagWeightKg, outputDate } = req.body;

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

    const bags = Number(numBags) || 0;
    const emptyBag = Number(emptyBagWeightKg) || 0;
    const gross = Number(weightKg) || 0;
    const netWeight = +(gross - bags * emptyBag).toFixed(3);

    if (netWeight < 0) {
      return res.status(400).json({
        success: false,
        message: "Net weight cannot be negative. Check weight and empty bag weight.",
      });
    }
    if (netWeight <= 0) {
      return res.status(400).json({
        success: false,
        message: "Net weight must be greater than 0.",
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
 * Body: { weightKg?, numBags?, emptyBagWeightKg?, productTypeId?, productTypeName? }
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
    if (req.body.numBags != null) output.numBags = Number(req.body.numBags) || 0;
    if (req.body.emptyBagWeightKg != null)
      output.emptyBagWeightKg = Number(req.body.emptyBagWeightKg) || 0;
    if (req.body.productTypeId !== undefined) output.productTypeId = req.body.productTypeId;
    if (req.body.productTypeName !== undefined) output.productTypeName = req.body.productTypeName || "";
    if (req.body.outputDate) output.outputDate = new Date(req.body.outputDate);

    const net = +(output.weightKg - output.numBags * output.emptyBagWeightKg).toFixed(3);
    if (net < 0) {
      return res.status(400).json({ success: false, message: "Net weight cannot be negative." });
    }
    output.netWeightKg = net;

    const otherTotal = (group.outputs || [])
      .filter((o) => String(o._id) !== String(output._id))
      .reduce((s, o) => s + (Number(o.netWeightKg) || 0), 0);
    if (net + otherTotal > (Number(group.totalPaddyWeightKg) || 0)) {
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
    output.remove();

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
        await StockLedger.create({
          date: new Date(),
          type: "IN",
          companyId: group.sourceCompanyId || null,
          companyName: group.sourceCompanyName || "",
          productTypeId: null,
          productTypeName: "Unprocessed Paddy",
          numBags: 0,
          netWeightKg: remaining,
          gatePassId: null,
          gatePassNo: "",
          remarks: `Remaining paddy returned - ${group.groupNo} (${group.sourceCompanyName})`,
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
