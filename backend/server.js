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

dotenv.config({ path: path.join(__dirname, "../.env") });

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
  const distIndex = path.join(__dirname, "../frontend/dist/index.html");
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
const frontendDist = path.join(__dirname, "../frontend/dist");

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));

  // SPA catch-all: non-API routes get index.html
  app.use((req, res) => {
    if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/uploads")) {
      return res.status(404).json({ ok: false, error: "Route not found", path: req.originalUrl, method: req.method });
    }
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
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
