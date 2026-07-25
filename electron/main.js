// electron/main.js
const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const http = require("http");

const appVersion = require("../package.json").version;

let mainWindow = null;
let serverReady = false;

// ─── MongoDB Check ───────────────────────────────────────────────────
function isMongoDBRunning() {
  try {
    const sock = require("net").connect(27017, "127.0.0.1");
    return new Promise((resolve) => {
      sock.once("connect", () => {
        sock.end();
        resolve(true);
      });
      sock.once("error", () => resolve(false));
      sock.setTimeout(3000, () => {
        sock.destroy();
        resolve(false);
      });
    });
  } catch {
    return Promise.resolve(false);
  }
}

async function ensureMongoDB() {
  const running = await isMongoDBRunning();
  if (running) return true;

  // Try starting MongoDB Windows service
  try {
    execSync("net start MongoDB", { stdio: "ignore", timeout: 10000 });
    // Wait for MongoDB to be ready
    await new Promise((r) => setTimeout(r, 3000));
    const ok = await isMongoDBRunning();
    if (ok) return true;
  } catch {
    // net start failed or not available
  }

  return false;
}

// ─── Server Health Check ─────────────────────────────────────────────
function waitForServer(port, maxWaitMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (Date.now() - start > maxWaitMs) {
        return reject(new Error("Server did not start in time"));
      }
      const req = http.get(`http://localhost:${port}/api/status`, (res) => {
        if (res.statusCode === 200) return resolve(true);
        setTimeout(check, 500);
      });
      req.on("error", () => setTimeout(check, 500));
      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(check, 500);
      });
    };
    check();
  });
}

// ─── Create Window ───────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: "SMJ Rice Mill",
    icon: path.join(__dirname, "../frontend/public/logo-1769953313128-favicon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Load the app from the Express server (same origin = no CORS issues)
  const port = process.env.PORT || 5000;
  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // In dev mode, open DevTools
  if (process.env.NODE_ENV === "electron-dev") {
    mainWindow.webContents.openDevTools();
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────
ipcMain.handle("get-app-version", () => appVersion);
ipcMain.handle("get-app-path", () => app.getPath("userData"));
ipcMain.handle("get-system-info", () => ({
  platform: process.platform,
  arch: process.arch,
  nodeVersion: process.versions.node,
  electronVersion: process.versions.electron,
  appVersion,
}));
ipcMain.handle("open-backup-folder", () => {
  const backupDir = path.join(__dirname, "../backend/backups");
  if (fs.existsSync(backupDir)) {
    shell.openPath(backupDir);
  }
});

// ─── App Lifecycle ───────────────────────────────────────────────────
app.whenReady().then(async () => {
  // 1. Check MongoDB
  const mongoOk = await ensureMongoDB();
  if (!mongoOk) {
    dialog.showErrorBox(
      "MongoDB Required",
      "MongoDB is not running. Please install MongoDB Community Server from:\n\n" +
        "https://www.mongodb.com/try/download/community\n\n" +
        "After installing, restart this application."
    );
    app.quit();
    return;
  }

  // 2. Start Express server
  console.log("[Electron] Starting backend server...");
  require("../backend/server.js");

  // 3. Wait for server to be ready
  try {
    const port = process.env.PORT || 5000;
    await waitForServer(port);
    console.log("[Electron] Backend server is ready");
  } catch (err) {
    dialog.showErrorBox("Server Error", "The backend server failed to start. Please check logs.");
    app.quit();
    return;
  }

  // 4. Create window
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Graceful shutdown
  app.quit();
});

app.on("before-quit", () => {
  // Let Express server shut down naturally
  process.exit(0);
});
