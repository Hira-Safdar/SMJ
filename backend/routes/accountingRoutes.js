const express = require("express");
const acc = require("../controllers/accountingController");

const router = express.Router();

router.get("/daybook", acc.getDaybook);
router.get("/ledger", acc.getLedger);
router.get("/trial-balance", acc.getTrialBalance);
router.get("/pl", acc.getProfitLoss);
router.get("/balance", acc.getBalanceSheet);
router.get("/party-ledger", acc.getPartyLedger);
router.get("/outstanding/receivables", acc.getOutstandingReceivables);
router.get("/outstanding/payables", acc.getOutstandingPayables);
router.get("/accounts", acc.getAccounts);
router.post("/accounts", acc.createAccount);
router.put("/accounts/:id", acc.updateAccount);
router.delete("/accounts/:id", acc.deleteAccount);
router.get("/entities", acc.getEntities);
router.post("/entities", acc.createEntity);
router.put("/entities/:id", acc.updateEntity);
router.delete("/entities/:id", acc.deleteEntity);

router.get("/parties", acc.getParties);
router.post("/parties", acc.createParty);
router.put("/parties/:id", acc.updateParty);
router.delete("/parties/:id", acc.deleteParty);

router.get("/products", acc.getProducts);
router.post("/products", acc.createProduct);
router.put("/products/:id", acc.updateProduct);
router.delete("/products/:id", acc.deleteProduct);

// Master sync
router.post("/sync/parties", acc.syncPartiesFromMasters);
router.post("/sync/products", acc.syncProductsFromProductTypes);

router.get("/templates", acc.getFilterTemplates);
router.post("/templates", acc.createFilterTemplate);
router.delete("/templates/:id", acc.deleteFilterTemplate);

// Vouchers / Journal CRUD (manual only)
router.get("/vouchers", acc.getVouchers);
router.get("/vouchers/:id", acc.getVoucherById);
router.post("/vouchers", acc.createVoucher);
router.put("/vouchers/:id", acc.updateVoucher);
router.delete("/vouchers/:id", acc.deleteVoucher);
router.get("/journal", acc.getJournalEntries);
router.post("/journal/post", acc.postManualJournal);
router.post("/journal/:id/reverse", acc.reverseJournalEntry);

module.exports = router;
