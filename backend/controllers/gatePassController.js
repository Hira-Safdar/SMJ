// backend/controllers/gatePassController.js
const GatePass = require("../models/gatePassModel");
const StockLedger = require("../models/stockLedgerModel");
const SystemSettings = require("../models/systemSettingsModel");
const ProductType = require("../models/productTypeModel");

const toKg = (quantity, unit, bagWeightKg = 65) => {
  const qty = Number(quantity || 0);
  const u = String(unit || "kg").toLowerCase();
  if (!qty) return 0;
  if (u === "kg") return Math.floor(qty);
  if (u === "ton") return Math.floor(qty * 1000);
  if (u === "mounds") return Math.floor(qty * 40);
  if (u === "bags") return Math.floor(qty * bagWeightKg);
  return Math.floor(qty);
};

const getItemName = (item) => {
  if (!item) return "";
  if (item.itemType === "Other" && item.customItemName) {
    return item.customItemName;
  }
  return item.itemType || "";
};

const normalizeRawPaddyName = (name) => {
  const n = String(name || "").trim().toLowerCase();
  if (n === "paddy" || n === "unprocessed paddy") return "Unprocessed Paddy";
  return name;
};

const normalizeBrandName = (name) => String(name || "").trim();

const toTitleCase = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

const applyGatePassTotals = (body) => {
  if (!Array.isArray(body?.items)) return body;
  body.totalQuantity = body.items.reduce(
    (sum, item) => sum + (Number(item?.quantity || item?.netWeightKg || 0) || 0),
    0
  );
  body.totalAmount = body.items.reduce(
    (sum, item) => sum + (Number(item?.amount || 0) || 0),
    0
  );
  return body;
};

/** Ensure all supplier/brand names from a gate pass are persisted in SystemSettings.brandOptions */
const persistBrandOptions = async (body) => {
  try {
    const names = new Set();
    const supplier = normalizeBrandName(body?.supplier);
    if (supplier) names.add(toTitleCase(supplier));
    (body?.items || []).forEach((it) => {
      const brand = normalizeBrandName(it?.brand);
      if (brand) names.add(toTitleCase(brand));
    });
    const senderName = String(body?.senderName || body?.supplier || "").trim();
    if (!names.size && !senderName) return;
    const settings = await SystemSettings.findOne({});
    if (!settings) return;
    let changed = false;
    if (senderName) {
      const senderList = Array.isArray(settings.senderOptions) ? settings.senderOptions : [];
      const senderMap = new Map(
        senderList.map((s) => [String(s).trim().toLowerCase(), s])
      );
      if (!senderMap.has(senderName.toLowerCase())) {
        senderMap.set(senderName.toLowerCase(), toTitleCase(senderName));
        settings.senderOptions = Array.from(senderMap.values()).sort();
        changed = true;
      }
    }
    const existing = new Map(
      (settings.brandOptions || []).map((b) => [String(b).trim().toLowerCase(), b])
    );
    names.forEach((name) => {
      const key = name.toLowerCase();
      if (!existing.has(key)) {
        existing.set(key, name);
        changed = true;
      }
    });
    if (changed) {
      settings.brandOptions = Array.from(existing.values()).sort();
      await settings.save();
    }
  } catch (_e) { /* best-effort; don't block gate pass */ }
};

