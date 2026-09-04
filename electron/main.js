// electron/main.js
const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const http = require("http");
const { autoUpdater } = require("electron-updater");

const appVersion = require("../package.json").version;

// Don't run autoUpdater when running from source / dev mode
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// ─── FULL DIAGNOSTIC LOGGING ────────────────────────────────────────
const logFile = path.join(app.getPath("userData"), "smj-debug.log");
function fullLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(logFile, line + "\n"); } catch (_e) {}
}
fullLog("=== SMJ Rice Mill App Starting ===");
fullLog(`Electron: ${process.versions.electron}, Node: ${process.versions.node}`);
fullLog(`__dirname: ${__dirname}`);
fullLog(`is asar: ${__dirname.includes("app.asar")}`);

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

// Windows service names that have been used by MongoDB installers.
const MONGO_SERVICE_NAMES = [
  "MongoDB",
  "MongoDB Server",
  "MongoDB Community Server",
  "mongodb",
];

function runCmd(cmd) {
  try {
    return execSync(cmd, { stdio: "ignore", timeout: 12000 }).toString().trim();
  } catch (_err) {
    return "";
  }
}

// Find the name of the installed MongoDB service (if any).
function findMongoServiceName() {
  for (const name of MONGO_SERVICE_NAMES) {
    const out = runCmd(`sc query "${name}"`);
    if (out && /SERVICE_NAME/.test(out)) return name;
  }
  return null;
}

