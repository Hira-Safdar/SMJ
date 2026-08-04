// backend/routes/gatePassRoutes.js
const express = require("express");
const router = express.Router();
const gatePassController = require("../controllers/gatePassController");

router.post("/", gatePassController.createGatePass);
router.get("/", gatePassController.getGatePasses);
router.get("/:id", gatePassController.getGatePass);
router.put("/:id", gatePassController.updateGatePass);
router.delete("/:id", gatePassController.deleteGatePass);

module.exports = router;
