// backend/routes/stockRoutes.js
const express = require("express");
const router = express.Router();
const stockController = require("../controllers/stockController");

router.get("/current", stockController.getCurrentStock);

module.exports = router;
