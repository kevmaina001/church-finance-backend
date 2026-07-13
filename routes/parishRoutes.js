const express = require('express');
const router = express.Router();
const { getParishOverview, getDailyActivity } = require('../controllers/parishController');
const authenticate = require('../middlewares/auth');

// Read-only consolidated overview; any authenticated user in the parish may view it.
router.get('/overview', authenticate, getParishOverview);
router.get('/daily', authenticate, getDailyActivity);

module.exports = router;
