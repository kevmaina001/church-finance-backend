const express = require('express');
const router = express.Router();
const {
  getBudgets,
  setBudget,
  deleteBudget,
  getBudgetReport,
} = require('../controllers/budgetController');
const authenticate = require('../middlewares/auth');
const { requireParishLevel } = require('../middlewares/permit');

// Reading budgets and the report is available to any authenticated user in the parish
router.get('/', authenticate, getBudgets);
router.get('/report', authenticate, getBudgetReport);

// Setting/removing budgets is a parish-wide action
router.post('/', authenticate, requireParishLevel, setBudget);
router.delete('/:id', authenticate, requireParishLevel, deleteBudget);

module.exports = router;
