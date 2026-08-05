// backend/controllers/systemSettingsController.js
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const SystemSettings = require("../models/systemSettingsModel");
const ProductType = require("../models/productTypeModel");
const ExpenseCategory = require("../models/expenseCategoryModel");
const ProductionBatch = require("../models/productionBatchModel");
const GatePass = require("../models/gatePassModel");
const StockLedger = require("../models/stockLedgerModel");
const Transaction = require("../models/transactionModel");
const ExpenseEntry = require("../models/expenseEntryModel");
const SystemAction = require("../models/systemActionModel");
const Customer = require("../models/customerModel");
const Account = require("../models/accountModel");
const AccountingEntity = require("../models/accountingEntityModel");
const AccountingParty = require("../models/accountingPartyModel");
const AccountingProduct = require("../models/accountingProductModel");
const AccountingFilterTemplate = require("../models/accountingFilterTemplateModel");
const AccountingGeneratedJournal = require("../models/accountingGeneratedJournalModel");
const JournalEntry = require("../models/journalEntryModel");
const JournalLine = require("../models/journalLineModel");
const backupService = require("../services/backupService");
const googleDriveService = require("../services/googleDriveService");

const COLLECTIONS = [
  { key: "customers", model: Customer },
  { key: "productTypes", model: ProductType },
  { key: "expenseCategories", model: ExpenseCategory },
  // Accounting
  { key: "accountingEntities", model: AccountingEntity },
  { key: "accountingParties", model: AccountingParty },
  { key: "accountingProducts", model: AccountingProduct },
  { key: "accountingFilterTemplates", model: AccountingFilterTemplate },
  { key: "accountingGeneratedJournals", model: AccountingGeneratedJournal },
  { key: "accounts", model: Account },
  { key: "journalEntries", model: JournalEntry },
  { key: "journalLines", model: JournalLine },
  { key: "transactions", model: Transaction },
  { key: "gatePasses", model: GatePass },
  { key: "productionBatches", model: ProductionBatch },
  { key: "stockLedgers", model: StockLedger },
  { key: "expenseEntries", model: ExpenseEntry },
  { key: "systemActions", model: SystemAction },
];

const BACKUP_VERSION = 3;
const BACKUP_FOLDER = path.join(__dirname, "../backups");
const SETTINGS_ARRAY_COUNT_EXCLUSIONS = new Set(["backupHistory"]);
let backupSchedulerHandle = null;
let backupSchedulerStartHandle = null;
let backupSchedulerBusy = false;

const MODULES = [
  {
    key: "settings",
    name: "System Settings",
    description: "General settings, branding, login, PINs and dropdown options.",
    collections: ["settings"],
  },
  {
    key: "masters",
    name: "Master Data",
    description: "Customers, product types and expense categories.",
    collections: ["customers", "productTypes", "expenseCategories"],
  },
  {
    key: "accounting",
    name: "Accounting",
    description: "Chart of accounts, vouchers, journals and accounting masters.",
    collections: [
      "accountingEntities",
      "accountingParties",
      "accountingProducts",
      "accountingFilterTemplates",
      "accountingGeneratedJournals",
      "accounts",
      "journalEntries",
      "journalLines",
    ],
  },
  {
    key: "transactions",
    name: "Transactions",
    description: "Purchase and sale invoices with payment details.",
    collections: ["transactions"],
  },
  {
    key: "gatepasses",
    name: "Gate Passes",
    description: "Gate pass IN and OUT movement history.",
    collections: ["gatePasses"],
  },
  {
    key: "production",
    name: "Production",
    description: "Production batches and process outputs.",
    collections: ["productionBatches"],
  },
  {
    key: "stock",
    name: "Stock Ledger",
    description: "Live stock movement and ledger balances.",
    collections: ["stockLedgers"],
  },
  {
    key: "expenses",
    name: "Expenses",
    description: "Expense entries captured across the system.",
    collections: ["expenseEntries"],
  },
  {
    key: "intelligence",
    name: "Audit Logs",
    description: "System action history and audit activity.",
    collections: ["systemActions"],
  },
];

const cleanupFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {
    // Best-effort cleanup for uploaded restore files.
  }
};

const ensureBackupFolder = () => {
  if (!fs.existsSync(BACKUP_FOLDER)) {
    fs.mkdirSync(BACKUP_FOLDER, { recursive: true });
  }
};

const countSettingsEntries = (settings) => {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return 0;
  let total = 1;
  const uniqueDropdownValues = new Set();
  Object.entries(settings).forEach(([key, value]) => {
    if (SETTINGS_ARRAY_COUNT_EXCLUSIONS.has(key)) return;
    if (!Array.isArray(value)) return;
    value.forEach((item) => {
      const normalized = String(item || "").trim().toLowerCase();
      if (!normalized) return;
      uniqueDropdownValues.add(normalized);
    });
  });
  return total + uniqueDropdownValues.size;
};

const countPayloadRecords = (payload, collectionKeys = []) => {
  let total = 0;
  const includeSettings = !collectionKeys.length || collectionKeys.includes("settings");
  if (includeSettings) total += countSettingsEntries(payload.settings);
  const targetKeys = collectionKeys.length
    ? collectionKeys.filter((key) => key !== "settings")
    : COLLECTIONS.map((c) => c.key);
  targetKeys.forEach((key) => {
    total += Array.isArray(payload[key]) ? payload[key].length : 0;
  });
  return total;
};

const normalizeTimezone = (value = "") => {
  const tz = String(value || "").trim();
  if (!tz) return "Asia/Karachi";
  if (tz.toLowerCase() === "asia/lahore") return "Asia/Karachi";
  return tz;
};

const getNowInTimezoneParts = (timezone = "Asia/Karachi") => {
  const tz = normalizeTimezone(timezone);
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
  }
  const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    timeKey: `${map.hour}:${map.minute}`,
  };
};

