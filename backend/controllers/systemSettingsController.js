// backend/controllers/systemSettingsController.js
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const SystemSettings = require("../models/systemSettingsModel");
const Company = require("../models/companyModel");
const ProductType = require("../models/productTypeModel");
const ExpenseCategory = require("../models/expenseCategoryModel");
const ProductionBatch = require("../models/productionBatchModel");
const GatePass = require("../models/gatePassModel");
const StockLedger = require("../models/stockLedgerModel");
const Transaction = require("../models/transactionModel");
const ExpenseEntry = require("../models/expenseEntryModel");
const AIChat = require("../models/AIChat");
const SystemAction = require("../models/systemActionModel");
const Account = require("../models/accountModel");
const JournalEntry = require("../models/journalEntryModel");
const JournalLine = require("../models/journalLineModel");

const COLLECTIONS = [
  { key: "companies", model: Company },
  { key: "productTypes", model: ProductType },
  { key: "expenseCategories", model: ExpenseCategory },
  // Accounting
  { key: "accounts", model: Account },
  { key: "journalEntries", model: JournalEntry },
  { key: "journalLines", model: JournalLine },
  { key: "transactions", model: Transaction },
  { key: "gatePasses", model: GatePass },
  { key: "productionBatches", model: ProductionBatch },
  { key: "stockLedgers", model: StockLedger },
  { key: "expenseEntries", model: ExpenseEntry },
  { key: "aiChats", model: AIChat },
  { key: "systemActions", model: SystemAction },
];

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
      payload.additionalStockSettingsEnabled !== undefined ||
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

    const savedPath = req.file.path;
    const host = req.get("host");
    const protocol = req.protocol;
    const publicUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    const updated = await SystemSettings.findOneAndUpdate(
      {},
      { $set: { logoUrl: publicUrl } },
      { new: true, upsert: true }
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
    const payload = {
      backupVersion: 2,
      exportedAt: new Date(),
      // Keep singleton behavior (oldest settings doc) if duplicates exist.
      settings:
        (await SystemSettings.find({})
          .sort({ createdAt: 1 })
          .limit(1)
          .lean()
          .then((rows) => rows[0] || null)) || null,
    };

    for (const c of COLLECTIONS) {
      try {
        payload[c.key] = await c.model.find({}).lean();
      } catch (_) {
        payload[c.key] = [];
      }
    }

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=smj-backup.json"
    );
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Restore backup from JSON file
 */
exports.restoreBackup = async (req, res) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });

    const filePath = req.file.path;
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);

    // 1) Settings
    if (data.settings) {
      await SystemSettings.deleteMany({});
      await SystemSettings.create(data.settings);
    }

    // 2) Clear data in reverse dependency order
    for (const c of [...COLLECTIONS].reverse()) {
      try {
        await c.model.deleteMany({});
      } catch (e) {
        console.error(`restore clear ${c.key} error:`, e);
      }
    }

    // 3) Restore data in dependency-safe order
    for (const c of COLLECTIONS) {
      const rows = Array.isArray(data[c.key]) ? data[c.key] : [];
      if (!rows.length) continue;
      try {
        await c.model.insertMany(rows, { ordered: false });
      } catch (e) {
        console.error(`restore insert ${c.key} error:`, e);
      }
    }

    fs.unlinkSync(filePath);

    res.json({ success: true, message: "Backup restored successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getMailer = () => {
  const host = process.env.SMJ_SMTP_HOST;
  const port = Number(process.env.SMJ_SMTP_PORT || 587);
  const user = process.env.SMJ_SMTP_USER;
  const pass = process.env.SMJ_SMTP_PASS;
  const secure = String(process.env.SMJ_SMTP_SECURE || "false") === "true";
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
};

const hashOtp = (otp) =>
  crypto.createHash("sha256").update(String(otp)).digest("hex");

exports.sendEmailOtp = async (req, res) => {
  try {
    const settings = await SystemSettings.findOne({});
    if (!settings || !settings.email) {
      return res.status(400).json({ success: false, message: "Email not set in General Settings." });
    }
    const transport = getMailer();
    if (!transport) {
      return res.status(400).json({
        success: false,
        message: "Email provider not configured. Set SMTP env vars.",
      });
    }

    const otp = String(Math.floor(1000 + Math.random() * 9000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    settings.otpCodeHash = hashOtp(otp);
    settings.otpExpiresAt = expiresAt;
    await settings.save();

    const from = process.env.SMJ_MAIL_FROM || "no-reply@smj.local";
    await transport.sendMail({
      from,
      to: settings.email,
      subject: "SMJ OTP Verification",
      text: `Your OTP is ${otp}. It expires in 5 minutes.`,
    });

    res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    settings.otpCodeHash = "";
    settings.otpExpiresAt = null;
    await settings.save();
    res.json({ success: true, message: "OTP verified" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.renameBrandEverywhere = async (req, res) => {
  try {
    const oldName = String(req.body?.oldName || "").trim();
    const newName = String(req.body?.newName || "").trim();
    const adminPin = String(req.body?.adminPin || "").trim();
    if (!oldName || !newName) {
      return res.status(400).json({
        success: false,
        message: "oldName and newName are required.",
      });
    }
    if (oldName.toLowerCase() === newName.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "Old and new company names are same.",
      });
    }

    const settings = await SystemSettings.findOne({});
    const expectedPin = String(settings?.adminPin || "0000").trim();
    if (!adminPin || adminPin !== expectedPin) {
      return res.status(403).json({
        success: false,
        message: "Invalid admin PIN.",
      });
    }

    // Update brand options list
    const currentOptions = Array.isArray(settings?.brandOptions)
      ? settings.brandOptions
      : [];
    const duplicate = currentOptions.some(
      (b) => String(b || "").trim().toLowerCase() === newName.toLowerCase()
    );
    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "New company name already exists in dropdown list.",
      });
    }
    if (settings) {
      settings.brandOptions = Array.from(
        new Set(
          currentOptions.map((b) =>
            String(b || "").trim().toLowerCase() === oldName.toLowerCase()
              ? newName
              : b
          )
        )
      ).filter(Boolean);
      await settings.save();
    }

    // Core references
    await ProductType.updateMany(
      { brand: new RegExp(`^${oldName}$`, "i") },
      { $set: { brand: newName } }
    );
    await GatePass.updateMany(
      { supplier: new RegExp(`^${oldName}$`, "i") },
      { $set: { supplier: newName } }
    );
    await StockLedger.updateMany(
      { companyName: new RegExp(`^${oldName}$`, "i") },
      { $set: { companyName: newName } }
    );
    await ProductionBatch.updateMany(
      { sourceCompanyName: new RegExp(`^${oldName}$`, "i") },
      { $set: { sourceCompanyName: newName } }
    );
    await ProductionBatch.updateMany(
      { "outputs.companyName": new RegExp(`^${oldName}$`, "i") },
      { $set: { "outputs.$[elem].companyName": newName } },
      { arrayFilters: [{ "elem.companyName": new RegExp(`^${oldName}$`, "i") }] }
    );
    await Transaction.updateMany(
      { companyName: new RegExp(`^${oldName}$`, "i") },
      { $set: { companyName: newName } }
    );
    await JournalLine.updateMany(
      { partyName: new RegExp(`^${oldName}$`, "i") },
      { $set: { partyName: newName } }
    );

    return res.json({
      success: true,
      message: "Company Name renamed across system.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
