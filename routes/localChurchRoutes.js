const express = require('express');
const router = express.Router();
const {
  getLocalChurches,
  addLocalChurch,
  updateLocalChurch,
  toggleLocalChurchActive,
} = require('../controllers/localChurchController');
const authenticate = require('../middlewares/auth');
const { requireParishLevel } = require('../middlewares/permit');

// Any authenticated user in the parish can list local churches (needed by forms)
router.get('/', authenticate, getLocalChurches);

// Managing local churches is a parish-wide action
router.post('/', authenticate, requireParishLevel, addLocalChurch);
router.put('/:id', authenticate, requireParishLevel, updateLocalChurch);
router.patch('/:id/toggle', authenticate, requireParishLevel, toggleLocalChurchActive);

module.exports = router;