async function ensureMongoDB() {
  fullLog("[MongoDB] Checking if MongoDB is running...");
  const running = await isMongoDBRunning();
  fullLog(`[MongoDB] Running: ${running}`);
  if (running) return { ok: true, serviceName: null };

  // MongoDB is not reachable. Look for its Windows service and try to start it.
  const serviceName = findMongoServiceName();
  fullLog(`[MongoDB] Installed service found: ${serviceName || "none"}`);

  if (serviceName) {
    fullLog(`[MongoDB] Attempting to start service "${serviceName}"...`);
    // net start first (works when the app has admin rights).
    runCmd(`net start "${serviceName}"`);
    await new Promise((r) => setTimeout(r, 3000));
    if (await isMongoDBRunning()) {
      fullLog("[MongoDB] Service started via net start, MongoDB is up.");
      return { ok: true, serviceName };
    }
    // Fallback: try PowerShell Start-Service (handles localized systems better).
    fullLog("[MongoDB] Trying Start-Service fallback...");
    try {
      execSync(
        `powershell -NoProfile -Command "Start-Service -Name '${serviceName}'"`,
        { stdio: "ignore", timeout: 15000 }
      );
    } catch (_e) {}
    await new Promise((r) => setTimeout(r, 3000));
    if (await isMongoDBRunning()) {
      fullLog("[MongoDB] Service started via Start-Service, MongoDB is up.");
      return { ok: true, serviceName };
    }
    return {
      ok: false,
      serviceName,
      installed: true,
      reason: "MongoDB is installed but its service could not be started (usually needs Administrator rights).",
    };
  }

  return {
    ok: false,
    serviceName: null,
    installed: false,
    reason: "MongoDB is not running and no MongoDB service was found.",
  };
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
  const appRoot = __dirname.includes("app.asar")
    ? __dirname.replace("app.asar", "app.asar.unpacked")
    : __dirname;

  fullLog(`[Window] appRoot: ${appRoot}`);
  const frontendDist = path.join(appRoot, "../frontend/dist");
  fullLog(`[Window] frontendDist: ${frontendDist}`);
  fullLog(`[Window] frontendDist exists: ${fs.existsSync(frontendDist)}`);
  if (fs.existsSync(frontendDist)) {
    fullLog(`[Window] frontendDist contents: ${fs.readdirSync(frontendDist).join(", ")}`);
  }
  const indexPath = path.join(frontendDist, "index.html");
  fullLog(`[Window] index.html exists: ${fs.existsSync(indexPath)}`);

  const iconDist = path.join(appRoot, "../frontend/dist/logo-256.png");
  const iconPublic = path.join(__dirname, "../frontend/public/logo-256.png");
  const appIcon = fs.existsSync(iconDist) ? iconDist : iconPublic;
  fullLog(`[Window] icon: ${appIcon} (exists: ${fs.existsSync(appIcon)})`);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: "SMJ Rice Mill",
    icon: appIcon,
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
  const loadUrl = `http://localhost:${port}`;
  fullLog(`[Window] Loading URL: ${loadUrl}`);
  mainWindow.loadURL(loadUrl);

  // Log any load errors
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    fullLog(`[Window] LOAD FAILED: code=${errorCode}, desc=${errorDescription}`);
  });

  // Capture all network requests the renderer actually makes
  try {
    mainWindow.webContents.session.webRequest.onCompleted(
      { urls: ["*://localhost:*/*", "*://127.0.0.1:*/*"] },
      (details) => {
        const h = details.responseHeaders || {};
        const ct = h["Content-Type"]?.[0] || h["content-type"]?.[0] || "?";
        fullLog(`[Net] ${details.statusCode} ${details.method} ${details.url} -> ${ct}`);
      }
    );
  } catch (err) {
    fullLog(`[Net] Failed to attach webRequest logger: ${err.message}`);
  }

  // Log renderer console messages
  mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
    fullLog(`[Renderer] [${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    fullLog("[Window] Page finished loading");

    // Install error capture + report page state now and again after a delay
    const diag = `
      (function () {
        if (!window.__smjDiag) {
          window.__smjDiag = { errors: [], unhandled: [] };
          window.addEventListener('error', function (e) {
            window.__smjDiag.errors.push(String(e.message || e.error || e));
          });
          window.addEventListener('unhandledrejection', function (e) {
            window.__smjDiag.unhandled.push(String(e.reason && e.reason.message ? e.reason.message : e.reason));
          });
        }
        return JSON.stringify({
          title: document.title,
          bodyChildren: document.body ? document.body.children.length : -1,
          hasRoot: !!document.getElementById('root'),
          rootChildren: document.getElementById('root') ? document.getElementById('root').children.length : -1,
          htmlLength: document.documentElement.outerHTML.length,
          url: window.location.href,
          errors: window.__smjDiag.errors,
          unhandled: window.__smjDiag.unhandled
        });
      })()
    `;
    const runDiag = () =>
      mainWindow.webContents
        .executeJavaScript(diag)
        .then((result) => fullLog(`[Window] Page diagnostic: ${result}`))
        .catch((err) => fullLog(`[Window] Page diagnostic failed: ${err.message}`));

    runDiag();
    setTimeout(runDiag, 8000);
  });

  mainWindow.once("ready-to-show", () => {
    fullLog("[Window] ready-to-show event fired");
    mainWindow.show();
  });

  mainWindow.on("show", () => {
    fullLog("[Window] Window shown");
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
ipcMain.handle("pick-backup-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose backup folder",
    buttonLabel: "Select This Folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths?.length) return null;
  return result.filePaths[0];
});

// ─── App Updater (GitHub Releases) ───────────────────────────────────
function sendUpdateStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", status);
  }
}

autoUpdater.on("checking-for-update", () => {
  fullLog("[Updater] Checking for update...");
  sendUpdateStatus({ type: "checking" });
});
autoUpdater.on("update-available", (info) => {
  fullLog(`[Updater] Update available: v${info.version}`);
  sendUpdateStatus({ type: "available", version: info.version });
});
autoUpdater.on("update-not-available", (info) => {
  fullLog("[Updater] No update available (already latest).");
  sendUpdateStatus({ type: "not-available", version: info.version });
});
autoUpdater.on("download-progress", (progress) => {
  sendUpdateStatus({
    type: "downloading",
    percent: Math.round(progress.percent),
    transferred: progress.transferred,
    total: progress.total,
  });
});
autoUpdater.on("update-downloaded", (info) => {
  fullLog(`[Updater] Update downloaded: v${info.version}`);
  sendUpdateStatus({ type: "downloaded", version: info.version });
});
autoUpdater.on("error", (err) => {
  const msg = (err && err.message ? err.message : String(err)) || "";
  fullLog(`[Updater] Error: ${msg}`);
  // 404 generally means no release published yet -> tell user app is up to date
  if (/404/.test(msg) || /not found/i.test(msg)) {
    sendUpdateStatus({ type: "not-available", version: appVersion, reason: "no-release" });
  } else {
    sendUpdateStatus({ type: "error", message: msg });
  }
});

ipcMain.handle("check-for-updates", async () => {
  try {
    // Only works in a packaged app, harmless in dev
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
ipcMain.handle("download-update", async () => {
  try {
    autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
ipcMain.handle("quit-and-install", () => {
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
});

// ─── App Lifecycle ───────────────────────────────────────────────────
app.whenReady().then(async () => {
  fullLog("[Lifecycle] app.whenReady triggered");

  // Check .env file
  const envPath = path.join(__dirname, "../.env");
  const envPathUnpacked = __dirname.includes("app.asar")
    ? __dirname.replace("app.asar", "app.asar.unpacked") + "/../.env"
    : envPath;
  fullLog(`[Env] envPath: ${envPath} (exists: ${fs.existsSync(envPath)})`);
  fullLog(`[Env] envPathUnpacked: ${envPathUnpacked} (exists: ${fs.existsSync(envPathUnpacked)})`);

  const mongo = await ensureMongoDB();
  fullLog(`[Lifecycle] MongoDB OK: ${mongo.ok}`);
  if (!mongo.ok) {
    const detail = mongo.installed
      ? `MongoDB is installed, but its service (${mongo.serviceName}) is not running.\n\nFix it: open Services (Win+R → services.msc), find "${mongo.serviceName}", right-click → Start.\n\nTip: if starting fails with "Access is denied", close this app and run it as Administrator.`
      : "MongoDB is not running on this PC.\n\nIf MongoDB is already installed:\n  • Open Services (Win+R → services.msc) and start the \"MongoDB\" service.\n  • Or run this app as Administrator so it can start the service for you.\n\nIf it is not installed, install MongoDB Community Server from:\nhttps://www.mongodb.com/try/download/community\n\nThen relaunch this app.";
    dialog.showErrorBox("MongoDB Required", detail);
    app.quit();
    return;
  }

  // 2. Start Express server
  fullLog("[Lifecycle] Loading Express server...");
  try {
    require("../backend/server.js");
    fullLog("[Lifecycle] Express server module loaded successfully");
  } catch (err) {
    fullLog(`[Lifecycle] SERVER LOAD ERROR: ${err.message}\n${err.stack}`);
    dialog.showErrorBox("Server Error", `Failed to load server:\n${err.message}`);
    app.quit();
    return;
  }

  // 3. Wait for server to be ready
  fullLog("[Lifecycle] Waiting for server health check...");
  try {
    const port = process.env.PORT || 5000;
    await waitForServer(port);
    fullLog(`[Lifecycle] Server is healthy on port ${port}`);
  } catch (err) {
    fullLog(`[Lifecycle] SERVER HEALTH CHECK FAILED: ${err.message}`);
    dialog.showErrorBox("Server Error", "The backend server failed to start.");
    app.quit();
    return;
  }

  // 4. Create window
  fullLog("[Lifecycle] Creating window...");
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
