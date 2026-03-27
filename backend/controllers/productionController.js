// backend/controllers/productionController.js
const mongoose = require("mongoose");
const ProductionBatch = require("../models/productionBatchModel");
const StockLedger = require("../models/stockLedgerModel");
const SystemSettings = require("../models/systemSettingsModel");
const SystemAction = require("../models/systemActionModel");

// PB-YYYYMMDD-HHMMSS
function generateBatchNo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `PB-${YYYY}${MM}${DD}-${HH}${mm}${ss}`;
}

function recomputeAggregates(batch) {
  const totalRaw = Number(batch.paddyWeightKg) || 0;

  const allOutputs = batch.outputs || [];
  const totalOutput = allOutputs.reduce(
    (sum, o) => sum + (Number(o.netWeightKg) || 0),
    0
  );
  const dayOut = allOutputs
    .filter((o) => o.shift === "DAY")
    .reduce((sum, o) => sum + (Number(o.netWeightKg) || 0), 0);
  const nightOut = allOutputs
    .filter((o) => o.shift === "NIGHT")
    .reduce((sum, o) => sum + (Number(o.netWeightKg) || 0), 0);

  batch.totalRawWeightKg = +totalRaw.toFixed(3);
  batch.totalOutputWeightKg = +totalOutput.toFixed(3);
  batch.dayShiftOutputWeightKg = +dayOut.toFixed(3);
  batch.nightShiftOutputWeightKg = +nightOut.toFixed(3);
}

function ensureBatchSourceCompany(batch) {
  if (!batch) return;
  const existing = String(batch.sourceCompanyName || "").trim();
  if (existing) return;
  const fromOutput = String(batch.outputs?.[0]?.companyName || "").trim();
  batch.sourceCompanyName = fromOutput || "SMJ Own";
}

/**
 * Get current paddy balance (kg) from stock ledger (Paddy only).
 */
function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getPaddyBalanceKg(companyName = "") {
  const name = String(companyName || "").trim();
  if (!name) return 0;
  const rows = await StockLedger.find({
    productTypeId: null,
    productTypeName: { $in: ["Paddy", "Unprocessed Paddy"] },
    // Case-insensitive match to avoid split stock like "Anwar Trades" vs "anwar trades"
    companyName: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
  }).lean();
  let balance = 0;
  rows.forEach((r) => {
    const qty = Number(r.netWeightKg) || 0;
    balance += r.type === "OUT" ? -qty : qty;
  });
  return balance;
}

