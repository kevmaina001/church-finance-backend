const express = require('express');
const router = express.Router();
const {
  getFunds,
  addFund,
  updateFund,
  toggleFundActive,
  getFundReport,
} = require('../controllers/fundController');
const authenticate = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/role');

// Reading funds and the fund-balances report is available to any authenticated user
router.get('/', authenticate, getFunds);
router.get('/report', authenticate, getFundReport);

// Creating/editing funds is Admin-only
router.post('/', authenticate, roleMiddleware('Admin'), addFund);
router.put('/:id', authenticate, roleMiddleware('Admin'), updateFund);
router.patch('/:id/toggle', authenticate, roleMiddleware('Admin'), toggleFundActive);

module.exports = router;
