const express = require('express');
const { getBalance } = require('../controllers/balanceController');
const authenticate = require('../middlewares/auth');
const router = express.Router();

// Cash/bank position, derived from the ledger. Requires authentication (scoped to the tenant).
// The old manual PUT/initialize endpoints were removed — balances are no longer set by hand.
router.get('/', authenticate, getBalance);

module.exports = router;
