const express = require("express");
const acc = require("../controllers/accountingController");

const router = express.Router();

router.get("/ledger", acc.getLedger);
router.get("/trial-balance", acc.getTrialBalance);
router.get("/pl", acc.getProfitLoss);
router.get("/balance", acc.getBalanceSheet);
router.get("/accounts", acc.getAccounts);
  router.post("/accounts", acc.createAccount);
  router.put("/accounts/bulk-subtype", acc.bulkSetSubType);
  router.put("/accounts/:id", acc.updateAccount);
router.delete("/accounts/:id", acc.deleteAccount);

// Master sync
router.post("/sync/parties", acc.syncPartiesFromMasters);
router.post("/sync/products", acc.syncProductsFromProductTypes);

router.get("/generated-journals", acc.getGeneratedJournals);
router.post("/generated-journals", acc.createGeneratedJournal);
router.put("/generated-journals/:id", acc.updateGeneratedJournal);
router.delete("/generated-journals/:id", acc.deleteGeneratedJournal);

// Vouchers / Journal CRUD (manual only)
router.get("/vouchers/latest-cash", acc.getLatestCashInHand);
router.get("/vouchers", acc.getVouchers);
router.get("/vouchers/:id", acc.getVoucherById);
router.post("/vouchers", acc.createVoucher);
router.put("/vouchers/:id", acc.updateVoucher);
router.delete("/vouchers/:id", acc.deleteVoucher);
router.get("/journal", acc.getJournalEntries);

module.exports = router;