const getDateKeyInTimezone = (date, timezone = "Asia/Karachi") => {
  const tz = normalizeTimezone(timezone);
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
};

const writeBackupSnapshotToDisk = ({ payload, fileName }) => {
  ensureBackupFolder();
  const targetPath = path.join(BACKUP_FOLDER, fileName);
  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf8");
  return targetPath;
};

const validateBackupPayload = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid backup file.");
  }

  if (data.settings != null && (typeof data.settings !== "object" || Array.isArray(data.settings))) {
    throw new Error("Invalid settings payload in backup.");
  }

  for (const c of COLLECTIONS) {
    const value = data[c.key];
    if (value != null && !Array.isArray(value)) {
      throw new Error(`Invalid ${c.key} payload in backup.`);
    }
  }
};

const getSingletonSettings = async () =>
  (await SystemSettings.find({}).sort({ createdAt: 1 }).limit(1).lean().then((rows) => rows[0] || null)) || null;

const getCollectionByKey = (key) => COLLECTIONS.find((c) => c.key === key) || null;

const getModuleByKey = (key) => MODULES.find((m) => m.key === key) || null;

const dropSettingsDropdownArrays = (settings) => {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return settings;
  const clone = { ...settings };
  Object.entries(clone).forEach(([key, value]) => {
    if (SETTINGS_ARRAY_COUNT_EXCLUSIONS.has(key)) return;
    if (Array.isArray(value)) clone[key] = [];
  });
  return clone;
};

// Records the user "deleted" from the frontend are soft-deleted in the database
// (e.g. accounts set to isActive:false) so that older journal entries keep
// working. They must NOT be included in backups and must NOT be resurrected by
// a restore. Collections without these flags are unaffected (missing fields
// are not equal to false/true).
const isSoftDeleted = (doc) => {
  if (!doc || typeof doc !== "object") return false;
  if (doc.deleted === true) return true;
  if (doc.isActive === false) return true;
  return false;
};

const buildBackupPayload = async ({ moduleKey = "", includeMeta = true, includeDropdowns = true, onProgress = null } = {}) => {
  const now = new Date();
  const selectedModule = moduleKey ? getModuleByKey(moduleKey) : null;
  if (moduleKey && !selectedModule) {
    const err = new Error("Invalid backup module.");
    err.statusCode = 404;
    throw err;
  }

  const targetCollectionKeys = selectedModule
    ? selectedModule.collections.filter((key) => key !== "settings")
    : COLLECTIONS.map((c) => c.key);

  const payload = {
    backupVersion: BACKUP_VERSION,
    exportedAt: now,
    scope: selectedModule ? "module" : "full",
    moduleKey: selectedModule?.key || "",
    moduleName: selectedModule?.name || "",
  };

  if (!selectedModule || selectedModule.collections.includes("settings")) {
    if (onProgress) onProgress({ percent: 4, label: "Collecting system settings..." });
    const settings = await getSingletonSettings();
    payload.settings = includeDropdowns ? settings : dropSettingsDropdownArrays(settings);
  }

  payload.includeDropdowns = !!includeDropdowns;

  const total = targetCollectionKeys.length;
  let processed = 0;
  for (const collectionKey of targetCollectionKeys) {
    const collection = getCollectionByKey(collectionKey);
    if (!collection) continue;
    try {
      payload[collection.key] = (await collection.model.find({}).lean()).filter(
        (doc) => !isSoftDeleted(doc)
      );
    } catch (_) {
      payload[collection.key] = [];
    }
    processed += 1;
    if (onProgress) {
      const percent = 8 + Math.round((processed / Math.max(total, 1)) * 58);
      onProgress({ percent, label: `Collecting ${collection.key} data... ${percent}%` });
    }
  }

  if (includeMeta) {
    payload.meta = {
      generatedAt: now,
      modules: MODULES.map((m) => ({
        key: m.key,
        name: m.name,
        collections: m.collections,
      })),
    };
  }

  return payload;
};

const PROTECTED_SETTINGS_KEYS = new Set([
  "adminPin",
  "loginPassword",
  "otpCodeHash",
  "otpExpiresAt",
  "gdriveRefreshToken",
  "gdriveOAuthState",
  "gdriveAccountEmail",
  "gdriveFolderId",
  "gdriveLastBackupAt",
  "backupHistory",
  "backupLastBackupAt",
  "backupLastRestoreAt",
  "backupScheduleLastRunAt",
]);

const mergeSettingsPayload = async (backupSettings) => {
  const existing = await getSingletonSettings();
  const target = existing || (await SystemSettings.create({}));
  if (!backupSettings || typeof backupSettings !== "object" || Array.isArray(backupSettings)) return;
  const merged = { ...target.toObject() };
  Object.entries(backupSettings).forEach(([key, value]) => {
    if (key === "_id" || key === "__v" || PROTECTED_SETTINGS_KEYS.has(key)) return;
    if (Array.isArray(value)) {
      const current = Array.isArray(merged[key]) ? merged[key] : [];
      const seen = new Set(current.map((v) => String(v || "").trim().toLowerCase()));
      value.forEach((v) => {
        const norm = String(v || "").trim().toLowerCase();
        if (norm && !seen.has(norm)) {
          seen.add(norm);
          current.push(v);
        }
      });
      merged[key] = current;
      return;
    }
    merged[key] = value;
  });
  Object.assign(target, merged);
  await target.save();
};

