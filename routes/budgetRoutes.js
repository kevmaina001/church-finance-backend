const express = require('express');
const router = express.Router();
const {
  getBudgets,
  setBudget,
  deleteBudget,
  getBudgetReport,
} = require('../controllers/budgetController');
const authenticate = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/role');

// Reading budgets and the report is available to any authenticated user in the parish
router.get('/', authenticate, getBudgets);
router.get('/report', authenticate, getBudgetReport);

// Setting/removing budgets is Admin-only
router.post('/', authenticate, roleMiddleware('Admin'), setBudget);
router.delete('/:id', authenticate, roleMiddleware('Admin'), deleteBudget);

module.exports = router;
