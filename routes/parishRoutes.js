const express = require('express');
const router = express.Router();
const { getParishOverview, getDailyActivity } = require('../controllers/parishController');
const authenticate = require('../middlewares/auth');
const { forceReadScope, parishScopeOnly } = require('../middlewares/scope');

// Consolidated overview is parish-level only (church-scoped users are blocked).
router.get('/overview', authenticate, parishScopeOnly, getParishOverview);
// Daily activity: church-scoped users are locked to their own church.
router.get('/daily', authenticate, forceReadScope, getDailyActivity);

module.exports = router;
