// backend/server.js
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get("/", (req, res) => {
  res.send("✅ SMJ Rice Mill API running successfully...");
});
const dashboardRoutes = require("./routes/dashboardRoutes");
app.use("/api/dashboard", dashboardRoutes);
const companyRoutes = require("./routes/companyRoutes");
app.use("/api/companies", companyRoutes);
const customerRoutes = require("./routes/customerRoutes");
app.use("/api/customers", customerRoutes);
const wholesellerRoutes = require("./routes/wholesellerRoutes");
app.use("/api/wholesellers", wholesellerRoutes);
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
const managerialStockRoutes = require("./routes/managerialStockRoutes");
app.use("/api/managerial-stock", managerialStockRoutes);
const aiRoutes = require("./routes/aiRoutes");
app.use("/api/ai", aiRoutes);
const adminRoutes = require("./routes/adminRoutes");
app.use("/api/admin", adminRoutes);
const accountingRoutes = require("./routes/accountingRoutes");
app.use("/api/accounting", accountingRoutes);
const reportsRoutes = require("./routes/reportsRoutes");
app.use("/api/reports", reportsRoutes);

// Connect MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Error:", err.message));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
