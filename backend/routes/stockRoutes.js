// backend/routes/stockRoutes.js
const express = require("express");
const router = express.Router();
const stockController = require("../controllers/stockController");

router.get("/current", stockController.getCurrentStock);
router.post("/clear-ledgers", stockController.clearLedgers);
router.post("/zero-paddy", stockController.zeroPaddyStock);
router.post("/delete-ledgers", stockController.deleteLedgers);

module.exports = router;
