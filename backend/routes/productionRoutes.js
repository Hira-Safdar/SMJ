// backend/routes/productionRoutes.js
const express = require("express");
const router = express.Router();
const productionController = require("../controllers/productionController");

// Batches (daily runs)
router.post("/batches", productionController.createBatch);
router.get("/batches", productionController.listBatches);
router.get("/batches/:id", productionController.getBatchById);
router.put("/batches/:id", productionController.updateBatch);
router.delete("/batches/:id", productionController.deleteBatch);

router.post("/batches/:id/complete", productionController.completeBatch);
router.post("/batches/:id/reopen", productionController.reopenBatch);

// Source-level groups + products
router.get("/overview", productionController.getOverview);
router.get("/groups/:id", productionController.getGroupById);

router.post("/groups/:id/outputs", productionController.addOutput);
router.patch("/groups/:id/outputs/:outputId", productionController.updateOutput);
router.delete("/groups/:id/outputs/:outputId", productionController.deleteOutput);
router.post("/groups/:id/done", productionController.markGroupDone);

router.get("/summary/today", productionController.getTodaySummary);

module.exports = router;
