// backend/controllers/stockController.js
const Transaction = require("../models/transactionModel");
const Company = require("../models/companyModel");
const ProductType = require("../models/productTypeModel");
const StockLedger = require("../models/stockLedgerModel");

function makeKey(companyId, companyName, productTypeId, productTypeName) {
  const c =
    (companyId != null ? String(companyId) : null) ||
    String(companyName || "").trim().toLowerCase() ||
    "NO_COMPANY";
  const p =
    (productTypeId != null ? String(productTypeId) : null) ||
    productTypeName ||
    "UNKNOWN";
  return `${c}::${p}`;
}

function normalizeProductName(productTypeId, productTypeName) {
  if (!productTypeId) {
    const n = String(productTypeName || "").trim().toLowerCase();
    if (n === "paddy" || n === "unprocessed paddy") return "Paddy";
  }
  return productTypeName || "";
}

// Classify a stock ledger entry into a human-readable source: which gate pass,
// production group (PG-...) or production batch (PB-...) drove the movement.
function buildLedgerSource(l, delta) {
  const remarks = String(l.remarks || "");
  let sourceType = "Ledger";
  let refNo = "-";
  if (l.gatePassId) {
    sourceType = "Gate Pass";
    refNo = l.gatePassNo || "-";
  } else {
    const groupMatch = remarks.match(/\bPG-\d{8}-\d{6}\b/i);
    const batchMatch = remarks.match(/\bPB-\d{8}-\d{6}\b/i);
    if (groupMatch) {
      sourceType = "Production Group";
      refNo = groupMatch[0].toUpperCase();
    } else if (batchMatch) {
      sourceType = "Production Batch";
      refNo = batchMatch[0].toUpperCase();
    } else if (/production|paddy/i.test(remarks)) {
      sourceType = "Production";
    }
  }
  return {
    sourceType,
    refNo,
    date: l.date,
    dateTime: l.updatedAt || l.createdAt,
    qtyKg: delta,
    direction: l.type,
    remarks,
  };
}

