const express = require('express');
const { addRevenueSource, getRevenueSources, updateRevenueSource, deleteRevenueSource } = require('../controllers/revenueSourceController');
const authenticate = require('../middlewares/auth');
const { requireParishLevel } = require('../middlewares/permit');

const router = express.Router();

router.post('/', authenticate, requireParishLevel, addRevenueSource);
router.get('/', authenticate, getRevenueSources);
router.put('/:id', authenticate, requireParishLevel, updateRevenueSource);
router.delete('/:id', authenticate, requireParishLevel, deleteRevenueSource);

module.exports = router; 