/**
 * POST /api/production/batches
 * Body: { date, paddyWeightKg, remarks? }
 * Creates batch and reserves paddy (OUT). Requires sufficient paddy in stock.
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

    const sourceName = String(sourceCompanyName || "").trim();
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
        message: `Insufficient paddy stock for ${sourceName}. Available: ${paddyBalance.toFixed(3)} kg. Add paddy via Gate Pass Inward.`,
      });
    }

    let batchNo = generateBatchNo();
    let attempts = 0;
    while (attempts < 5) {
      const exists = await ProductionBatch.findOne({ batchNo });
      if (!exists) break;
      batchNo = generateBatchNo();
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

    const batch = new ProductionBatch({
      batchNo,
      date,
      status: "IN_PROCESS",
      paddyWeightKg: requestedKg,
      sourceCompanyId: sourceCompanyId || null,
      sourceCompanyName: sourceName,
      ownerType,
      outputs: [],
      remarks: remarks || "",
    });

    recomputeAggregates(batch);
    const saved = await batch.save();

    // Reserve paddy as OUT from raw stock
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
 * Body: { date?, paddyWeightKg?, remarks? }
 * Only when IN_PROCESS.
 * Adjusts paddy stock by delta.
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

    ensureBatchSourceCompany(batch);

    const { date, paddyWeightKg, remarks, adminPin } = req.body;

    if (batch.status === "COMPLETED") {
      const settings = await SystemSettings.findOne({}).select("adminPin").lean();
      const expectedPin = (settings && settings.adminPin) || "0000";
      if (!adminPin || String(adminPin).trim() !== String(expectedPin).trim()) {
        return res.status(400).json({
          success: false,
          message: "Invalid or missing admin PIN. Completed batch requires admin PIN to edit.",
        });
      }
    }

    if (date) batch.date = date;

    let delta = 0;
    if (paddyWeightKg != null && !isNaN(Number(paddyWeightKg))) {
      const newWeight = Number(paddyWeightKg);
      delta = newWeight - batch.paddyWeightKg;
      if (delta > 0 && batch.status === "IN_PROCESS") {
        const sourceName = String(batch.sourceCompanyName || "").trim();
        const available = await getPaddyBalanceKg(sourceName);
        if (available < delta) {
          return res.status(400).json({
            success: false,
            message: `Insufficient paddy stock for ${sourceName}. Available extra: ${available.toFixed(3)} kg.`,
          });
        }
      }
      batch.paddyWeightKg = newWeight;
    }

    if (remarks !== undefined) {
      batch.remarks = remarks || "";
    }

    recomputeAggregates(batch);
    const saved = await batch.save();

    // Adjust raw paddy stock for delta (only for IN_PROCESS; completed batch edit does not change stock)
    if (delta !== 0 && batch.status === "IN_PROCESS") {
      try {
        const sourceName = String(batch.sourceCompanyName || "").trim();
        const isIncrease = delta > 0; // more paddy consumed
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
 * - If IN_PROCESS: delete + return paddy to stock (IN).
 * - If COMPLETED: delete + return paddy to stock (IN) + remove finished stock (OUT).
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

    ensureBatchSourceCompany(batch);

    const wasCompleted = batch.status === "COMPLETED";

    // Keep data for stock reverse before deleting
    const paddyWeight = batch.paddyWeightKg || 0;
    const outputs = batch.outputs || [];

    await batch.deleteOne();

    // Reverse stock
    try {
      const ledgerOps = [];

      // 1) Return paddy to stock (IN)
      if (paddyWeight > 0) {
        const sourceName = String(batch.sourceCompanyName || "").trim();
        ledgerOps.push({
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
      }

      // 2) Remove finished stock (OUT for each output)
      if (outputs.length > 0) {
        outputs.forEach((o) => {
          if (!o.productTypeId || !o.netWeightKg) return;
          // Accounting is manual-only; no automatic journal reversals.
          ledgerOps.push({
            date: o.outputDate || batch.date,
            type: "OUT",
            companyId: o.companyId || null,
            companyName: o.companyName || "",
            productTypeId: o.productTypeId,
            productTypeName: o.productTypeName,
            numBags: o.numBags || 0,
            netWeightKg: o.netWeightKg || 0,
            gatePassId: null,
            gatePassNo: "",
            remarks: `Batch deleted, finished stock reversed - ${batch.batchNo}`,
          });
        });
      }

      if (ledgerOps.length > 0) {
        await StockLedger.insertMany(ledgerOps);
      }
    } catch {
      // don’t crash if ledger fails; batch is already removed
    }

    return res.json({
      success: true,
      message: wasCompleted
        ? "Completed batch deleted and stock reversed."
        : "Batch deleted and paddy returned to stock.",
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Error deleting batch." });
  }
};

/**
 * GET /api/production/batches
 * Query: status?, page?, limit?
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
 * POST /api/production/batches/:id/outputs
 * Body: { productTypeId, productTypeName, companyId?, companyName?, numBags, perBagWeightKg, shift, adminPin? }
 * For COMPLETED batch, adminPin is required; adds output and creates IN stock entry immediately.
 */
