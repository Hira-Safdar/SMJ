// backend/models/systemSettingsModel.js
const mongoose = require("mongoose");

const backupHistoryEntrySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["BACKUP", "RESTORE"],
      required: true,
    },
    trigger: {
      type: String,
      enum: ["MANUAL", "AUTO"],
      default: "MANUAL",
    },
    scope: {
      type: String,
      enum: ["full", "module"],
      default: "module",
    },
    moduleKey: { type: String, default: "" },
    moduleName: { type: String, default: "" },
    fileName: { type: String, default: "" },
    recordCount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED"],
      default: "SUCCESS",
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const systemSettingsSchema = new mongoose.Schema(
  {
    // General
    companyName: { type: String, default: "" },
    shortName: { type: String, default: "" },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    smtpHost: { type: String, default: "" },
    smtpPort: { type: Number, default: 587, min: 1 },
    smtpUser: { type: String, default: "" },
    smtpPass: { type: String, default: "" },
    smtpSecure: { type: Boolean, default: false },
    mailFrom: { type: String, default: "" },
    ntn: { type: String, default: "" },
    strn: { type: String, default: "" },
    defaultCurrency: { type: String, default: "PKR" },
    fiscalYearStart: { type: Date, default: null },
    dateFormat: { type: String, default: "DD/MM/YYYY" },
    timezone: { type: String, default: "Asia/Karachi" },
    logoUrl: { type: String, default: "" },
    // Stock management / saleable unit (e.g. bag weight in kg)
    defaultBagWeightKg: { type: Number, default: 65, min: 1 },
    // Admin PIN for special actions (e.g. edit completed batch). Default 0000
    adminPin: { type: String, default: "0000", trim: true },
    // When true, shows "Remove previous stock" and "Set paddy zero" options. Secured with admin PIN.
    additionalStockSettingsEnabled: { type: Boolean, default: false },
    // Email OTP for PIN reset
    otpCodeHash: { type: String, default: "" },
    otpExpiresAt: { type: Date, default: null },
    // Account login (basic)
    loginUsername: { type: String, default: "" },
    loginPassword: { type: String, default: "" },
    // Stock status thresholds (kg): 0 = out of stock; <= extremeLow = Extreme Low; <= low = Low; > low = Okay.
    stockStatusExtremeLowKg: { type: Number, default: 300, min: 0 },
    stockStatusLowKg: { type: Number, default: 500, min: 0 },
    // Purchase dropdown options
    purchaseItemOptions: { type: [String], default: [] },
    purchaseCategoryOptions: { type: [String], default: [] },
    transporterOptions: { type: [String], default: [] },
    brandOptions: { type: [String], default: [] },
    // Backup center
    backupAutomationEnabled: { type: Boolean, default: false },
    backupScheduleTime: { type: String, default: "02:00" },
    backupLastBackupAt: { type: Date, default: null },
    backupLastRestoreAt: { type: Date, default: null },
    backupScheduleLastRunAt: { type: Date, default: null },
    backupHistory: { type: [backupHistoryEntrySchema], default: [] },
    // Accounting migration marker for idempotent historical journal rebuild
    accountingBackfillVersion: { type: Number, default: 0, min: 0 },
    accountingBackfillAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
