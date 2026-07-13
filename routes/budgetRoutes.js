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
const { forceReadScope } = require('../middlewares/scope');

// Reading budgets and the report — church-scoped users see only their church.
router.get('/', authenticate, forceReadScope, getBudgets);
router.get('/report', authenticate, forceReadScope, getBudgetReport);

// Setting/removing budgets is a parish-wide action
router.post('/', authenticate, requireParishLevel, setBudget);
router.delete('/:id', authenticate, requireParishLevel, deleteBudget);

module.exports = router;
