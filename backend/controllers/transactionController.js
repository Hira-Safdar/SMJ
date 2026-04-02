// backend/controllers/transactionController.js
const mongoose = require("mongoose");
const Transaction = require("../models/transactionModel");
const GatePass = require("../models/gatePassModel");
const Company = require("../models/companyModel");
const Customer = require("../models/customerModel");
const ProductType = require("../models/productTypeModel");
const SystemSettings = require("../models/systemSettingsModel");
const StockLedger = require("../models/stockLedgerModel");

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveSaleParty(payload) {
  const Model = Customer;
  const partyType = "CUSTOMER";

  // Frontend historically used "companyId"; for SALE we treat it as partyRefId.
  const id = payload.companyId;
  if (id && mongoose.isValidObjectId(id)) {
    const doc = await Model.findById(id).lean();
    if (doc) {
      return {
        partyType,
        partyRefId: doc._id,
        partyName: doc.name,
      };
    }
  }

  const name = String(payload.companyName || "").trim();
  if (!name) {
    return null;
  }

  // Upsert by name (case-insensitive) so next time it appears in dropdown.
  const existing = await Model.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
  }).lean();
  if (existing) {
    return {
      partyType,
      partyRefId: existing._id,
      partyName: existing.name,
    };
  }

  const created = await Model.create({ name });
  return {
    partyType,
    partyRefId: created._id,
    partyName: created.name,
  };
}

/**
 * Generate a UNIQUE invoice number.
 *
 * Uses SystemSettings invoicePrefix (default "INV-")
 * and compact type/date token:
 *   - SALE:    INV-S-YYMMDD-AB12CD
 *   - PURCHASE:INV-P-YYMMDD-EF34GH
 *
 * We also check DB a few times to avoid collisions.
 */
function buildInvoiceString(prefix, typeToken) {
  const compact = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 4);
  // Keep invoice short with a single hyphen while still unique enough.
  return `${typeToken}-${compact}${rand}`;
}

async function generateInvoiceNo(txnType) {
  // load settings (or defaults)
  let settings = await SystemSettings.findOne({});
  if (!settings) {
    settings = await SystemSettings.create({});
  }

  const basePrefix = settings.invoicePrefix || "INV-";

  // You can later extend with separate prefixes:
  // settings.saleInvoicePrefix, settings.purchaseInvoicePrefix, etc.
  let typeToken = "X";
  if (txnType === "SALE") {
    typeToken = "S";
  } else if (txnType === "PURCHASE") {
    typeToken = "P";
  }

  // Try a few times to avoid duplicates
  let attempts = 0;
  while (attempts < 5) {
    const candidate = buildInvoiceString(basePrefix, typeToken);
    // eslint-disable-next-line no-await-in-loop
    const exists = await Transaction.exists({ invoiceNo: candidate });
    if (!exists) return candidate;
    attempts++;
  }

  // If still colliding, throw error
  throw new Error(
    "Could not generate unique invoice number after several attempts."
  );
}

/**
 * Compute amounts for items.
 *  - If netWeightKg is provided, we use it;
 *  - otherwise netWeightKg = numBags * perBagWeightKg
 */
function computeItemAmounts(itemsRaw) {
  const items = [];
  let totalAmount = 0;

  for (const raw of itemsRaw) {
    const isPaddy = raw.isPaddy === true;

    const numBags = Number(raw.numBags) || 0;
    const perBagWeightKg = Number(raw.perBagWeightKg) || 0;

    const netWeightKgRaw =
      raw.netWeightKg !== undefined && raw.netWeightKg !== ""
        ? Number(raw.netWeightKg)
        : numBags * perBagWeightKg;

    const netWeightKg = +netWeightKgRaw.toFixed(3);

    const rate = Number(raw.rate) || 0;
    const rateType =
      raw.rateType === "per_bag" || raw.rateType === "per_ton"
        ? raw.rateType
        : "per_kg";

    let amount = 0;
    if (rateType === "per_bag" || rateType === "per_ton") {
      amount = numBags * rate;
    } else {
      amount = netWeightKg * rate;
    }

    amount = +amount.toFixed(2);
    totalAmount += amount;

    items.push({
      productTypeId: raw.productTypeId,
      productTypeName: "", // filled after resolving product names
      numBags,
      perBagWeightKg,
      netWeightKg,
      rate,
      rateType,
      amount,
      isPaddy,
      productName: "",
      salePricePerKg: 0,
    });
  }

  totalAmount = +totalAmount.toFixed(2);
  return { items, totalAmount };
}

