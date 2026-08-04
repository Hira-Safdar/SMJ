const express = require("express");
const router = express.Router();
const aiController = require("../controllers/aiController");

// ============ CHATBOT ROUTES ============
router.post("/chat/message", aiController.sendMessage);
router.delete("/chat/clear/:sessionId", aiController.clearChat);

module.exports = router;
