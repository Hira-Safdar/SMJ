// backend/server.js
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { initBackupScheduler } = require("./controllers/systemSettingsController");
const { initAIKnowledgeSync } = require("./services/aiKnowledgeSync");
const { initAIManualSync } = require("./services/aiManualSync");
const SystemSettings = require("./models/systemSettingsModel");
const GatePass = require("./models/gatePassModel");
const StockLedger = require("./models/stockLedgerModel");
const ProductionBatch = require("./models/productionBatchModel");
const Transaction = require("./models/transactionModel");

/**
 * One-time migration: seed SystemSettings.brandOptions with all existing
 * company names from GatePass, StockLedger, ProductionBatch, and Transaction.
 * Runs silently on startup and only adds names not already present.
 */
async function seedBrandOptions() {
  try {
    const settings = await SystemSettings.findOne({});
    if (!settings) return;
    const existing = new Map(
      (settings.brandOptions || []).map((b) => [String(b).trim().toLowerCase(), b])
    );
    const toTitleCase = (v = "") =>
      String(v).trim().replace(/\s+/g, " ")
        .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    const addName = (raw) => {
      const name = toTitleCase(raw);
      const key = name.toLowerCase();
      if (key && !existing.has(key)) existing.set(key, name);
    };
    const [gatePasses, ledgers, batches, transactions] = await Promise.all([
      GatePass.find({}).select("supplier items.brand").lean(),
      StockLedger.find({}).select("companyName").lean(),
      ProductionBatch.find({}).select("sourceCompanyName outputs.companyName").lean(),
      Transaction.find({}).select("companyName").lean(),
    ]);
    gatePasses.forEach((gp) => {
      addName(gp.supplier);
      (gp.items || []).forEach((it) => addName(it?.brand));
    });
    ledgers.forEach((l) => addName(l.companyName));
    batches.forEach((b) => {
      addName(b.sourceCompanyName);
      (b.outputs || []).forEach((o) => addName(o?.companyName));
    });
    transactions.forEach((t) => addName(t.companyName));
    const nextOptions = Array.from(existing.values()).sort();
    if (nextOptions.length > (settings.brandOptions || []).length) {
      settings.brandOptions = nextOptions;
      await settings.save();
      console.log(`[Migration] brandOptions seeded: ${nextOptions.length} companies`);
    }
  } catch (_e) { /* best-effort */ }
}

// ─── Resolve app root (handles asar packed vs unpacked) ─────────
const appRoot = __dirname.includes("app.asar")
  ? __dirname.replace("app.asar", "app.asar.unpacked")
  : __dirname;

// Write logs to both console and file (for packaged Electron debugging)
// Use writable location for log file (asar paths are read-only)
const serverLogFile = __dirname.includes("app.asar")
  ? path.join(require("os").tmpdir(), "smj-server.log")
  : path.join(__dirname, "../smj-server.log");
function serverLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(serverLogFile, line + "\n"); } catch (e) {
    // If file write fails, console.log is the fallback
  }
}
serverLog(`[Server] Log file: ${serverLogFile}`);

serverLog(`[Server] __dirname: ${__dirname}`);
serverLog(`[Server] appRoot: ${appRoot}`);
serverLog(`[Server] is asar: ${__dirname.includes("app.asar")}`);

// Load .env from unpacked or regular path
const envPath = fs.existsSync(path.join(appRoot, "../.env"))
  ? path.join(appRoot, "../.env")
  : path.join(__dirname, "../.env");
serverLog(`[Server] envPath: ${envPath} (exists: ${fs.existsSync(envPath)})`);
dotenv.config({ path: envPath });