const restoreCollections = async (data, collectionKeys, mode = "replace") => {
  const isMerge = String(mode || "").trim().toLowerCase() === "merge";

  if (collectionKeys.includes("settings")) {
    if (isMerge) {
      await mergeSettingsPayload(data.settings);
    } else {
      await SystemSettings.deleteMany({});
      if (data.settings) {
        await SystemSettings.create(data.settings);
      }
    }
  }

  const ordered = collectionKeys.filter((key) => key !== "settings");

  if (!isMerge) {
    for (const key of [...ordered].reverse()) {
      const collection = getCollectionByKey(key);
      if (!collection) continue;
      try {
        await collection.model.deleteMany({});
      } catch (e) {
        console.error(`restore clear ${collection.key} error:`, e);
      }
    }
  }

  const counts = {};
  for (const key of ordered) {
    const collection = getCollectionByKey(key);
    if (!collection) continue;
    const rows = (Array.isArray(data[collection.key]) ? data[collection.key] : []).filter(
      (row) => !isSoftDeleted(row)
    );
    if (!rows.length) continue;

    let rowsToInsert = rows;
    let insertedCount = 0;
    if (isMerge) {
      const existingDocs = await collection.model.find({}).select("_id").lean();
      const existingIds = new Set(existingDocs.map((doc) => String(doc._id || "")));
      rowsToInsert = rows.filter((row) => {
        const idKey = row?._id != null ? String(row._id) : row?.id != null ? String(row.id) : "";
        return idKey && !existingIds.has(idKey);
      });
    }

    if (!rowsToInsert.length) {
      counts[key] = 0;
      continue;
    }
    try {
      const inserted = await collection.model.insertMany(rowsToInsert, { ordered: false });
      insertedCount = Array.isArray(inserted) ? inserted.length : rowsToInsert.length;
    } catch (e) {
      console.error(`restore insert ${collection.key} error:`, e);
      insertedCount = 0;
    }
    counts[key] = insertedCount;
  }

  return collectionKeys.map((key) => ({
    key,
    count:
      key === "settings"
        ? countSettingsEntries(data.settings)
        : Number(counts[key] || 0),
  }));
};

const resolveModuleCollectionStats = async (module) => {
  let totalRecords = 0;
  let latestUpdatedAt = null;
  const collections = [];

  for (const key of module.collections) {
    if (key === "settings") {
      const settings = await getSingletonSettings();
      const count = countSettingsEntries(settings);
      totalRecords += count;
      const updatedAt = settings?.updatedAt ? new Date(settings.updatedAt) : null;
      if (updatedAt && (!latestUpdatedAt || updatedAt > latestUpdatedAt)) latestUpdatedAt = updatedAt;
      collections.push({ key: "settings", count, updatedAt });
      continue;
    }

    const collection = getCollectionByKey(key);
    if (!collection) continue;
    const count = await collection.model.countDocuments({
      isActive: { $ne: false },
      deleted: { $ne: true },
    });
    totalRecords += count;
    const latestRow = await collection.model.findOne({}).sort({ updatedAt: -1, createdAt: -1 }).select("updatedAt createdAt").lean();
    const updatedAt = latestRow?.updatedAt || latestRow?.createdAt || null;
    const updatedAtDate = updatedAt ? new Date(updatedAt) : null;
    if (updatedAtDate && (!latestUpdatedAt || updatedAtDate > latestUpdatedAt)) latestUpdatedAt = updatedAtDate;
    collections.push({ key: collection.key, count, updatedAt: updatedAtDate });
  }

  return {
    key: module.key,
    name: module.name,
    description: module.description,
    collections: collections.map((c) => ({
      key: c.key,
      count: c.count,
      updatedAt: c.updatedAt,
    })),
    totalRecords,
    latestUpdatedAt,
  };
};

const appendBackupHistory = async ({
  action,
  trigger = "MANUAL",
  scope = "module",
  moduleKey = "",
  moduleName = "",
  fileName = "",
  recordCount = 0,
  status = "SUCCESS",
  message = "",
}) => {
  const settings = await SystemSettings.findOne({}).sort({ createdAt: 1 });
  const target = settings || (await SystemSettings.create({}));
  const history = Array.isArray(target.backupHistory) ? target.backupHistory.slice(0, 24) : [];
  history.unshift({
    action,
    trigger,
    scope,
    moduleKey,
    moduleName,
    fileName,
    recordCount,
    status,
    message,
    createdAt: new Date(),
  });
  target.backupHistory = history.slice(0, 25);
  await target.save();
};

const runScheduledBackupIfDue = async () => {
  if (backupSchedulerBusy) return;
  backupSchedulerBusy = true;
  try {
    const settings = await SystemSettings.findOne({}).sort({ createdAt: 1 });
    if (!settings?.backupAutomationEnabled) return;

    const scheduleTime = String(settings.backupScheduleTime || "").trim() || "02:00";
    const timezone = String(settings.timezone || "Asia/Karachi").trim() || "Asia/Karachi";
    const nowParts = getNowInTimezoneParts(timezone);
    if (nowParts.timeKey !== scheduleTime) return;

    const lastRun = settings.backupScheduleLastRunAt ? new Date(settings.backupScheduleLastRunAt) : null;
    if (lastRun) {
      const lastRunKey = getDateKeyInTimezone(lastRun, timezone);
      if (lastRunKey === nowParts.dateKey) return;
    }

    const claimFilter = { _id: settings._id };
    if (settings.backupScheduleLastRunAt) {
      claimFilter.backupScheduleLastRunAt = settings.backupScheduleLastRunAt;
    } else {
      claimFilter.backupScheduleLastRunAt = null;
    }

    const claimedAt = new Date();
    const claim = await SystemSettings.updateOne(claimFilter, {
      $set: { backupScheduleLastRunAt: claimedAt },
    });
    if (!claim?.modifiedCount) return;

    // Skip silently if a manual/restore job is already using the engine.
    if (backupService.getProgress().running) return;

    const result = await backupService.runFullBackup({
      trigger: "AUTO",
      settings,
      countRecords: countPayloadRecords,
      buildPayload: () => buildBackupPayload({ includeDropdowns: true }),
      gdriveService: googleDriveService,
    });

    await SystemSettings.findOneAndUpdate(
      { _id: settings._id },
      { $set: { backupLastBackupAt: new Date() } }
    );

    await appendBackupHistory({
      action: "BACKUP",
      trigger: "AUTO",
      scope: "full",
      moduleName: "Full System",
      fileName: result.fileName,
      recordCount: result.recordCount,
      status: "SUCCESS",
      message: result.message,
    });
  } catch (err) {
    console.error("scheduled backup error:", err);
    await appendBackupHistory({
      action: "BACKUP",
      trigger: "AUTO",
      scope: "full",
      moduleName: "Full System",
      fileName: "",
      recordCount: 0,
      status: "FAILED",
      message: String(err?.message || "Scheduled backup failed."),
    }).catch(() => {});
  } finally {
    backupSchedulerBusy = false;
  }
};