/** Build production ledger ops from items array (e.g. req.body.items or gp.items). Use gp for type, id, gatePassNo, createdAt. */
const buildProductionOpsFromItems = (items, gp, bagWeightKg = 65, productTypeMap = null) => {
  const ops = [];
  if (!items || !Array.isArray(items) || !["IN", "OUT"].includes(gp.type)) return ops;
  const date = gp.date || gp.createdAt || new Date();
  const gatePassId = gp._id;
  const gatePassNo = gp.gatePassNo || "";

  items.forEach((item) => {
    const stockType = (item && item.stockType) || "Production";
    if (stockType !== "Production") return;
    const qty = Number(item && item.quantity);
    if (!qty || qty <= 0) return;
    const kg = toKg(qty, (item && item.unit) || "kg", bagWeightKg);
    if (!kg) return;
    const name = normalizeRawPaddyName(getItemName(item) || "Paddy");
    const paddyCompanyName =
      normalizeBrandName(item?.brand) ||
      normalizeBrandName(gp.supplier) ||
      "SMJ Own";
    let productTypeId = null;
    if (productTypeMap && name && normalizeRawPaddyName(name) !== "Unprocessed Paddy") {
      const key = `${String(paddyCompanyName || "").toLowerCase()}::${String(name).toLowerCase()}`;
      const fallbackKey = `::${String(name).toLowerCase()}`;
      productTypeId =
        productTypeMap.get(key) ||
        productTypeMap.get(fallbackKey) ||
        null;
    }
    ops.push({
      date,
      type: gp.type === "OUT" ? "OUT" : "IN",
      companyId: null,
      companyName: paddyCompanyName,
      productTypeId,
      productTypeName: name,
      numBags: 0,
      netWeightKg: kg,
      gatePassId,
      gatePassNo,
      remarks: `Gate pass ${gp.type} (Production) - ${paddyCompanyName}`,
    });

    // Raw paddy (productTypeId null) dispatched OUT to another company transfers
    // ownership: the receiving company's raw stock increases.
    if (
      gp.type === "OUT" &&
      !productTypeId &&
      paddyCompanyName &&
      normalizeBrandName(gp.customer)
    ) {
      ops.push({
        date,
        type: "IN",
        companyId: null,
        companyName: normalizeBrandName(gp.customer),
        productTypeId: null,
        productTypeName: name,
        numBags: 0,
        netWeightKg: kg,
        gatePassId,
        gatePassNo,
        remarks: `Paddy transferred via Gate pass OUT from ${paddyCompanyName}`,
      });
    }
  });
  return ops;
};

const buildProductionOps = (gp, bagWeightKg = 65) => {
  return buildProductionOpsFromItems(gp.items || [], gp, bagWeightKg);
};

const buildSearchQuery = (search, type) => {
  const q = {};
  if (type) q.type = type;
  if (search) {
    q.$or = [
      { truckNo: { $regex: search, $options: "i" } },
      { supplier: { $regex: search, $options: "i" } },
      { customer: { $regex: search, $options: "i" } },
      { gatePassNo: { $regex: search, $options: "i" } },
      { driverName: { $regex: search, $options: "i" } },
    ];
  }
  return q;
};

exports.createGatePass = async (req, res) => {
  try {
    const body = req.body || {};

    if (body.type === "IN") {
      const hasProductionItem = Array.isArray(body.items)
        ? body.items.some((it) => String(it?.stockType || "Production") !== "Managerial")
        : false;
      if (hasProductionItem) {
        const supplierOk = normalizeBrandName(body.supplier) !== "";
        const allItemsHaveBrand = Array.isArray(body.items)
          ? body.items
              .filter((it) => String(it?.stockType || "Production") !== "Managerial")
              .every((it) => normalizeBrandName(it?.brand) !== "")
          : false;
        if (!supplierOk && !allItemsHaveBrand) {
        return res.status(400).json({
          success: false,
          message:
            "Company Name is required for Production/Paddy stock. Select a company name for each paddy line or set a single company name at top.",
        });
      }
      }
    }

    // Validate items array
    if (!body.items || body.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one item is required.",
      });
    }

    applyGatePassTotals(body);
    const gp = await GatePass.create(body);
    await persistBrandOptions(body);
    try {
      const settings = await SystemSettings.findOne({}).select("defaultBagWeightKg").lean();
      const bagWeightKg = settings && settings.defaultBagWeightKg != null ? settings.defaultBagWeightKg : 65;
      const productDocs = await ProductType.find({})
        .select("_id name brand")
        .lean();
      const productTypeMap = new Map();
      productDocs.forEach((p) => {
        if (!p?.name) return;
        const nameKey = String(p.name).toLowerCase();
        const brandKey = String(p.brand || "").toLowerCase();
        productTypeMap.set(`${brandKey}::${nameKey}`, p._id);
        productTypeMap.set(`::${nameKey}`, p._id);
      });
      // Use body.items (what was sent) so we don't rely on saved doc shape; gp provides _id, gatePassNo, createdAt
      const productionOps = buildProductionOpsFromItems(body.items || [], gp, bagWeightKg, productTypeMap);
      if (productionOps.length > 0) {
        await StockLedger.insertMany(productionOps);
      }
    } catch (e) {
      console.error("Gate pass stock update error:", e);
      // Still return 201; gate pass was created. Caller may retry or fix stock manually.
    }
    return res.status(201).json({ success: true, data: gp });
  } catch (err) {
    let message = err.message || "Failed to create gate pass.";
    if (err.name === "ValidationError") {
      const firstKey = Object.keys(err.errors)[0];
      message = err.errors[firstKey].message;
    }
    return res.status(400).json({ success: false, message });
  }
};

