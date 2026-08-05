// backend/services/backupService.js
// Full-backup engine with live progress, pause/resume/cancel, and dual storage
// (local disk + optional Google Drive). The controller supplies the payload
// collector so this module stays decoupled from the collection definitions.
const path = require("path");
const fs = require("fs");

const DEFAULT_BACKUP_FOLDER = path.join(__dirname, "../backups");

const progressState = {
  running: false,
  paused: false,
  cancelRequested: false,
  phase: "idle", // idle | backup | restore | done | error
  scope: "",
  trigger: "",
  percent: 0,
  label: "Backup system is idle.",
  startedAt: null,
  finishedAt: null,
  result: null, // { success, message, fileName, recordCount, storage, gdrive }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const setProgress = (patch) => {
  Object.assign(progressState, patch);
};

const getProgress = () => ({
  running: progressState.running,
  paused: progressState.paused,
  phase: progressState.phase,
  scope: progressState.scope,
  trigger: progressState.trigger,
  percent: Math.round(Number(progressState.percent || 0)),
  label: progressState.label,
  startedAt: progressState.startedAt,
  finishedAt: progressState.finishedAt,
  result: progressState.result,
});

const resetProgress = () => {
  progressState.running = false;
  progressState.paused = false;
  progressState.cancelRequested = false;
  progressState.phase = "idle";
  progressState.scope = "";
  progressState.trigger = "";
  progressState.percent = 0;
  progressState.label = "Backup system is idle.";
  progressState.startedAt = null;
  progressState.finishedAt = null;
};

const waitWhilePaused = async () => {
  while (progressState.paused) {
    if (progressState.cancelRequested) throw new Error("Backup cancelled.");
    await sleep(400);
  }
  if (progressState.cancelRequested) throw new Error("Backup cancelled.");
};

const resolveLocalFolder = (settings) => {
  const custom = String(settings?.backupLocalFolderPath || "").trim();
  const folder = custom ? path.resolve(custom) : DEFAULT_BACKUP_FOLDER;
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  return folder;
};

const writeFileWithProgress = ({ folder, fileName, jsonBuffer }) => {
  const targetPath = path.join(folder, fileName);
  try {
    fs.writeFileSync(targetPath, jsonBuffer, "utf8");
  } catch (err) {
    if (err && err.code === "ENOSPC") {
      throw new Error(
        "Not enough free disk space to store the backup file. Free up space or choose a different local folder."
      );
    }
    throw err;
  }
  return targetPath;
};

/**
 * Run a full system backup. `buildPayload` is an async function
 * (payload) => Promise<payload> supplied by the controller; it may accept an
 * `onProgress` callback to report data-collection progress.
 *
 * Returns a result object. The controller is responsible for persisting
 * history/settings entries.
 */
