const express = require('express');
const router = express.Router();
const {
  getMembers,
  addMember,
  updateMember,
  toggleMemberActive,
  getMemberStatement,
} = require('../controllers/memberController');
const authenticate = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/role');

// Any authenticated user in the parish can read members and statements (needed by forms/reports)
router.get('/', authenticate, getMembers);
router.get('/:id/statement', authenticate, getMemberStatement);

// Managing members is Admin-only
router.post('/', authenticate, roleMiddleware('Admin'), addMember);
router.put('/:id', authenticate, roleMiddleware('Admin'), updateMember);
router.patch('/:id/toggle', authenticate, roleMiddleware('Admin'), toggleMemberActive);

module.exports = router;
