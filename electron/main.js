// electron/main.js
const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const http = require("http");

const appVersion = require("../package.json").version;

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

async function ensureMongoDB() {
  fullLog("[MongoDB] Checking if MongoDB is running...");
  const running = await isMongoDBRunning();
  fullLog(`[MongoDB] Running: ${running}`);
  if (running) return true;

  fullLog("[MongoDB] Attempting to start MongoDB service...");
  try {
    execSync("net start MongoDB", { stdio: "ignore", timeout: 10000 });
    await new Promise((r) => setTimeout(r, 3000));
    const ok = await isMongoDBRunning();
    fullLog(`[MongoDB] After service start, running: ${ok}`);
    if (ok) return true;
  } catch (err) {
    fullLog(`[MongoDB] Service start failed: ${err.message}`);
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

  const mongoOk = await ensureMongoDB();
  fullLog(`[Lifecycle] MongoDB OK: ${mongoOk}`);
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