exports.addOutput = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      productTypeId,
      productTypeName,
      companyId,
      companyName,
      numBags,
      perBagWeightKg,
      outputDate,
      adminPin,
    } = req.body;

    if (
      !productTypeId ||
      !productTypeName ||
      numBags == null ||
      perBagWeightKg == null
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Fields productTypeId, productTypeName, numBags, perBagWeightKg are required.",
      });
    }

    const batch = await ProductionBatch.findById(id);
    ensureBatchSourceCompany(batch);

    if (!batch)
      return res
        .status(404)
        .json({ success: false, message: "Batch not found" });

    if (batch.status === "COMPLETED") {
      const settings = await SystemSettings.findOne({}).select("adminPin").lean();
      const expectedPin = (settings && settings.adminPin) || "0000";
      if (!adminPin || String(adminPin).trim() !== String(expectedPin).trim()) {
        return res.status(403).json({
          success: false,
          message: "Valid admin PIN required to add output to completed batch.",
        });
      }
    } else if (batch.status !== "IN_PROCESS") {
      return res.status(400).json({
        success: false,
        message: "Cannot add output to this batch.",
      });
    }

    const sourceName = String(batch.sourceCompanyName || "").trim();
    if (!sourceName) {
      return res.status(400).json({
        success: false,
        message: "Batch source company is missing.",
      });
    }

    const bags = Number(numBags);
    const perBag = Number(perBagWeightKg);
    const netWeight = +(bags * perBag).toFixed(3);

    const now = new Date();
    const outDate = outputDate ? new Date(outputDate) : now;
    const hour = outDate.getHours();
    const shift = hour >= 6 && hour < 18 ? "DAY" : "NIGHT";

    const output = {
      productTypeId,
      productTypeName,
      companyId: batch.sourceCompanyId || null,
      companyName: sourceName,
      numBags: bags,
      netWeightKg: netWeight,
      shift,
      outputDate: outDate,
    };

    batch.outputs.push(output);
    recomputeAggregates(batch);
    const saved = await batch.save();

    // Post stock immediately for SMJ-owned batches.
    if (batch.ownerType !== "CUSTOM") {
      try {
        await StockLedger.create({
          date: output.outputDate || new Date(),
          type: "IN",
          companyId: output.companyId || null,
          companyName: output.companyName || "",
          productTypeId: output.productTypeId,
          productTypeName: output.productTypeName,
          numBags: output.numBags,
          netWeightKg: output.netWeightKg,
          gatePassId: null,
          gatePassNo: "",
          remarks: `Production output (${output.shift}) - ${saved.batchNo}`,
        });
      } catch {
        // don't crash if ledger fails
      }
      // Accounting is manual-only; no automatic journal posting.
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
 * PATCH /api/production/batches/:id/outputs/:outputId
 * Body: { numBags?, perBagWeightKg?, shift?, companyId?, companyName?, productTypeId?, productTypeName? }
 * Edit output and adjust stock (OUT old, IN new). No admin PIN required.
 */
exports.updateOutput = async (req, res) => {
  try {
    const { id, outputId } = req.params;
    const {
      numBags,
      perBagWeightKg,
      outputDate,
      productTypeId,
      productTypeName,
    } = req.body;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(outputId)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const batch = await ProductionBatch.findById(id);
    ensureBatchSourceCompany(batch);

    if (!batch)
      return res.status(404).json({ success: false, message: "Batch not found" });

    const output = batch.outputs.id(outputId);
    if (!output) {
      return res.status(404).json({ success: false, message: "Output not found" });
    }

    const oldNet = Number(output.netWeightKg) || 0;
    const oldProductTypeId = output.productTypeId;
    const oldProductTypeName = output.productTypeName;
    const oldCompanyId = output.companyId;
    const oldCompanyName = output.companyName;
    const oldNumBags = output.numBags;
    const oldShift = output.shift;
    const oldOutputDate = output.outputDate || batch.date;

    if (numBags != null) output.numBags = Number(numBags);
    if (perBagWeightKg != null) {
      const bags = output.numBags || 0;
      output.netWeightKg = +(bags * Number(perBagWeightKg)).toFixed(3);
    } else if (numBags != null && output.numBags) {
      const perBag = oldNet / output.numBags;
      output.netWeightKg = +(Number(numBags) * perBag).toFixed(3);
    }
    if (outputDate) output.outputDate = new Date(outputDate);
    output.companyId = batch.sourceCompanyId || null;
    output.companyName = String(batch.sourceCompanyName || "").trim();

    if (productTypeId !== undefined) output.productTypeId = productTypeId;
    if (productTypeName !== undefined) output.productTypeName = productTypeName || "";

    const newNet = Number(output.netWeightKg) || 0;
    recomputeAggregates(batch);
    const saved = await batch.save();

    if (
      batch.ownerType !== "CUSTOM" &&
      (oldNet !== newNet ||
        oldProductTypeId?.toString() !== output.productTypeId?.toString() ||
        new Date(oldOutputDate).getTime() !==
          new Date(output.outputDate || batch.date).getTime())
    ) {
      try {
        // Accounting is manual-only; no automatic journal reversals.
        await StockLedger.create({
          date: oldOutputDate || batch.date,
          type: "OUT",
          companyId: oldCompanyId || null,
          companyName: oldCompanyName || "",
          productTypeId: oldProductTypeId,
          productTypeName: oldProductTypeName,
          numBags: oldNumBags,
          netWeightKg: oldNet,
          gatePassId: null,
          gatePassNo: "",
          remarks: `Production output edit reverse - ${batch.batchNo}`,
        });
        await StockLedger.create({
          date: output.outputDate || batch.date,
          type: "IN",
          companyId: output.companyId || null,
          companyName: output.companyName || "",
          productTypeId: output.productTypeId,
          productTypeName: output.productTypeName,
          numBags: output.numBags,
          netWeightKg: newNet,
          gatePassId: null,
          gatePassNo: "",
          remarks: `Production output (${output.shift || "DAY"}) - ${batch.batchNo}`,
        });
        // Accounting is manual-only; no automatic journal posting.
      } catch {
        // don't crash if ledger fails
      }
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
 * POST /api/production/batches/:id/remaining-paddy/decision
 * Body: { decision: "RETURN_TO_STOCK" | "KEEP_IN_BATCH" }
 * Resolves the pending remaining paddy action created on auto-complete.
 */
exports.resolveRemainingPaddyDecision = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    const decision = String(req.body?.decision || "").trim();
    if (!["RETURN_TO_STOCK", "KEEP_IN_BATCH"].includes(decision)) {
      return res.status(400).json({ success: false, message: "Invalid decision." });
    }

    const batch = await ProductionBatch.findById(id).lean();
    if (!batch) {
      return res.status(404).json({ success: false, message: "Batch not found" });
    }

    let action = await SystemAction.findOne({
      type: "PADDY_REMAINING_DECISION",
      status: "PENDING",
      batchId: id,
    });
    let remainingKg = 0;
    let brandName = String(batch.sourceCompanyName || "").trim() || "SMJ Own";
    if (!action) {
      // Fallback: compute remaining from batch if no pending action exists.
      const raw = Number(batch.paddyWeightKg || 0) || 0;
      const outKg = (batch.outputs || [])
        .reduce((sum, o) => sum + (Number(o.netWeightKg) || 0), 0);
      remainingKg = Math.max(0, +(raw - outKg).toFixed(3));
      if (remainingKg <= 0) {
        await ProductionBatch.updateOne(
          { _id: id },
          { $set: { batchDone: true, batchDoneAt: new Date() } }
        );
        return res
          .status(200)
          .json({ success: true, data: { remainingKg: 0 }, message: "No remaining paddy." });
      }
      action = await SystemAction.create({
        type: "PADDY_REMAINING_DECISION",
        status: "PENDING",
        batchId: id,
        batchNo: batch.batchNo,
        brandName,
        remainingPaddyKg: remainingKg,
      });
    } else {
      remainingKg = Number(action.remainingPaddyKg || 0) || 0;
      brandName = String(action.brandName || batch.sourceCompanyName || "").trim() || "SMJ Own";
    }

    if (decision === "RETURN_TO_STOCK" && remainingKg > 0) {
      await StockLedger.create({
        date: new Date(),
        type: "IN",
        companyId: batch.sourceCompanyId || null,
        companyName: brandName,
        productTypeId: null,
        productTypeName: "Unprocessed Paddy",
        numBags: 0,
        netWeightKg: remainingKg,
        gatePassId: null,
        gatePassNo: "",
        remarks: `Remaining paddy returned - ${batch.batchNo} (${brandName})`,
      });
    }

    action.status = "RESOLVED";
    action.decision = decision;
    action.resolvedAt = new Date();
    await action.save();
    await ProductionBatch.updateOne(
      { _id: id },
      { $set: { batchDone: true, batchDoneAt: new Date() } }
    );

    return res.json({ success: true, data: action });
  } catch (err) {
    console.error("resolveRemainingPaddyDecision error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to resolve decision." });
  }
};

/**
 * POST /api/production/batches/:id/complete
 * Marks batch COMPLETED and creates IN stock entries for outputs.
 */
exports.completeBatch = async (req, res) => {
  try {
    const { id } = req.params;

    const batch = await ProductionBatch.findById(id);
    ensureBatchSourceCompany(batch);

    if (!batch)
      return res
        .status(404)
        .json({ success: false, message: "Batch not found" });

    if (batch.status === "COMPLETED") {
      return res
        .status(400)
        .json({ success: false, message: "Batch already completed." });
    }

    if (!batch.outputs || batch.outputs.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Add at least one output before completing batch.",
      });
    }

    recomputeAggregates(batch);
    batch.status = "COMPLETED";
    const saved = await batch.save();

    // Create pending decision for remaining paddy (if any).
    try {
      const raw = Number(saved.paddyWeightKg || 0) || 0;
      const outKg = Number(saved.totalOutputWeightKg || 0) || 0;
      const remaining = Math.max(0, +(raw - outKg).toFixed(3));
      if (remaining > 0) {
        const exists = await SystemAction.findOne({
          type: "PADDY_REMAINING_DECISION",
          status: "PENDING",
          batchId: saved._id,
        }).lean();
        if (!exists) {
          await SystemAction.create({
            type: "PADDY_REMAINING_DECISION",
            status: "PENDING",
            batchId: saved._id,
            batchNo: saved.batchNo,
            brandName: String(saved.sourceCompanyName || "").trim(),
            remainingPaddyKg: remaining,
          });
        }
      }
    } catch (e) {
      console.error("completeBatch remaining paddy action error:", e?.message || e);
    }

    // Backward compatibility: if no output ledger exists for this batch, create once.
    try {
      const existing = await StockLedger.findOne({
        type: "IN",
        remarks: { $regex: `${saved.batchNo}$` },
      }).lean();
      if (!existing) {
        const ops = (batch.outputs || []).map((o) => ({
          date: o.outputDate || saved.date,
          type: "IN",
          companyId: o.companyId || null,
          companyName: o.companyName || "",
          productTypeId: o.productTypeId,
          productTypeName: o.productTypeName,
          numBags: o.numBags,
          netWeightKg: o.netWeightKg,
          gatePassId: null,
          gatePassNo: "",
          remarks: `Production output (${o.shift}) - ${saved.batchNo}`,
        }));
        if (ops.length > 0) {
          await StockLedger.insertMany(ops);
        }
      }
    } catch {}

    return res.json({ success: true, data: saved });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Error completing batch." });
  }
};

