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
const { requireWrite } = require('../middlewares/permit');

// Any authenticated user in the parish can read members and statements (needed by forms/reports)
router.get('/', authenticate, getMembers);
router.get('/:id/statement', authenticate, getMemberStatement);

// Managing members requires a non-view-only role (church scope enforced in controller)
router.post('/', authenticate, requireWrite, addMember);
router.put('/:id', authenticate, requireWrite, updateMember);
router.patch('/:id/toggle', authenticate, requireWrite, toggleMemberActive);

module.exports = router;
