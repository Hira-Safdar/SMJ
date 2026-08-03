const express = require("express");
const router = express.Router();
const GatePassGeneratedReport = require("../models/gatePassGeneratedReportModel");

router.get("/", async (req, res) => {
  try {
    const rows = await GatePassGeneratedReport.find({})
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load generated gatepass reports." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, reportKind, filterLabel, criteria, columns, rows } = req.body;
    const doc = await GatePassGeneratedReport.create({
      name: String(name || "").trim() || "Gatepass Report",
      reportKind: String(reportKind || "gatepass"),
      filterLabel: String(filterLabel || "").trim(),
      criteria: criteria || {},
      columns: Array.isArray(columns) ? columns : [],
      rows: Array.isArray(rows) ? rows : [],
    });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Unable to save gatepass report." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const doc = await GatePassGeneratedReport.findByIdAndDelete(req.params.id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: "Generated gatepass report not found." });
    }
    res.json({ success: true, message: "Generated gatepass report deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Unable to delete generated gatepass report." });
  }
});

module.exports = router;