/**
 * POST /api/production/batches/:id/reopen
 * Moves a completed batch back to IN_PROCESS (admin action).
 */
exports.reopenBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await ProductionBatch.findById(id);
    ensureBatchSourceCompany(batch);

    if (!batch)
      return res.status(404).json({ success: false, message: "Batch not found" });

    if (batch.status !== "COMPLETED") {
      return res.status(400).json({ success: false, message: "Only completed batches can be reopened." });
    }

    batch.status = "IN_PROCESS";
    batch.batchDone = false;
    batch.batchDoneAt = null;
    const saved = await batch.save();

    try {
      await SystemAction.updateMany(
        { type: "PADDY_REMAINING_DECISION", status: "PENDING", batchId: saved._id },
        { $set: { status: "CANCELLED", decision: "REOPENED", resolvedAt: new Date() } }
      );
    } catch {}

    return res.json({ success: true, data: saved });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Error reopening batch." });
  }
};

/**
 * GET /api/production/summary/today
 * For cards: day/night/total outputs, batch count.
 */
exports.getTodaySummary = async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0
    );
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );

    const batches = await ProductionBatch.find({}).lean();

    let day = 0;
    let night = 0;
    let totalOutput = 0;
    const productWise = {};

    batches.forEach((b) => {
      (b.outputs || []).forEach((o) => {
        const outDate = new Date(o.outputDate || b.date);
        if (outDate < start || outDate > end) return;
        const net = Number(o.netWeightKg) || 0;
        if (o.shift === "DAY") day += net;
        if (o.shift === "NIGHT") night += net;
        totalOutput += net;
        const name = o.productTypeName || "Other";
        productWise[name] = (productWise[name] || 0) + net;
      });
    });

    const productWiseOutput = Object.entries(productWise).map(([productTypeName, totalKg]) => ({
      productTypeName,
      totalKg: +Number(totalKg).toFixed(3),
    }));

    return res.json({
      success: true,
      data: {
        dayShiftOutputWeightKg: +day.toFixed(3),
        nightShiftOutputWeightKg: +night.toFixed(3),
        totalOutputWeightKg: +totalOutput.toFixed(3),
        batchCount: batches.filter((b) =>
          (b.outputs || []).some((o) => {
            const outDate = new Date(o.outputDate || b.date);
            return outDate >= start && outDate <= end;
          })
        ).length,
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
