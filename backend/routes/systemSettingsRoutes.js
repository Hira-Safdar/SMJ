const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const {
  getSettings,
  saveSettings,
  uploadLogo,
  exportBackup,
  restoreBackup,
  getBackupModules,
  clearBackupHistory,
  downloadBackupHistoryFile,
  exportModuleBackup,
  restoreModuleBackup,
  runFullBackup,
  getBackupStatus,
  pauseBackup,
  resumeBackup,
  cancelBackup,
  getGdriveAuthUrl,
  gdriveCallback,
  connectGdriveWithCode,
  disconnectGdrive,
  getGdriveStatus,
  listGdriveFiles,
  deleteGdriveFile,
  restoreFromGdrive,
  sendEmailOtp,
  verifyEmailOtp,
  resetPinWithOtp,
} = require("../controllers/systemSettingsController");

const uploadsDir = path.join(__dirname, "../uploads");
if (!require("fs").existsSync(uploadsDir)) {
  require("fs").mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage config for logo uploads
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `logo-${Date.now()}${ext}`;
    cb(null, name);
  },
});

// Multer storage config for restore files
const restoreStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".json";
    const name = `backup-restore-${Date.now()}${ext}`;
    cb(null, name);
  },
});

const uploadLogoFile = multer({ storage: logoStorage });
const uploadRestoreFile = multer({ storage: restoreStorage });

// Routes
router.get("/", getSettings); // GET settings
router.put("/", saveSettings); // SAVE (upsert)
router.post("/logo", uploadLogoFile.single("logo"), uploadLogo); // upload logo

// Backup control center (full backup only)
router.get("/backup/modules", getBackupModules);
router.delete("/backup/history", clearBackupHistory);
router.get("/backup/history/download/:fileName", downloadBackupHistoryFile);
router.post("/backup/run", runFullBackup);
router.get("/backup/status", getBackupStatus);
router.post("/backup/pause", pauseBackup);
router.post("/backup/resume", resumeBackup);
router.post("/backup/cancel", cancelBackup);

// Google Drive backup
router.get("/backup/gdrive/auth-url", getGdriveAuthUrl);
router.get("/backup/gdrive/callback", gdriveCallback);
router.post("/backup/gdrive/connect", connectGdriveWithCode);
router.post("/backup/gdrive/disconnect", disconnectGdrive);
router.get("/backup/gdrive/status", getGdriveStatus);
router.get("/backup/gdrive/files", listGdriveFiles);
router.post("/backup/gdrive/delete", deleteGdriveFile);
router.post("/backup/gdrive/restore", restoreFromGdrive);

// Download/export endpoints (kept for compatibility)
router.get("/backup", exportBackup); // download backup JSON
router.get("/backup/:moduleKey", exportModuleBackup);
router.post("/restore", uploadRestoreFile.single("backup"), restoreBackup); // restore from JSON file
router.post("/restore/:moduleKey", uploadRestoreFile.single("backup"), restoreModuleBackup);
router.post("/otp/send", sendEmailOtp);
router.post("/otp/verify", verifyEmailOtp);
router.post("/otp/reset-pin", resetPinWithOtp);

module.exports = router;