/**
 * Basic validation for transaction payload.
 */
function validatePayload(body) {
  const requiredFields = ["type", "date", "items"];
  for (const f of requiredFields) {
    if (!body[f]) return `Field "${f}" is required.`;
  }

  if (!["PURCHASE", "SALE"].includes(body.type)) {
    return 'Field "type" must be "PURCHASE" or "SALE".';
  }

  if (body.type === "SALE") {
    // For SALE we accept either a selected party id (sent as companyId) or a typed name (companyName).
    const hasId = !!body.companyId;
    const name = String(body.companyName || "").trim();
    if (!hasId && !name) {
      return 'Field "companyId" (or "companyName") is required for sales.';
    }
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return "At least one item is required.";
  }

  // Payment status
  const payStatus = body.paymentStatus || "PAID";
  if (!["PAID", "UNPAID", "PARTIAL"].includes(payStatus)) {
    return 'Field "paymentStatus" must be "PAID", "UNPAID" or "PARTIAL".';
  }

  if ((payStatus === "UNPAID" || payStatus === "PARTIAL") && !body.dueDate) {
    return "Due date is required for unpaid or partial payments.";
  }

  // Payment method
  const payMethod = body.paymentMethod || "CASH";
  if (!["CASH", "CARD", "ONLINE_TRANSFER", "BANK_TRANSFER", "CREDIT"].includes(payMethod)) {
    return 'Field "paymentMethod" must be one of CASH, CARD, ONLINE_TRANSFER, BANK_TRANSFER, CREDIT.';
  }

  const purchaseKind = body.purchaseKind === "PADDY" ? "PADDY" : "MANAGERIAL";
  const saleKind = body.saleKind === "CUSTOM" ? "CUSTOM" : "SMJ";

  // Items-level checks
  for (let i = 0; i < body.items.length; i++) {
    const it = body.items[i];
    const isPaddy = purchaseKind === "PADDY" && body.type === "PURCHASE";
    if (isPaddy) {
      if (it.netWeightKg === undefined || it.netWeightKg === null || it.netWeightKg === "") {
        return `Item ${i + 1}: "netWeightKg" is required.`;
      }
      if (it.rate === undefined || it.rate === null || it.rate === "") {
        return `Item ${i + 1}: "rate" is required.`;
      }
    } else {
      if (!it.productTypeId) {
        return `Item ${i + 1}: "productTypeId" is required.`;
      }
      if (it.rate === undefined || it.rate === null || it.rate === "") {
        return `Item ${i + 1}: "rate" is required.`;
      }
    }
  }

  return null;
}

/**
 * CREATE transaction
 * POST /api/transactions
 */
