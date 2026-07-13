const express = require('express');
const { addIncome, getIncomes, updateIncome, deleteIncome } = require('../controllers/incomeController');
const authenticate = require('../middlewares/auth'); // Import authenticate middleware
const { requireWrite } = require('../middlewares/permit'); // Block view-only users
const { forceReadScope } = require('../middlewares/scope'); // Lock church-scoped users to their church
const logAction = require('../middlewares/auditLogger'); // Import auditLogger middleware

const router = express.Router();

// Route Definitions with Middleware. Writes require a non-view-only role; church scope
// is enforced inside the controller for Treasurer/Secretary users.
router.post(
  '/',
  authenticate,
  requireWrite,
  logAction('Add Income', 'Added a new income record'),
  addIncome
);

router.get(
  '/',
  authenticate,
  forceReadScope,
  getIncomes
);

router.put(
  '/:id',
  authenticate,
  requireWrite,
  logAction('Update Income', 'Updated income record'),
  updateIncome
);

router.delete(
  '/:id',
  authenticate,
  requireWrite,
  logAction('Delete Income', 'Deleted income record'),
  deleteIncome
);

module.exports = router;
