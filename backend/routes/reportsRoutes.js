const express = require("express");
const ctrl = require("../controllers/reportsController");

const router = express.Router();

router.get("/stock", ctrl.getStockReport);
router.get("/gatepass", ctrl.getGatePassReport);
router.get("/stock-movement", ctrl.getStockMovementReport);
router.get("/production-summary", ctrl.getProductionSummaryReport);

router.get("/templates", ctrl.getReportTemplates);
router.post("/templates", ctrl.createReportTemplate);

module.exports = router;