exports.createTransaction = async (req, res) => {
  try {
    const payload = req.body || {};
    const validationMsg = validatePayload(payload);
    if (validationMsg) {
      return res.status(400).json({ success: false, message: validationMsg });
    }

    // Company / Party resolution:
    // - PURCHASE: optional Company reference (legacy behavior)
    // - SALE: resolve Customer based on party; do NOT require Company.
    let company = null;
    let party = null;
    if (payload.type === "SALE") {
      party = await resolveSaleParty(payload);
      if (!party) {
        return res.status(400).json({
          success: false,
          message: 'Field "companyId" (or "companyName") is required for sales.',
        });
      }
    } else if (payload.companyId) {
      company = await Company.findById(payload.companyId).lean();
      if (!company) {
        return res.status(400).json({ success: false, message: "Invalid companyId" });
      }
    }

    // Compute item amounts
    const { items, totalAmount } = computeItemAmounts(payload.items);
    const purchaseKind = payload.purchaseKind
      ? payload.purchaseKind === "PADDY"
        ? "PADDY"
        : "MANAGERIAL"
      : "MANAGERIAL";
    const saleKind = payload.saleKind
      ? payload.saleKind === "CUSTOM"
        ? "CUSTOM"
        : "SMJ"
      : "SMJ";

    // Resolve product names (production items only)
    const productIds = items
      .filter((i) => i.productTypeId)
      .map((i) => i.productTypeId);
    const productDocs = productIds.length
      ? await ProductType.find({ _id: { $in: productIds } })
          .lean()
          .select("name")
      : [];

    const productMap = {};
    for (const p of productDocs) {
      productMap[p._id.toString()] = p.name;
    }
    for (const item of items) {
      if (item.productTypeId) {
        item.productTypeName =
          productMap[item.productTypeId.toString()] || "Unknown";
      }
      if (item.isPaddy) {
        item.productTypeName = "Unprocessed Paddy";
      }
    }

    // Generate unique invoice number
    const invoiceNo = await generateInvoiceNo(payload.type);

    const payStatus = payload.paymentStatus || "PAID";
    const dueDate =
      payStatus === "PAID" || !payload.dueDate
        ? null
        : new Date(payload.dueDate);
    const partialPaid = Number(payload.partialPaid || 0);
    if (payStatus === "PARTIAL") {
      if (!partialPaid || partialPaid <= 0) {
        return res.status(400).json({
          success: false,
          message: "Partial payment requires a paid amount greater than 0.",
        });
      }
      if (partialPaid > totalAmount) {
        return res.status(400).json({
          success: false,
          message: "Amount paid cannot exceed total amount.",
        });
      }
    }
    const finalPaid =
      payStatus === "PAID"
        ? totalAmount
        : payStatus === "PARTIAL"
        ? partialPaid
        : 0;

    const doc = new Transaction({
      type: payload.type, // PURCHASE or SALE
      purchaseKind,
      saleKind,
      invoiceNo,
      date: new Date(payload.date),
      companyId: payload.type === "PURCHASE" ? payload.companyId || null : null,
      companyName:
        payload.type === "SALE"
          ? party?.partyName || String(payload.companyName || "").trim()
          : company?.name || payload.companyName || "Purchase",
      partyType: payload.type === "SALE" ? party?.partyType || null : null,
      partyRefId: payload.type === "SALE" ? party?.partyRefId || null : null,
      partyName: payload.type === "SALE" ? party?.partyName || "" : "",
      paymentStatus: payStatus,
      paymentMethod: payload.paymentMethod || "CASH",
      dueDate,
      items,
      totalAmount,
      partialPaid: finalPaid,
    });

    const saved = await doc.save();

    if (payload.type === "PURCHASE" && purchaseKind === "PADDY") {
      const settings = await SystemSettings.findOne({}).lean();
      const ownBrand =
        settings?.general?.companyName ||
        settings?.generalSettings?.companyName ||
        "SMJ";
      const paddyOps = items
        .filter((i) => i.isPaddy)
        .map((i) => ({
          date: new Date(payload.date),
          type: "IN",
          companyId: null,
          companyName: ownBrand,
          productTypeId: null,
          productTypeName: "Unprocessed Paddy",
          numBags: Number(i.numBags || 0),
          netWeightKg: Number(i.netWeightKg || 0),
          transactionId: saved._id,
          remarks: `Paddy purchase - ${saved.invoiceNo}`,
        }))
        .filter((i) => i.netWeightKg > 0);
      if (paddyOps.length) {
        await StockLedger.insertMany(paddyOps);
      }
      for (const it of items.filter((i) => i.isPaddy)) {
        const name = String(it.productName || "").trim();
        if (!name) continue;
        const existing = await ProductType.findOne({
          name: { $regex: new RegExp(`^${name}$`, "i") },
          brand: { $regex: new RegExp(`^${ownBrand}$`, "i") },
        });
        if (!existing) {
          await ProductType.create({
            name,
            brand: ownBrand,
            baseUnit: "KG",
            allowableSaleUnits: ["Bag", "Ton", "KG"],
            conversionFactors: { KG: 1, Bag: 65, Ton: 1000 },
            pricePerKg: Number(it.salePricePerKg || 0),
            pricePerBag: Math.round(Number(it.salePricePerKg || 0) * 65),
            pricePerTon: Math.round(Number(it.salePricePerKg || 0) * 1000),
          });
        } else {
          existing.pricePerKg = Number(it.salePricePerKg || 0);
          existing.pricePerBag = Math.round(Number(it.salePricePerKg || 0) * 65);
          existing.pricePerTon = Math.round(Number(it.salePricePerKg || 0) * 1000);
          await existing.save();
        }
      }
    }

    return res.status(201).json({ success: true, data: saved });
  } catch (err) {
    console.error("createTransaction error:", err);

    // If we somehow hit a duplicate invoiceNo, return a friendly error
    if (err.code === 11000 && err.keyPattern && err.keyPattern.invoiceNo) {
      return res.status(409).json({
        success: false,
        message: "Invoice number already exists. Please try again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while creating transaction.",
    });
  }
};

/**
 * GET list
 * GET /api/transactions?type=SALE|PURCHASE&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&companyId=&limit=&skip=
 */
exports.getTransactions = async (req, res) => {
  try {
    const {
      type,
      startDate,
      endDate,
      companyId,
      limit = 50,
      skip = 0,
    } = req.query;

    const q = {};
    if (type === "SALE" || type === "PURCHASE") {
      q.type = type;
    }

    if (companyId && mongoose.isValidObjectId(companyId)) {
      q.companyId = companyId;
    }

    if (startDate || endDate) {
      q.date = {};
      if (startDate) {
        q.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const d = new Date(endDate);
        d.setHours(23, 59, 59, 999);
        q.date.$lte = d;
      }
    }

    const total = await Transaction.countDocuments(q);
    const docs = await Transaction.find(q)
      .sort({ date: -1, createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    // Sync gate pass usage for dropdown filtering (works even for older data)
    const ids = (docs || []).map((d) => d && d._id).filter(Boolean);
    if (ids.length > 0) {
      const gps = await GatePass.find({
        $or: [
          { invoiceId: { $in: ids } }, // legacy
          { invoiceIds: { $in: ids } }, // multi
        ],
      })
        .select("invoiceId invoiceIds _id")
        .lean();
      const usedMap = new Map();
      (gps || []).forEach((g) => {
        const gpId = String(g._id);
        const all = [
          ...(Array.isArray(g.invoiceIds) ? g.invoiceIds : []),
          ...(g.invoiceId ? [g.invoiceId] : []),
        ].filter(Boolean);
        all.forEach((invId) => usedMap.set(String(invId), gpId));
      });

      let didUpdate = false;
      const bulk = [];
      docs.forEach((d) => {
        const gpId = usedMap.get(String(d._id));
        const prevUsed = !!d.gatePassUsed;
        const prevGpId = d.gatePassId ? String(d.gatePassId) : "";

        if (gpId) {
          d.gatePassUsed = true;
          d.gatePassId = gpId;
          if (!prevUsed || prevGpId !== gpId) {
            didUpdate = true;
            bulk.push({
              updateOne: {
                filter: { _id: d._id },
                update: { $set: { gatePassUsed: true, gatePassId: gpId } },
              },
            });
          }
        } else {
          // If we used to have a gate pass but it was deleted, clear stale flags.
          if (prevUsed || prevGpId) {
            didUpdate = true;
            d.gatePassUsed = false;
            d.gatePassId = null;
            bulk.push({
              updateOne: {
                filter: { _id: d._id },
                update: { $set: { gatePassUsed: false, gatePassId: null } },
              },
            });
          }
        }
      });

      if (didUpdate && bulk.length > 0) {
        try {
          await Transaction.bulkWrite(bulk, { ordered: false });
        } catch (e) {
          // Not fatal for the response; next call will retry.
          console.error("transactions gatePassUsed bulkWrite error:", e?.message || e);
        }
      }
    }

    return res.json({ success: true, total, data: docs });
  } catch (err) {
    console.error("getTransactions error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching transactions.",
    });
  }
};

/**
 * GET single
 * GET /api/transactions/:id
 */
exports.getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const doc = await Transaction.findById(id).lean();
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error("getTransactionById error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching transaction.",
    });
  }
};