exports.runFullBackup = async ({ trigger = "MANUAL", settings, buildPayload, countRecords = null, gdriveService }) => {
  if (progressState.running) {
    throw new Error("A backup is already running.");
  }
  resetProgress();
  progressState.running = true;
  progressState.phase = "backup";
  progressState.trigger = trigger;
  progressState.scope = "full";
  progressState.startedAt = new Date();

  try {
    setProgress({ percent: 2, label: "Preparing full system backup..." });
    await waitWhilePaused();

    const payload = await buildPayload({
      onProgress: ({ percent, label }) => {
        setProgress({ percent, label: label || `Collecting data... ${Math.round(percent)}%` });
      },
    });
    const recordCount = countRecords ? countRecords(payload) : 0;

    await waitWhilePaused();
    setProgress({ percent: 70, label: "Writing backup file to disk..." });

    const storageMode = String(settings?.backupStorageMode || "auto").trim() || "auto";
    const localFolder = resolveLocalFolder(settings);
    const nowParts = getTimeParts(settings?.timezone || "Asia/Karachi");
    const fileName = `smj-backup-all-${nowParts.dateKey.replace(/-/g, "")}-${nowParts.timeKey.replace(":", "")}.json`;
    const jsonBuffer = JSON.stringify(payload, null, 2);
    const localPath = writeFileWithProgress({ folder: localFolder, fileName, jsonBuffer });

    let storage = "local";
    let message = "Backup saved locally.";
    let gdrive = null;

    if (storageMode === "gdrive" || storageMode === "auto") {
      const connected =
        gdriveService &&
        settings?.gdriveRefreshToken &&
        (String(settings.gdriveClientId || process.env.GDRIVE_CLIENT_ID || "").trim() ||
          String(process.env.GDRIVE_CLIENT_ID || "").trim());

      if (connected) {
        setProgress({ percent: 82, label: "Uploading backup to Google Drive..." });
        try {
          gdrive = await gdriveService.uploadBackupFile({
            fileName,
            jsonBuffer,
            settings,
          });
          storage = "gdrive";
          message = "Backup saved to Google Drive.";
        } catch (err) {
          if (storageMode === "gdrive") {
            throw new Error(`Google Drive upload failed: ${err.message}`);
          }
          storage = "local";
          message = `Drive upload skipped (${err.message}). Backup saved locally.`;
        }
      } else if (storageMode === "gdrive") {
        throw new Error("Google Drive backup is selected but Drive is not connected.");
      } else {
        storage = "local";
        message = "Google Drive not connected. Backup saved locally.";
      }
    }

    await waitWhilePaused();
    setProgress({
      percent: 100,
      label: "Backup completed.",
      phase: "done",
      result: { success: true, message, fileName, recordCount, storage, gdrive, localPath },
    });
    progressState.finishedAt = new Date();

    return { success: true, message, fileName, recordCount, storage, gdrive, localPath };
  } catch (err) {
    setProgress({
      percent: 0,
      label: err.message || "Backup failed.",
      phase: "error",
      result: { success: false, message: err.message || "Backup failed." },
    });
    progressState.finishedAt = new Date();
    throw err;
  } finally {
    progressState.running = false;
    progressState.paused = false;
    progressState.cancelRequested = false;
  }
};

exports.pauseBackup = () => {
  if (!progressState.running) {
    throw new Error("No backup is currently running.");
  }
  progressState.paused = true;
  setProgress({ label: "Backup paused." });
  return { paused: true };
};

exports.resumeBackup = () => {
  if (!progressState.running) {
    throw new Error("No backup is currently running.");
  }
  progressState.paused = false;
  setProgress({ label: "Resuming backup..." });
  return { paused: false };
};

exports.cancelBackup = () => {
  if (!progressState.running) {
    throw new Error("No backup is currently running.");
  }
  progressState.cancelRequested = true;
  setProgress({ label: "Cancelling backup..." });
  return { cancelled: true };
};

// ─── Restore progress (shared state so the dashboard pill works for restores) ───
exports.beginRestore = ({ percent = 3, label = "Starting restore..." } = {}) => {
  progressState.running = true;
  progressState.paused = false;
  progressState.cancelRequested = false;
  progressState.phase = "restore";
  progressState.scope = "full";
  progressState.trigger = "MANUAL";
  progressState.startedAt = new Date();
  progressState.percent = percent;
  progressState.label = label;
  progressState.result = null;
};

exports.updateRestoreProgress = ({ percent, label }) => {
  progressState.percent = Math.round(Number(percent || 0));
  if (label) progressState.label = label;
};

exports.endRestore = ({ success, message }) => {
  progressState.running = false;
  progressState.phase = success ? "done" : "error";
  progressState.percent = success ? 100 : 0;
  progressState.finishedAt = new Date();
  progressState.result = { success, message };
  progressState.label = message || (success ? "Restore completed." : "Restore failed.");
};

exports.getProgress = getProgress;
exports.resetProgress = resetProgress;
exports.setProgress = setProgress;

const getTimeParts = (timezone) => {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
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
  const map = Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  return { dateKey: `${map.year}-${map.month}-${map.day}`, timeKey: `${map.hour}:${map.minute}` };
};
