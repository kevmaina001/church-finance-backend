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
const { requireParishLevel } = require('../middlewares/permit');

// Reading funds and the fund-balances report is available to any authenticated user
router.get('/', authenticate, getFunds);
router.get('/report', authenticate, getFundReport);

// Creating/editing funds is a parish-wide action
router.post('/', authenticate, requireParishLevel, addFund);
router.put('/:id', authenticate, requireParishLevel, updateFund);
router.patch('/:id/toggle', authenticate, requireParishLevel, toggleFundActive);

module.exports = router;