exports.getCurrentStock = async (req, res) => {
  try {
    const map = new Map();
    const companyCache = new Map(); // companyId -> companyName

    const getCompanyName = async (companyId, fallbackName = "") => {
      if (!companyId) return fallbackName || "";
      const idStr = companyId.toString();
      if (companyCache.has(idStr)) return companyCache.get(idStr);

      const comp = await Company.findById(idStr).select("name").lean();
      const name = comp ? comp.name : fallbackName || "";
      companyCache.set(idStr, name);
      return name;
    };

    const productDocs = await ProductType.find({})
      .select("name brand")
      .lean();
    const productMeta = new Map(
      productDocs.map((p) => [String(p._id), { name: p.name, brand: p.brand }])
    );

    const getBrandName = (productTypeId, fallback = "") => {
      if (!productTypeId) return fallback || "";
      const meta = productMeta.get(String(productTypeId));
      return (meta && meta.brand) || fallback || "";
    };

    const addToMap = (
      companyId,
      companyName,
      productTypeId,
      productTypeName,
      deltaKg,
      updatedAt,
      sourceInfo = null
    ) => {
      const normalizedName = normalizeProductName(productTypeId, productTypeName);
      if (!productTypeId && !normalizedName) return;
      const qty = Number(deltaKg || 0);
      if (!qty) return;

      const key = makeKey(companyId, companyName, productTypeId, normalizedName);
      const existing = map.get(key) || {
        companyId: null,
        companyName: companyName || "",
        // Explicit alias: in production stock we often use "companyName" as brand/trademark.
        // Keeping both reduces confusion on the frontend/AI side.
        brandName: companyName || "",
        productTypeId: productTypeId || null,
        productTypeName: normalizedName,
        balanceKg: 0,
        lastUpdated: null,
        sources: [],
      };

      existing.balanceKg += qty;

      const newTime = updatedAt ? new Date(updatedAt) : null;
      if (newTime) {
        if (!existing.lastUpdated || newTime > existing.lastUpdated) {
          existing.lastUpdated = newTime;
        }
      }

      if (sourceInfo) existing.sources.push(sourceInfo);
      map.set(key, existing);
    };

    // 0️⃣ Raw paddy from paddy ledger (gate pass + production batch allocation/returns)
    // Query narrowly to avoid any case/whitespace inconsistencies in productTypeName.
    const ledgerRows = await StockLedger.find({
      productTypeId: null,
      productTypeName: { $regex: /^(paddy|unprocessed paddy)\s*$/i },
    }).lean();
    for (const l of ledgerRows) {
      if (!l.productTypeName) continue;
      const net = Number(l.netWeightKg || 0);
      if (!net) continue;
      const delta = l.type === "OUT" ? -net : net;
      const dateTime = l.updatedAt || l.createdAt;
      addToMap(
        l.companyId || null,
        l.companyName || "",
        null,
        "Unprocessed Paddy",
        delta,
        dateTime,
        buildLedgerSource(l, delta)
      );
    }

    // 0.5️⃣ Gate pass / ledger entries for finished products (non-paddy)
    const finishedLedgerRows = await StockLedger.find({
      $or: [
        { productTypeId: { $ne: null } },
        { productTypeName: { $not: /^(paddy|unprocessed paddy)\s*$/i } },
      ],
    }).lean();
    for (const l of finishedLedgerRows) {
      const net = Number(l.netWeightKg || 0);
      if (!net) continue;
      const delta = l.type === "OUT" ? -net : net;
      const dateTime = l.updatedAt || l.createdAt;
      addToMap(
        l.companyId || null,
        l.companyName || "",
        l.productTypeId || null,
        l.productTypeName || "",
        delta,
        dateTime,
        buildLedgerSource(l, delta)
      );
    }

    // 1️⃣ PURCHASE transactions → add items
    const purchases = await Transaction.find({ type: "PURCHASE" }).lean();
    for (const t of purchases) {
      const items = t.items || [];
      const tDate = t.date || t.createdAt;
      const tDateTime = t.updatedAt || t.createdAt;

      for (const it of items) {
        if (!it.productTypeId) continue;
        const productTypeId = it.productTypeId?.toString();
        const productTypeName = it.productTypeName || "";
        const brandName = getBrandName(productTypeId, "");
        const net = Number(it.netWeightKg || 0);

        if (net > 0) {
          addToMap(
            null,
            brandName,
            productTypeId,
            productTypeName,
            net,
            tDateTime,
            {
              sourceType: "Purchase",
              refNo: t.invoiceNo || "-",
              date: tDate,
              dateTime: tDateTime,
              qtyKg: net,
              direction: "IN",
            }
          );
        }
      }
    }

    // 3️⃣ SALE transactions → subtract items
    const sales = await Transaction.find({ type: "SALE" }).lean();
    for (const t of sales) {
      const items = t.items || [];
      const tDate = t.date || t.createdAt;
      const tDateTime = t.updatedAt || t.createdAt;

      for (const it of items) {
        const productTypeId = it.productTypeId?.toString();
        const productTypeName = it.productTypeName || "";
        const brandName = getBrandName(productTypeId, "");
        const net = Number(it.netWeightKg || 0);

        if (net > 0) {
          addToMap(
            null,
            brandName,
            productTypeId,
            productTypeName,
            -net,
            tDateTime,
            {
              sourceType: "Sale",
              refNo: t.invoiceNo || "-",
              date: tDate,
              dateTime: tDateTime,
              qtyKg: -net,
              direction: "OUT",
            }
          );
        }
      }
    }

    // 4️⃣ Final rows: fix companyName & lastUpdated
    const rows = [];
    for (const val of map.values()) {
      // Never show negative stock in UI; clamp at 0 but still return the brand/product row
      // so users can see the brand exists in stock and why it is "empty".
      val.balanceKg = Math.max(0, +val.balanceKg.toFixed(3));

      if (val.lastUpdated) {
        val.lastUpdated = new Date(val.lastUpdated);
      }

      // 🔹 If companyName empty but we have companyId → lookup
      if (val.companyId && !val.companyName) {
        // eslint-disable-next-line no-await-in-loop
        val.companyName = await getCompanyName(val.companyId, "");
      }

      // 🔹 If still no company info → treat as Mill Own Stock
      if (!val.companyId && !val.companyName) {
        val.companyName = "Mill Own Stock";
      }

      if (!val.brandName) val.brandName = val.companyName || "";

      // Split inventory into Raw (paddy/raw materials) and Production (finished products).
      val.category = val.productTypeId ? "PRODUCTION" : "RAW";

      rows.push(val);
    }

    const summary = {
      totalProducts: rows.length,
      totalKg: +rows.reduce((sum, r) => sum + r.balanceKg, 0).toFixed(3),
    };

    return res.json({ success: true, data: rows, summary });
  } catch (err) {
    console.error("getCurrentStock error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while computing current stock.",
    });
  }
};

