const express = require('express');
const router = express.Router();
const {
  getLocalChurches,
  addLocalChurch,
  updateLocalChurch,
  toggleLocalChurchActive,
} = require('../controllers/localChurchController');
const authenticate = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/role');

// Any authenticated user in the parish can list local churches (needed by forms)
router.get('/', authenticate, getLocalChurches);

// Managing local churches is Admin-only
router.post('/', authenticate, roleMiddleware('Admin'), addLocalChurch);
router.put('/:id', authenticate, roleMiddleware('Admin'), updateLocalChurch);
router.patch('/:id/toggle', authenticate, roleMiddleware('Admin'), toggleLocalChurchActive);

module.exports = router;
