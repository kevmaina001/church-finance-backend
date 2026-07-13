const express = require('express');
const { addVotehead, getVoteheads, updateVotehead, deleteVotehead } = require('../controllers/voteheadController');
const authenticate = require('../middlewares/auth');
const { requireParishLevel } = require('../middlewares/permit');

const router = express.Router();

router.post('/', authenticate, requireParishLevel, addVotehead);
router.get('/', authenticate, getVoteheads);
router.put('/:id', authenticate, requireParishLevel, updateVotehead);
router.delete('/:id', authenticate, requireParishLevel, deleteVotehead);

module.exports = router;