exports.initBackupScheduler = () => {
  if (backupSchedulerHandle || backupSchedulerStartHandle) return;
  ensureBackupFolder();
  const delayMs = Math.max(1000, 60000 - (Date.now() % 60000));
  backupSchedulerStartHandle = setTimeout(() => {
    backupSchedulerStartHandle = null;
    runScheduledBackupIfDue().catch(() => {});
    backupSchedulerHandle = setInterval(() => {
      runScheduledBackupIfDue().catch(() => {});
    }, 60 * 1000);
  }, delayMs);
};

/**
 * Get settings (single document). If none exists, return defaults via an upsert fallback.
 */
exports.getSettings = async (req, res) => {
  try {
    // Ensure we effectively behave like a singleton settings document.
    // Some deployments ended up creating multiple settings docs; that makes
    // updates appear to "not save" because reads may return a different doc.
    const all = await SystemSettings.find({}).sort({ createdAt: 1 });
    let settings = all[0] || null;
    if (!settings) settings = await SystemSettings.create({});
    // Keep the oldest and remove any duplicates.
    if (all.length > 1) {
      const duplicateIds = all.slice(1).map((d) => d._id);
      await SystemSettings.deleteMany({ _id: { $in: duplicateIds } });
    }
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Update or create the single settings document.
 * Changing additionalStockSettingsEnabled requires adminPin in body and valid PIN.
 */
exports.saveSettings = async (req, res) => {
  try {
    const payload = { ...req.body };
    const adminPin = payload.adminPin != null ? String(payload.adminPin).trim() : null;
    const newAdminPin =
      payload.newAdminPin != null ? String(payload.newAdminPin).trim() : null;
    delete payload.adminPin;
    delete payload.newAdminPin;

    const needsPin =
      payload.stockStatusExtremeLowKg !== undefined ||
      payload.stockStatusLowKg !== undefined ||
      newAdminPin !== null;
    if (needsPin) {
      const settings = await SystemSettings.findOne({}).select("adminPin").lean();
      const expectedPin = (settings && settings.adminPin) || "0000";
      if (!adminPin || adminPin !== String(expectedPin).trim()) {
        return res.status(403).json({
          success: false,
          message: "Invalid or missing admin PIN. Required to change these settings.",
        });
      }
    }

    if (newAdminPin) {
      payload.adminPin = newAdminPin;
      payload.loginPassword = newAdminPin;
    } else if (payload.loginPassword && !payload.adminPin) {
      payload.adminPin = payload.loginPassword;
    }

    // Keep SMTP identity auto-synced with General Settings email when email changes.
    // Frontend may intentionally hide smtpUser/mailFrom fields.
    if (payload.email !== undefined) {
      const nextEmail = String(payload.email || "").trim();
      payload.smtpUser = nextEmail;
      payload.mailFrom = nextEmail;
    }

    const updated = await SystemSettings.findOneAndUpdate(
      {},
      { $set: payload },
      // Always update the oldest settings document to keep singleton behavior.
      { new: true, upsert: true, runValidators: true, sort: { createdAt: 1 } }
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * Upload logo (multipart/form-data)
 */
exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });

    const uploadsDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

    const host = req.get("host");
    const protocol = req.protocol;
    const publicUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    const all = await SystemSettings.find({}).sort({ createdAt: 1 }).select("_id logoUrl");
    const primary = all[0] || null;

    if (primary && primary.logoUrl) {
      const oldFilename = primary.logoUrl.split("/uploads/").pop();
      if (oldFilename && oldFilename !== req.file.filename) {
        const oldPath = path.join(uploadsDir, oldFilename);
        try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch {}
      }
    }

    if (all.length > 1) {
      const duplicateIds = all.slice(1).map((d) => d._id);
      await SystemSettings.deleteMany({ _id: { $in: duplicateIds } });
    }

    const updated = await SystemSettings.findOneAndUpdate(
      primary ? { _id: primary._id } : {},
      { $set: { logoUrl: publicUrl } },
      { new: true, upsert: true, runValidators: true, sort: { createdAt: 1 } }
    );

    res.json({ success: true, data: updated, logoUrl: publicUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Export backup: core settings + master data + operational data
 */
exports.exportBackup = async (req, res) => {
  try {
    const includeDropdowns = String(req.query?.includeDropdowns ?? "true").toLowerCase() !== "false";
    const payload = await buildBackupPayload({ includeDropdowns });
    const suffix = includeDropdowns ? "with-dropdowns" : "records-only";
    const nowParts = getNowInTimezoneParts(payload?.settings?.timezone || "Asia/Karachi");
    const fileName = `smj-backup-all-${suffix}-${nowParts.dateKey.replace(/-/g, "")}-${nowParts.timeKey.replace(":", "")}.json`;
    const recordCount = countPayloadRecords(payload);
    writeBackupSnapshotToDisk({ payload, fileName });
    await SystemSettings.findOneAndUpdate(
      {},
      { $set: { backupLastBackupAt: new Date() } },
      { new: true, upsert: true, sort: { createdAt: 1 } }
    );
    await appendBackupHistory({
      action: "BACKUP",
      trigger: "MANUAL",
      scope: "full",
      moduleName: "Full System",
      fileName,
      recordCount,
      status: "SUCCESS",
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${fileName}`
    );
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getBackupModules = async (_req, res) => {
  try {
    const settings = await getSingletonSettings();
    const modules = [];
    for (const module of MODULES) {
      // eslint-disable-next-line no-await-in-loop
      modules.push(await resolveModuleCollectionStats(module));
    }
    res.json({
      success: true,
      data: {
        automationEnabled: !!settings?.backupAutomationEnabled,
        scheduleTime: settings?.backupScheduleTime || "02:00",
        lastBackupAt: settings?.backupLastBackupAt || null,
        lastRestoreAt: settings?.backupLastRestoreAt || null,
        lastScheduledRunAt: settings?.backupScheduleLastRunAt || null,
        history: Array.isArray(settings?.backupHistory) ? settings.backupHistory : [],
        modules,
        storageMode: settings?.backupStorageMode || "auto",
        localFolderPath: settings?.backupLocalFolderPath || "",
        drive: {
          configured: Boolean(
            String(settings?.gdriveClientId || process.env.GDRIVE_CLIENT_ID || "").trim() &&
              String(settings?.gdriveClientSecret || process.env.GDRIVE_CLIENT_SECRET || "").trim()
          ),
          connected: Boolean(String(settings?.gdriveRefreshToken || "").trim()),
          accountEmail: String(settings?.gdriveAccountEmail || "").trim(),
          folderId: String(settings?.gdriveFolderId || "").trim(),
          lastDriveBackupAt: settings?.gdriveLastBackupAt || null,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.clearBackupHistory = async (_req, res) => {
  try {
    const updated = await SystemSettings.findOneAndUpdate(
      {},
      { $set: { backupHistory: [] } },
      { new: true, upsert: true, sort: { createdAt: 1 } }
    );
    res.json({
      success: true,
      message: "Backup history cleared successfully.",
      data: {
        history: Array.isArray(updated?.backupHistory) ? updated.backupHistory : [],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || "Failed to clear backup history." });
  }
};

exports.downloadBackupHistoryFile = async (req, res) => {
  try {
    const rawName = String(req.params?.fileName || "").trim();
    if (!rawName) {
      return res.status(400).json({ success: false, message: "Missing file name." });
    }

    const fileName = path.basename(rawName);
    if (fileName !== rawName) {
      return res.status(400).json({ success: false, message: "Invalid file name." });
    }
    if (!fileName.toLowerCase().endsWith(".json")) {
      return res.status(400).json({ success: false, message: "Only JSON backup files are supported." });
    }

    ensureBackupFolder();
    const backupRoot = path.resolve(BACKUP_FOLDER);
    const absolutePath = path.resolve(BACKUP_FOLDER, fileName);
    if (!absolutePath.startsWith(backupRoot + path.sep)) {
      return res.status(400).json({ success: false, message: "Invalid backup path." });
    }
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: "Backup file not found." });
    }

    res.setHeader("Content-Type", "application/json");
    return res.download(absolutePath, fileName);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Failed to download backup file." });
  }
};

exports.exportModuleBackup = async (req, res) => {
  try {
    const moduleKey = String(req.params?.moduleKey || "").trim();
    const module = getModuleByKey(moduleKey);
    if (!module) {
      return res.status(404).json({ success: false, message: "Backup module not found." });
    }

    const includeDropdowns = String(req.query?.includeDropdowns ?? "true").toLowerCase() !== "false";
    const payload = await buildBackupPayload({ moduleKey, includeDropdowns });
    const suffix = includeDropdowns ? "with-dropdowns" : "records-only";
    const nowParts = getNowInTimezoneParts(payload?.settings?.timezone || "Asia/Karachi");
    const fileName = `smj-backup-${module.key}-${suffix}-${nowParts.dateKey.replace(/-/g, "")}-${nowParts.timeKey.replace(":", "")}.json`;
    const recordCount = countPayloadRecords(payload, module.collections);
    writeBackupSnapshotToDisk({ payload, fileName });
    await SystemSettings.findOneAndUpdate(
      {},
      { $set: { backupLastBackupAt: new Date() } },
      { new: true, upsert: true, sort: { createdAt: 1 } }
    );
    await appendBackupHistory({
      action: "BACKUP",
      trigger: "MANUAL",
      scope: "module",
      moduleKey: module.key,
      moduleName: module.name,
      fileName,
      recordCount,
      status: "SUCCESS",
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${fileName}`
    );
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    const code = err?.statusCode || 500;
    res.status(code).json({ success: false, message: err.message });
  }
};

/**
 * Restore backup from JSON file. `mode` (query or form field) controls
 * conflict handling: "replace" wipes current data, "merge" keeps existing
 * records and only adds backup rows that don't already exist.
 */
exports.restoreBackup = async (req, res) => {
  let filePath = "";
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });

    filePath = req.file.path;
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    validateBackupPayload(data);

    const mode =
      String(req.body?.mode || req.query?.mode || "replace").trim().toLowerCase() === "merge"
        ? "merge"
        : "replace";

    backupService.beginRestore({ percent: 5, label: "Uploaded. Restoring data..." });
    const restoredCollections = await restoreCollections(
      data,
      ["settings", ...COLLECTIONS.map((c) => c.key)],
      mode
    );
    const restoredCount = restoredCollections.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const message =
      mode === "merge"
        ? `Backup merged with existing data (${restoredCount} records added).`
        : `Backup restored successfully (${restoredCount} records).`;
    await SystemSettings.findOneAndUpdate(
      {},
      { $set: { backupLastRestoreAt: new Date() } },
      { new: true, upsert: true, sort: { createdAt: 1 } }
    );
    await appendBackupHistory({
      action: "RESTORE",
      trigger: "MANUAL",
      scope: "full",
      moduleName: "Full System",
      fileName: String(req.file?.originalname || req.file?.filename || "restore.json"),
      recordCount: restoredCount,
      status: "SUCCESS",
      message,
    });
    backupService.endRestore({ success: true, message });

    cleanupFile(filePath);

    res.json({
      success: true,
      message,
      data: {
        backupVersion: data.backupVersion || null,
        mode,
        restoredCollections,
      },
    });
  } catch (err) {
    backupService.endRestore({ success: false, message: err.message });
    cleanupFile(filePath);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Full backup control (progress + pause/resume/cancel) ──────────────
exports.runFullBackup = async (req, res) => {
  try {
    const settings = await getSingletonSettings();
    const result = await backupService.runFullBackup({
      trigger: "MANUAL",
      settings,
      countRecords: countPayloadRecords,
      buildPayload: () => buildBackupPayload({ includeDropdowns: true }),
      gdriveService: googleDriveService,
    });
    const set = { backupLastBackupAt: new Date() };
    if (result.gdrive?.id) set.gdriveLastBackupAt = new Date();
    await SystemSettings.findOneAndUpdate(
      {},
      { $set: set },
      { new: true, upsert: true, sort: { createdAt: 1 } }
    );
    await appendBackupHistory({
      action: "BACKUP",
      trigger: "MANUAL",
      scope: "full",
      moduleName: "Full System",
      fileName: result.fileName,
      recordCount: result.recordCount,
      status: "SUCCESS",
      message: result.message,
    });
    res.json({ success: true, message: result.message, data: result });
  } catch (err) {
    await appendBackupHistory({
      action: "BACKUP",
      trigger: "MANUAL",
      scope: "full",
      moduleName: "Full System",
      fileName: "",
      recordCount: 0,
      status: "FAILED",
      message: String(err?.message || "Backup failed."),
    }).catch(() => {});
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getBackupStatus = (_req, res) => {
  res.json({ success: true, data: backupService.getProgress() });
};

exports.pauseBackup = (_req, res) => {
  try {
    res.json({ success: true, data: backupService.pauseBackup() });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.resumeBackup = (_req, res) => {
  try {
    res.json({ success: true, data: backupService.resumeBackup() });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.cancelBackup = (_req, res) => {
  try {
    res.json({ success: true, data: backupService.cancelBackup() });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─── Google Drive backup endpoints ──────────────────────────────────────
exports.getGdriveAuthUrl = async (req, res) => {
  try {
    const { authUrl, redirectUri } = await googleDriveService.startOAuth(req);
    res.json({ success: true, data: { authUrl, redirectUri } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.gdriveCallback = async (req, res) => {
  const { code, state, error } = req.query || {};
  if (error) {
    return res.status(400).send(`Google Drive authorization failed: ${error}`);
  }
  if (!code) return res.status(400).send("Missing authorization code.");
  try {
    await googleDriveService.exchangeCode({ code, req, expectedState: state });
    res.setHeader("Content-Type", "text/html");
    res.send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Connected</title></head>` +
        `<body style="margin:0;font-family:Arial,sans-serif;text-align:center;padding-top:80px;background:#f4f8f4">` +
        `<div style="display:inline-block;background:#fff;padding:32px 40px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08)">` +
        `<div style="font-size:40px">✅</div>` +
        `<h2 style="color:#065f46;margin:12px 0 6px">Google Drive connected</h2>` +
        `<p style="color:#4b5563;font-size:14px;margin:0">You can close this tab and return to SMJ.</p>` +
        `</div></body></html>`
    );
  } catch (err) {
    res.status(400).send(`Connection failed: ${err.message}`);
  }
};

exports.connectGdriveWithCode = async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) {
      return res.status(400).json({ success: false, message: "Missing authorization code." });
    }
    const result = await googleDriveService.exchangeCode({ code, req });
    res.json({ success: true, message: "Google Drive connected.", data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.disconnectGdrive = async (_req, res) => {
  try {
    const settings = await getSingletonSettings();
    await googleDriveService.revokeAccess(settings);
    await SystemSettings.findOneAndUpdate(
      {},
      {
        $set: {
          gdriveRefreshToken: "",
          gdriveAccountEmail: "",
          gdriveFolderId: "",
          gdriveOAuthState: "",
        },
      },
      { new: true, upsert: true, sort: { createdAt: 1 } }
    );
    res.json({ success: true, message: "Google Drive disconnected." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getGdriveStatus = async (_req, res) => {
  try {
    res.json({ success: true, data: await googleDriveService.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listGdriveFiles = async (_req, res) => {
  try {
    const files = await googleDriveService.listBackupFiles();
    res.json({ success: true, data: { files } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteGdriveFile = async (req, res) => {
  try {
    const fileId = String(req.body?.fileId || "").trim();
    if (!fileId) return res.status(400).json({ success: false, message: "Missing file id." });
    await googleDriveService.deleteBackupFile({ fileId });
    res.json({ success: true, message: "Backup file deleted from Google Drive." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.restoreFromGdrive = async (req, res) => {
  try {
    const fileId = String(req.body?.fileId || "").trim();
    const fileName = String(req.body?.fileName || "smj-backup-drive.json").trim();
    const mode =
      String(req.body?.mode || "replace").trim().toLowerCase() === "merge" ? "merge" : "replace";
    if (!fileId) return res.status(400).json({ success: false, message: "Missing file id." });

    const settings = await getSingletonSettings();
    const raw = await googleDriveService.downloadBackupFile({ fileId, settings });
    const data = JSON.parse(raw);
    validateBackupPayload(data);

    backupService.beginRestore({ percent: 10, label: "Backup downloaded. Restoring data..." });
    const restoredCollections = await restoreCollections(
      data,
      ["settings", ...COLLECTIONS.map((c) => c.key)],
      mode
    );
    const restoredCount = restoredCollections.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const message =
      mode === "merge"
        ? `Backup merged with existing data (${restoredCount} records added).`
        : `Backup restored successfully (${restoredCount} records).`;
    await SystemSettings.findOneAndUpdate(
      {},
      { $set: { backupLastRestoreAt: new Date() } },
      { new: true, upsert: true, sort: { createdAt: 1 } }
    );
    await appendBackupHistory({
      action: "RESTORE",
      trigger: "MANUAL",
      scope: "full",
      moduleName: "Full System (Google Drive)",
      fileName,
      recordCount: restoredCount,
      status: "SUCCESS",
      message,
    });
    backupService.endRestore({ success: true, message });
    res.json({
      success: true,
      message,
      data: { mode, restoredCollections, backupVersion: data.backupVersion || null },
    });
  } catch (err) {
    backupService.endRestore({ success: false, message: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.restoreModuleBackup = async (req, res) => {
  let filePath = "";
  try {
    const moduleKey = String(req.params?.moduleKey || "").trim();
    const module = getModuleByKey(moduleKey);
    if (!module) {
      return res.status(404).json({ success: false, message: "Backup module not found." });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    filePath = req.file.path;
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    validateBackupPayload(data);

    const restoredCollections = await restoreCollections(data, module.collections, "replace");
    const restoredCount = restoredCollections.reduce((sum, row) => sum + Number(row.count || 0), 0);
    await SystemSettings.findOneAndUpdate(
      {},
      { $set: { backupLastRestoreAt: new Date() } },
      { new: true, upsert: true, sort: { createdAt: 1 } }
    );
    await appendBackupHistory({
      action: "RESTORE",
      trigger: "MANUAL",
      scope: "module",
      moduleKey: module.key,
      moduleName: module.name,
      fileName: String(req.file?.originalname || req.file?.filename || `${module.key}.json`),
      recordCount: restoredCount,
      status: "SUCCESS",
    });

    cleanupFile(filePath);

    res.json({
      success: true,
      message: `${module.name} restored successfully`,
      data: {
        moduleKey: module.key,
        moduleName: module.name,
        backupVersion: data.backupVersion || null,
        restoredCollections,
      },
    });
  } catch (err) {
    cleanupFile(filePath);
    const code = err?.statusCode || 500;
    res.status(code).json({ success: false, message: err.message });
  }
};

const inferSmtpHost = (emailOrUser = "") => {
  const domain = String(emailOrUser).split("@")[1]?.toLowerCase() || "";
  if (domain === "gmail.com") return "smtp.gmail.com";
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) {
    return "smtp.office365.com";
  }
  return "";
};

const resolveMailerConfig = (settings = null) => {
  const generalEmail = String(settings?.email || "").trim();
  const smtpUserFromSettings = String(settings?.smtpUser || "").trim();
  const smtpPassFromSettings = String(settings?.smtpPass || "").replace(/\s+/g, "").trim();
  const smtpHostFromSettings = String(settings?.smtpHost || "").trim();
  const mailFromFromSettings = String(settings?.mailFrom || "").trim();

  // Frontend-saved System Settings must win so mail works the same on every machine.
  const user = String(smtpUserFromSettings || generalEmail || process.env.SMJ_SMTP_USER || "").trim();
  const pass = String(smtpPassFromSettings || process.env.SMJ_SMTP_PASS || "").replace(/\s+/g, "").trim();
  const host = String(smtpHostFromSettings || inferSmtpHost(user) || process.env.SMJ_SMTP_HOST || "").trim();
  const rawPort = settings?.smtpPort ?? process.env.SMJ_SMTP_PORT ?? 587;
  const port = Number(rawPort || 587);
  const secureSource =
    settings?.smtpSecure != null ? settings.smtpSecure : process.env.SMJ_SMTP_SECURE;
  const secure = String(secureSource || "false") === "true" || secureSource === true;
  const from = String(mailFromFromSettings || generalEmail || user || process.env.SMJ_MAIL_FROM || "no-reply@smj.local").trim();

  return { host, port, secure, user, pass, from };
};

const getMailer = (settings = null) => {
  const { host, port, secure, user, pass } = resolveMailerConfig(settings);
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const resolveInlineLogoAttachment = (settings = {}) => {
  const logoUrl = String(settings.logoUrl || "").trim();
  if (!logoUrl) return null;
  try {
    const parsed = new URL(logoUrl);
    const fileName = path.basename(parsed.pathname || "");
    if (!fileName) return null;
    const localPath = path.join(__dirname, "../uploads", fileName);
    if (!fs.existsSync(localPath)) return null;
    return {
      filename: fileName,
      path: localPath,
      cid: "smj-logo-inline",
    };
  } catch {
    return null;
  }
};

const buildOtpEmail = (settings = {}, otp, expiresAt, inlineLogoCid = "") => {
  const companyName = String(settings.companyName || settings.shortName || "SMJ Rice Mill").trim();
  const address = String(settings.address || "").trim();
  const supportEmail = String(settings.email || settings.mailFrom || settings.smtpUser || "").trim();
  const logoUrl = String(settings.logoUrl || "").trim();
  const logoSource = inlineLogoCid ? `cid:${inlineLogoCid}` : logoUrl;
  const expiryTime = new Date(expiresAt).toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const safeCompanyName = escapeHtml(companyName);
  const safeAddress = escapeHtml(address).replace(/\r?\n/g, "<br />");
  const safeSupportEmail = escapeHtml(supportEmail);
  const safeOtp = escapeHtml(otp);

  const text = [
    companyName,
    address || null,
    "",
    "OTP Verification",
    `Your verification code is: ${otp}`,
    "This code will expire in 5 minutes.",
    `Valid until: ${expiryTime}`,
    "",
    "If you did not request this code, you can ignore this email.",
    supportEmail ? `Support: ${supportEmail}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeCompanyName} OTP Verification</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f8f4;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="padding:24px 12px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d1e7dd;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(16,24,40,0.08);">
        <div style="background:linear-gradient(135deg,#065f46,#10b981);padding:28px 24px;color:#ffffff;text-align:center;">
          ${
            logoSource
              ? `<img src="${escapeHtml(logoSource)}" alt="${safeCompanyName} logo" style="max-height:72px;max-width:180px;margin:0 auto 14px;display:block;background:#ffffff;padding:8px 12px;border-radius:16px;" />`
              : ""
          }
          <div style="font-size:26px;font-weight:700;letter-spacing:0.4px;">${safeCompanyName}</div>
          <div style="margin-top:8px;font-size:13px;line-height:1.6;opacity:0.92;">
            ${safeAddress || "Secure verification message"}
          </div>
        </div>

        <div style="padding:28px 24px 12px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#059669;">OTP Verification</div>
          <h1 style="margin:10px 0 12px;font-size:24px;line-height:1.3;color:#111827;">Use this code to continue</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#4b5563;">
            We received a request to verify access for your SMJ account. Enter the one-time password below in the app.
          </p>

          <div style="margin:0 auto 22px;max-width:260px;border:1px dashed #10b981;border-radius:18px;background:#ecfdf5;padding:18px 16px;text-align:center;">
            <div style="font-size:13px;color:#047857;text-transform:uppercase;letter-spacing:1px;font-weight:700;">One-Time Password</div>
            <div style="margin-top:10px;font-size:34px;letter-spacing:10px;font-weight:700;color:#064e3b;">${safeOtp}</div>
          </div>

          <div style="border-radius:16px;background:#f9fafb;border:1px solid #e5e7eb;padding:16px 18px;font-size:14px;line-height:1.7;color:#374151;">
            <div><strong>Expiry:</strong> 5 minutes</div>
            <div><strong>Valid until:</strong> ${escapeHtml(expiryTime)}</div>
            <div><strong>Requested for:</strong> ${safeSupportEmail || "Registered system email"}</div>
          </div>

          <p style="margin:22px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
            If you did not request this code, you can safely ignore this email. For help, contact ${
              safeSupportEmail || "your administrator"
            }.
          </p>
        </div>

        <div style="padding:18px 24px 26px;border-top:1px solid #ecfdf5;background:#f8fffb;color:#6b7280;font-size:12px;line-height:1.8;text-align:center;">
          <div style="font-weight:700;color:#065f46;">${safeCompanyName}</div>
          ${safeAddress ? `<div>${safeAddress}</div>` : ""}
          ${safeSupportEmail ? `<div>${safeSupportEmail}</div>` : ""}
        </div>
      </div>
    </div>
  </body>
</html>`;

  return { html, text };
};

const hashOtp = (otp) =>
  crypto.createHash("sha256").update(String(otp)).digest("hex");

exports.sendEmailOtp = async (req, res) => {
  try {
    const settings = await SystemSettings.findOne({});
    if (!settings) {
      return res.status(400).json({ success: false, message: "System settings not found." });
    }
    if (!settings.email) {
      return res.status(400).json({ success: false, message: "Email not set in General Settings." });
    }
    const transport = getMailer(settings);
    if (!transport) {
      return res.status(400).json({
        success: false,
        message:
          "Email provider not configured. Set SMTP in System Settings (Host/User/App Password) or SMJ_SMTP_* env vars.",
      });
    }

    const otp = String(Math.floor(1000 + Math.random() * 9000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const { from } = resolveMailerConfig(settings);
    const logoAttachment = resolveInlineLogoAttachment(settings);
    const emailContent = buildOtpEmail(settings, otp, expiresAt, logoAttachment?.cid || "");
    await transport.sendMail({
      from,
      to: settings.email,
      subject: "SMJ OTP Verification",
      text: emailContent.text,
      html: emailContent.html,
      attachments: logoAttachment ? [logoAttachment] : [],
    });

    settings.otpCodeHash = hashOtp(otp);
    settings.otpExpiresAt = expiresAt;
    await settings.save();

    res.json({ success: true, message: "OTP sent to email", data: { expiresAt } });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.verifyEmailOtp = async (req, res) => {
  try {
    const { otp } = req.body || {};
    if (!otp || String(otp).length !== 4) {
      return res.status(400).json({ success: false, message: "Invalid OTP." });
    }
    const settings = await SystemSettings.findOne({});
    if (!settings || !settings.otpCodeHash || !settings.otpExpiresAt) {
      return res.status(400).json({ success: false, message: "OTP not requested." });
    }
    if (new Date(settings.otpExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: "OTP expired." });
    }
    const isValid = hashOtp(otp) === settings.otpCodeHash;
    if (!isValid) {
      return res.status(400).json({ success: false, message: "OTP is incorrect." });
    }
    res.json({ success: true, message: "OTP verified" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.resetPinWithOtp = async (req, res) => {
  try {
    const otp = String(req.body?.otp || "").trim();
    const newPin = String(req.body?.newPin || "").replace(/\D/g, "").slice(0, 4);

    if (otp.length !== 4) {
      return res.status(400).json({ success: false, message: "Invalid OTP." });
    }
    if (newPin.length !== 4) {
      return res.status(400).json({ success: false, message: "Enter a valid 4-digit PIN." });
    }

    const settings = await SystemSettings.findOne({});
    if (!settings || !settings.otpCodeHash || !settings.otpExpiresAt) {
      return res.status(400).json({ success: false, message: "OTP not requested." });
    }
    if (new Date(settings.otpExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: "OTP expired." });
    }
    if (hashOtp(otp) !== settings.otpCodeHash) {
      return res.status(400).json({ success: false, message: "OTP is incorrect." });
    }

    settings.adminPin = newPin;
    settings.loginPassword = newPin;
    settings.otpCodeHash = "";
    settings.otpExpiresAt = null;
    await settings.save();

    res.json({ success: true, message: "PIN reset successfully." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
