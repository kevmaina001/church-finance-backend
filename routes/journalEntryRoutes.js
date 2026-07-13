const express = require('express');
const { listJournalEntries, getJournalEntry, addJournalEntry } = require('../controllers/journalEntryController');
const authenticate = require('../middlewares/auth');
const { requireParishLevel } = require('../middlewares/permit');

const router = express.Router();

// Viewing the ledger is open to any authenticated user; posting manual journal
// entries is a parish-level accounting action.
router.get('/', authenticate, listJournalEntries);
router.get('/:id', authenticate, getJournalEntry);
router.post('/', authenticate, requireParishLevel, addJournalEntry);

module.exports = router; 