exports.getGatePasses = async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "10", 10);
    const search = req.query.search || "";
    const type = req.query.type || "";
    const status = req.query.status || "";

    const query = buildSearchQuery(search, type || undefined);
    if (status) query.status = status;

    const total = await GatePass.countDocuments(query);
    const data = await GatePass.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ success: true, data, total });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch gate passes." });
  }
};

exports.getGatePass = async (req, res) => {
  try {
    const gp = await GatePass.findById(req.params.id);
    if (!gp)
      return res
        .status(404)
        .json({ success: false, message: "Gate pass not found." });
    res.json({ success: true, data: gp });
  } catch (err) {
    res
      .status(404)
      .json({ success: false, message: "Gate pass not found or invalid id." });
  }
};

exports.updateGatePass = async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.gatePassNo;
    applyGatePassTotals(body);

    if (body.type === "IN") {
      const hasProductionItem = Array.isArray(body.items)
        ? body.items.some((it) => String(it?.stockType || "Production") !== "Managerial")
        : false;
      if (hasProductionItem) {
        const supplierOk = normalizeBrandName(body.supplier) !== "";
        const allItemsHaveBrand = Array.isArray(body.items)
          ? body.items
              .filter((it) => String(it?.stockType || "Production") !== "Managerial")
              .every((it) => normalizeBrandName(it?.brand) !== "")
          : false;
        if (!supplierOk && !allItemsHaveBrand) {
        return res.status(400).json({
          success: false,
          message:
            "Company Name is required for Production/Paddy stock. Select a company name for each paddy line or set a single company name at top.",
        });
      }
      }
    }

    const gp = await GatePass.findByIdAndUpdate(req.params.id, body, {
      new: true,
      runValidators: true,
    });

    if (gp) {
      await persistBrandOptions(body);
      if (Array.isArray(body.items) || body.type) {
        try {
          await StockLedger.deleteMany({ gatePassId: gp._id });
          const settings = await SystemSettings.findOne({}).select("defaultBagWeightKg").lean();
          const bagWeightKg = settings && settings.defaultBagWeightKg != null ? settings.defaultBagWeightKg : 65;
          const productDocs = await ProductType.find({})
            .select("_id name brand")
            .lean();
          const productTypeMap = new Map();
          productDocs.forEach((p) => {
            if (!p?.name) return;
            const nameKey = String(p.name).toLowerCase();
            const brandKey = String(p.brand || "").toLowerCase();
            productTypeMap.set(`${brandKey}::${nameKey}`, p._id);
            productTypeMap.set(`::${nameKey}`, p._id);
          });
          const productionOps = buildProductionOpsFromItems(body.items || gp.items || [], gp, bagWeightKg, productTypeMap);
          if (productionOps.length > 0) {
            await StockLedger.insertMany(productionOps);
          }
        } catch (e) {
          console.error("Gate pass stock update error:", e);
        }
      }
    }

    if (!gp)
      return res
        .status(404)
        .json({ success: false, message: "Gate pass not found." });
    res.json({ success: true, data: gp });
  } catch (err) {
    let message = err.message || "Failed to update.";
    if (err.name === "ValidationError") {
      const firstKey = Object.keys(err.errors)[0];
      message = err.errors[firstKey].message;
    }
    res.status(400).json({ success: false, message });
  }
};

exports.deleteGatePass = async (req, res) => {
  try {
    const gp = await GatePass.findByIdAndDelete(req.params.id);
    if (!gp)
      return res
        .status(404)
        .json({ success: false, message: "Gate pass not found." });
    await StockLedger.deleteMany({ gatePassId: gp._id });
    res.json({ success: true });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Unable to delete gate pass." });
  }
};
