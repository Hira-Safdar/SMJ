const express = require("express");
const ctrl = require("../controllers/reportsController");

const router = express.Router();

router.get("/stock", ctrl.getStockReport);
router.get("/production", ctrl.getProductionReport);
router.get("/gatepass", ctrl.getGatePassReport);
router.get("/stock-movement", ctrl.getStockMovementReport);
router.get("/production-summary", ctrl.getProductionSummaryReport);
router.get("/by-product", ctrl.getByProductReport);
router.get("/master/companies", ctrl.getCompanyListReport);
router.get("/master/products", ctrl.getProductListReport);

router.get("/templates", ctrl.getReportTemplates);
router.post("/templates", ctrl.createReportTemplate);
router.delete("/templates/:id", ctrl.deleteReportTemplate);

module.exports = router;