const app = express();
const allowedOrigins = new Set(
  (
    process.env.CORS_ORIGINS ||
    "https://smj-91v8.vercel.app,http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

// Middleware
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      if (/^https:\/\/smj-91v8-[a-z0-9-]+-hira-safdars-projects\.vercel\.app$/i.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());

function getHealthPayload() {
  return {
    ok: true,
    service: "SMJ Rice Mill API",
    mongoState: mongoose.connection.readyState,
    timestamp: new Date().toISOString(),
  };
}

// Test route
app.get("/", (req, res, next) => {
  const distIndex = path.join(appRoot, "../frontend/dist/index.html");
  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }
  res.send("✅ SMJ Rice Mill API running successfully...");
});
const dashboardRoutes = require("./routes/dashboardRoutes");
app.get("/api", (req, res) => {
  res.json({
    ...getHealthPayload(),
    message: "Use /api/status for health checks or one of the registered API routes.",
  });
});

app.get("/api/status", (req, res) => {
  res.json(getHealthPayload());
});

app.use("/api/dashboard", dashboardRoutes);
const companyRoutes = require("./routes/companyRoutes");
app.use("/api/companies", companyRoutes);
const customerRoutes = require("./routes/customerRoutes");
app.use("/api/customers", customerRoutes);
const productTypeRoutes = require("./routes/productTypeRoutes");
app.use("/api/product-types", productTypeRoutes);
const expenseCategoryRoutes = require("./routes/expenseCategoryRoutes");
app.use("/api/expense-categories", expenseCategoryRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const settingsRoutes = require("./routes/systemSettingsRoutes");
app.use("/api/settings", settingsRoutes);
const stockRoutes = require("./routes/stockRoutes");
app.use("/api/stock", stockRoutes);
const productionRoutes = require("./routes/productionRoutes");
app.use("/api/production", productionRoutes);
const transactionRoutes = require("./routes/transactionRoutes");
app.use("/api/transactions", transactionRoutes);
const gatePassesRoutes = require("./routes/gatePassesRoutes");
app.use("/api/gatepasses", gatePassesRoutes);
const gatePassGeneratedRoutes = require("./routes/gatePassGeneratedRoutes");
app.use("/api/gatepass-generated", gatePassGeneratedRoutes);
const aiRoutes = require("./routes/aiRoutes");
app.use("/api/ai", aiRoutes);
const adminRoutes = require("./routes/adminRoutes");
app.use("/api/admin", adminRoutes);
const accountingRoutes = require("./routes/accountingRoutes");
app.use("/api/accounting", accountingRoutes);
const reportsRoutes = require("./routes/reportsRoutes");
app.use("/api/reports", reportsRoutes);

// ─── Serve Frontend Build (Desktop / Production) ─────────────────────
const isDesktop = process.env.NODE_ENV === "desktop" || process.env.ELECTRON_RUN_AS_NODE;
const frontendDist = path.join(appRoot, "../frontend/dist");

serverLog(`[Server] isDesktop: ${isDesktop}`);
serverLog(`[Server] frontendDist: ${frontendDist}`);
serverLog(`[Server] frontendDist exists: ${fs.existsSync(frontendDist)}`);
if (fs.existsSync(frontendDist)) {
  serverLog(`[Server] frontendDist contents: ${fs.readdirSync(frontendDist).join(", ")}`);
}

if (fs.existsSync(frontendDist)) {
  // Verify CSS/JS assets are accessible from the resolved path
  const assetsDir = path.join(frontendDist, "assets");
  serverLog(`[Server] assetsDir: ${assetsDir} (exists: ${fs.existsSync(assetsDir)})`);
  if (fs.existsSync(assetsDir)) {
    serverLog(`[Server] assetsDir contents: ${fs.readdirSync(assetsDir).join(", ")}`);
  }

  // Debug middleware: log ALL incoming requests
  app.use((req, res, next) => {
    serverLog(`[Request] ${req.method} ${req.originalUrl}`);
    next();
  });

  // Explicit asset handler (bypasses express.static asar issues)
  app.use("/assets", (req, res) => {
    const relativePath = req.path.slice(1); // remove leading /
    const filePath = path.join(frontendDist, "assets", relativePath);
    serverLog(`[Asset] Serving: ${relativePath} -> ${filePath} (exists: ${fs.existsSync(filePath)})`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Asset not found", path: relativePath });
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      ".css": "text/css",
      ".js": "application/javascript",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".ico": "image/x-icon",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";
    try {
      const content = fs.readFileSync(filePath);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", content.length);
      res.send(content);
    } catch (err) {
      serverLog(`[Asset] ERROR reading file: ${err.message}`);
      res.status(500).json({ error: "Failed to read asset" });
    }
  });

  app.use(express.static(frontendDist, {
    fallthrough: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".css")) res.setHeader("Content-Type", "text/css");
      if (filePath.endsWith(".js")) res.setHeader("Content-Type", "application/javascript");
    }
  }));

  // SPA catch-all: non-API routes get index.html
  app.use((req, res) => {
    if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/uploads")) {
      return res.status(404).json({ ok: false, error: "Route not found", path: req.originalUrl, method: req.method });
    }
    serverLog(`[SPA] Catch-all serving index.html for: ${req.originalUrl}`);
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else if (!isDesktop) {
  // Dev mode — no build yet
  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: "Route not found",
      path: req.originalUrl,
      method: req.method,
    });
  });
}

// Connect MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Error:", err.message));

mongoose.connection.once("open", () => {
  seedBrandOptions();
  initBackupScheduler();
  initAIManualSync().then((r) => {
    if (r?.started) console.log(`[AI][Manual] Loaded manual entries (${r.count || 0})`);
  });
  initAIKnowledgeSync().then((r) => {
    if (r?.started) {
      console.log(`[AI][RAG] Knowledge sync started (streams=${r.streams || 0}, pollMs=${r.pollMs})`);
    }
  });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  serverLog(`Server running on port ${PORT}`);
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    serverLog(`[FATAL] Port ${PORT} is already in use! Another process is occupying it.`);
    console.error(`[FATAL] Port ${PORT} is already in use!`);
  } else {
    serverLog(`[FATAL] Server error: ${err.message}`);
    console.error(`[FATAL] Server error: ${err.message}`);
  }
  process.exit(1);
});