/**
 * UPDATE
 * PUT /api/transactions/:id
 */
exports.updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const existing = await Transaction.findById(id);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    const payload = req.body || {};

    // Do not allow changing type or invoiceNo
    if (payload.type && payload.type !== existing.type) {
      return res.status(400).json({
        success: false,
        message: "Transaction type cannot be changed.",
      });
    }
    if (payload.invoiceNo && payload.invoiceNo !== existing.invoiceNo) {
      return res.status(400).json({
        success: false,
        message: "Invoice number cannot be changed.",
      });
    }

    // Validate using existing type
    const validationMsg = validatePayload({
      ...payload,
      type: existing.type,
    });
    if (validationMsg) {
      return res.status(400).json({ success: false, message: validationMsg });
    }

    // Company / Party update:
    // - PURCHASE keeps legacy companyId
    // - SALE uses Customer and ignores Company
    let company = null;
    let party = null;
    const companyId = payload.companyId || existing.companyId || null;
    if (existing.type === "SALE") {
      party = await resolveSaleParty({
        ...payload,
        saleKind: payload.saleKind || existing.saleKind,
        companyId: payload.companyId || existing.partyRefId || null,
        companyName: payload.companyName || existing.partyName || existing.companyName || "",
      });
      if (!party) {
        return res.status(400).json({
          success: false,
          message: 'Field "companyId" (or "companyName") is required for sales.',
        });
      }
    } else if (companyId) {
      company = await Company.findById(companyId).lean();
      if (!company) {
        return res.status(400).json({ success: false, message: "Invalid companyId" });
      }
    }

    // Items & totals
    const { items, totalAmount } = computeItemAmounts(payload.items);
    const purchaseKind = payload.purchaseKind === "PADDY" ? "PADDY" : "MANAGERIAL";
    const saleKind = payload.saleKind === "CUSTOM" ? "CUSTOM" : "SMJ";

    const productIds = items
      .filter((i) => i.productTypeId)
      .map((i) => i.productTypeId);
    const productDocs = productIds.length
      ? await ProductType.find({ _id: { $in: productIds } })
          .lean()
          .select("name")
      : [];

    const productMap = {};
    for (const p of productDocs) {
      productMap[p._id.toString()] = p.name;
    }
    for (const item of items) {
      if (item.productTypeId) {
        item.productTypeName =
          productMap[item.productTypeId.toString()] || "Unknown";
      }
      if (item.isPaddy) {
        item.productTypeName = "Unprocessed Paddy";
      }
    }

    const payStatus = payload.paymentStatus || "PAID";
    const dueDate =
      payStatus === "PAID" || !payload.dueDate
        ? null
        : new Date(payload.dueDate);
    const partialPaid = Number(payload.partialPaid || 0);
    if (payStatus === "PARTIAL") {
      if (!partialPaid || partialPaid <= 0) {
        return res.status(400).json({
          success: false,
          message: "Partial payment requires a paid amount greater than 0.",
        });
      }
      if (partialPaid > totalAmount) {
        return res.status(400).json({
          success: false,
          message: "Amount paid cannot exceed total amount.",
        });
      }
    }
    const finalPaid =
      payStatus === "PAID"
        ? totalAmount
        : payStatus === "PARTIAL"
        ? partialPaid
        : 0;

    existing.date = new Date(payload.date);
    existing.companyId = existing.type === "PURCHASE" ? companyId : null;
    existing.companyName =
      existing.type === "SALE"
        ? party?.partyName || String(payload.companyName || "").trim()
        : company?.name || payload.companyName || "Purchase";
    existing.partyType = existing.type === "SALE" ? party?.partyType || null : null;
    existing.partyRefId = existing.type === "SALE" ? party?.partyRefId || null : null;
    existing.partyName = existing.type === "SALE" ? party?.partyName || "" : "";
    existing.paymentStatus = payStatus;
    existing.paymentMethod =
      payload.paymentMethod || existing.paymentMethod || "CASH";
    existing.dueDate = dueDate;
    existing.purchaseKind = purchaseKind;
    existing.saleKind = saleKind;
    existing.items = items;
    existing.totalAmount = totalAmount;
    existing.partialPaid = finalPaid;

    const saved = await existing.save();

    if (existing.type === "PURCHASE") {
      await StockLedger.deleteMany({ transactionId: existing._id });
      if (purchaseKind === "PADDY") {
        const settings = await SystemSettings.findOne({}).lean();
        const ownBrand =
          settings?.general?.companyName ||
          settings?.generalSettings?.companyName ||
          "SMJ";
        const paddyOps = items
          .filter((i) => i.isPaddy)
          .map((i) => ({
            date: new Date(payload.date),
            type: "IN",
            companyId: null,
            companyName: ownBrand,
            productTypeId: null,
            productTypeName: "Unprocessed Paddy",
            numBags: Number(i.numBags || 0),
            netWeightKg: Number(i.netWeightKg || 0),
            transactionId: existing._id,
            remarks: `Paddy purchase - ${existing.invoiceNo}`,
          }))
          .filter((i) => i.netWeightKg > 0);
        if (paddyOps.length) {
          await StockLedger.insertMany(paddyOps);
        }
        for (const it of items.filter((i) => i.isPaddy)) {
          const name = String(it.productName || "").trim();
          if (!name) continue;
          const existingProduct = await ProductType.findOne({
            name: { $regex: new RegExp(`^${name}$`, "i") },
            brand: { $regex: new RegExp(`^${ownBrand}$`, "i") },
          });
          if (!existingProduct) {
            await ProductType.create({
              name,
              brand: ownBrand,
              baseUnit: "KG",
              allowableSaleUnits: ["Bag", "Ton", "KG"],
              conversionFactors: { KG: 1, Bag: 65, Ton: 1000 },
              pricePerKg: Number(it.salePricePerKg || 0),
              pricePerBag: Math.round(Number(it.salePricePerKg || 0) * 65),
              pricePerTon: Math.round(Number(it.salePricePerKg || 0) * 1000),
            });
          } else {
            existingProduct.pricePerKg = Number(it.salePricePerKg || 0);
            existingProduct.pricePerBag = Math.round(Number(it.salePricePerKg || 0) * 65);
            existingProduct.pricePerTon = Math.round(Number(it.salePricePerKg || 0) * 1000);
            await existingProduct.save();
          }
        }
      }
    }

    return res.json({ success: true, data: saved });
  } catch (err) {
    console.error("updateTransaction error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while updating transaction.",
    });
  }
};

/**
 * DELETE
 * DELETE /api/transactions/:id
 */
exports.deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const deleted = await Transaction.findByIdAndDelete(id);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    await StockLedger.deleteMany({ transactionId: deleted._id });
    return res.json({ success: true, message: "Transaction deleted." });
  } catch (err) {
    console.error("deleteTransaction error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting transaction.",
    });
  }
};

/**
 * Simple TODAY summary (optional, used later by dashboard/reports)
 * GET /api/transactions/summary/today
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

    const pipeline = [
      {
        $match: {
          date: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
    ];

    const agg = await Transaction.aggregate(pipeline);

    const summary = {
      SALE: { count: 0, totalAmount: 0 },
      PURCHASE: { count: 0, totalAmount: 0 },
    };

    for (const g of agg) {
      if (g._id === "SALE") {
        summary.SALE.count = g.count;
        summary.SALE.totalAmount = +(g.totalAmount || 0);
      } else if (g._id === "PURCHASE") {
        summary.PURCHASE.count = g.count;
        summary.PURCHASE.totalAmount = +(g.totalAmount || 0);
      }
    }

    return res.json({ success: true, data: summary });
  } catch (err) {
    console.error("getTodaySummary error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while computing summary.",
    });
  }
};
