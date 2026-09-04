// electron/preload.js
// Secure IPC bridge — exposes safe APIs to renderer without Node.js access
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // App info
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getAppPath: () => ipcRenderer.invoke("get-app-path"),
  isDesktop: true,

  // Backup controls
  triggerBackup: () => ipcRenderer.invoke("trigger-backup"),
  openBackupFolder: () => ipcRenderer.invoke("open-backup-folder"),
  pickBackupFolder: () => ipcRenderer.invoke("pick-backup-folder"),

  // System
  getSystemInfo: () => ipcRenderer.invoke("get-system-info"),

  // ─── App Update Support ────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),
  getPendingUpdateNotes: () => ipcRenderer.invoke("get-pending-update-notes"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("update-status", listener);
    return () => ipcRenderer.removeListener("update-status", listener);
  },
});
