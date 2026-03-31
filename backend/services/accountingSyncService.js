const AccountingParty = require("../models/accountingPartyModel");
const AccountingProduct = require("../models/accountingProductModel");
const Customer = require("../models/customerModel");
const ProductType = require("../models/productTypeModel");

let ensureIndexesPromise = null;

async function safeDropIndex(collection, indexName) {
  try {
    await collection.dropIndex(indexName);
  } catch (err) {
    const msg = String(err?.message || "");
    if (/index not found/i.test(msg) || /ns not found/i.test(msg)) return;
    throw err;
  }
}

async function safeCreateIndex(collection, keys, options) {
  try {
    await collection.createIndex(keys, options);
  } catch (err) {
    const msg = String(err?.message || err?.errmsg || "");
    const code = err?.code;
    const codeName = String(err?.codeName || "");
    if (code === 85 || /IndexOptionsConflict/i.test(codeName) || /already exists/i.test(msg)) return;
    throw err;
  }
}

async function ensureAccountingSyncIndexes() {
  if (ensureIndexesPromise) return ensureIndexesPromise;
  ensureIndexesPromise = (async () => {
    // Drop legacy unique name indexes if they exist (from older schema)
    await safeDropIndex(AccountingParty.collection, "name_1");
    await safeDropIndex(AccountingProduct.collection, "name_1");

    // Ensure desired indexes exist
    await safeCreateIndex(
      AccountingParty.collection,
      { sourceType: 1, sourceRefId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          sourceType: { $in: ["CUSTOMER", "WHOLESELLER"] },
          sourceRefId: { $exists: true },
        },
        name: "sourceType_1_sourceRefId_1_unique_synced",
      }
    );
    await safeCreateIndex(AccountingParty.collection, { name: 1 }, { name: "name_1_search" });

    await safeCreateIndex(
      AccountingProduct.collection,
      { sourceProductTypeId: 1 },
      {
        unique: true,
        partialFilterExpression: { sourceProductTypeId: { $exists: true } },
        name: "sourceProductTypeId_1_unique_synced",
      }
    );
    await safeCreateIndex(AccountingProduct.collection, { name: 1, brand: 1 }, { name: "name_1_brand_1" });
  })().catch((err) => {
    ensureIndexesPromise = null;
    throw err;
  });
  return ensureIndexesPromise;
}

function displayNameFromProductType(pt) {
  const name = String(pt?.name || "").trim();
  const brand = String(pt?.brand || "").trim();
  if (brand && name) return `${brand} - ${name}`;
  return name || brand || "";
}

async function syncPartiesFromMasters() {
  await ensureAccountingSyncIndexes();
  const customers = await Customer.find({}).lean();
  const ids = customers.map((c) => c._id).filter(Boolean);

  const ops = customers.map((c) => ({
    updateOne: {
      filter: { sourceType: "CUSTOMER", sourceRefId: c._id },
      update: {
        $set: {
          name: String(c.name || "").trim(),
          partyType: "CUSTOMER",
          phone: String(c.phone || "").trim(),
          email: String(c.email || "").trim(),
          address: String(c.address || "").trim(),
          isActive: true,
          sourceType: "CUSTOMER",
          sourceRefId: c._id,
        },
      },
      upsert: true,
    },
  }));

  const bulkRes = ops.length
    ? await AccountingParty.bulkWrite(ops, { ordered: false })
    : { upsertedCount: 0, modifiedCount: 0 };

  const deactivateFilter = {
    sourceType: "CUSTOMER",
    ...(ids.length ? { sourceRefId: { $nin: ids } } : {}),
    isActive: true,
  };
  const deactivatedRes = await AccountingParty.updateMany(deactivateFilter, { $set: { isActive: false } });

  return {
    created: bulkRes.upsertedCount || 0,
    updated: bulkRes.modifiedCount || 0,
    deactivated: deactivatedRes.modifiedCount || 0,
  };
}

async function syncProductsFromProductTypes() {
  await ensureAccountingSyncIndexes();
  const productTypes = await ProductType.find({}).lean();
  const ids = productTypes.map((p) => p._id).filter(Boolean);

  const ops = productTypes.map((p) => {
    const name = String(p.name || "").trim();
    const brand = String(p.brand || "").trim();
    const unit = String(p.baseUnit || "").trim();
    const displayName = displayNameFromProductType(p);
    return {
      updateOne: {
        filter: { sourceProductTypeId: p._id },
        update: {
          $set: {
            name,
            brand,
            unit,
            displayName,
            isActive: true,
            sourceProductTypeId: p._id,
          },
          $setOnInsert: { sku: "" },
        },
        upsert: true,
      },
    };
  });

  const bulkRes = ops.length
    ? await AccountingProduct.bulkWrite(ops, { ordered: false })
    : { upsertedCount: 0, modifiedCount: 0 };

  const andParts = [{ sourceProductTypeId: { $exists: true } }, { isActive: true }];
  if (ids.length) andParts.push({ sourceProductTypeId: { $nin: ids } });
  const deactivateFilter = { $and: andParts };
  const deactivatedRes = await AccountingProduct.updateMany(deactivateFilter, { $set: { isActive: false } });

  return {
    created: bulkRes.upsertedCount || 0,
    updated: bulkRes.modifiedCount || 0,
    deactivated: deactivatedRes.modifiedCount || 0,
  };
}

module.exports = {
  syncPartiesFromMasters,
  syncProductsFromProductTypes,
};
