const express = require('express');
const { listAccounts, addAccount, updateAccount, toggleAccountActive } = require('../controllers/accountController');
const authenticate = require('../middlewares/auth');
const { requireParishLevel } = require('../middlewares/permit');

const router = express.Router();

// Reading the chart of accounts is open to any authenticated user (forms need it);
// changing it is a parish-wide action limited to parish-level roles.
router.get('/', authenticate, listAccounts);
router.post('/', authenticate, requireParishLevel, addAccount);
router.put('/:id', authenticate, requireParishLevel, updateAccount);
router.patch('/:id/activate', authenticate, requireParishLevel, toggleAccountActive);

module.exports = router; 