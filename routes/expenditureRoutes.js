const express = require('express');
const { addExpenditure, getExpenditures, updateExpenditure, deleteExpenditure } = require('../controllers/expenditureController');
const authenticate = require('../middlewares/auth'); // Authentication middleware
const { requireWrite } = require('../middlewares/permit'); // Block view-only users

const router = express.Router();

// Writes require a non-view-only role; church scope enforced in the controller.
router.post('/', authenticate, requireWrite, addExpenditure);
router.get('/', authenticate, getExpenditures);
router.put('/:id', authenticate, requireWrite, updateExpenditure);
router.delete('/:id', authenticate, requireWrite, deleteExpenditure);

module.exports = router;
