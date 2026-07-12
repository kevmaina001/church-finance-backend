const mongoose = require('mongoose');

const journalEntrySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  reference: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  entries: [{
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    description: String
  }],
  totalDebit: { type: Number, required: true },
  totalCredit: { type: Number, required: true },
  status: {
    type: String,
    enum: ['draft', 'posted', 'void'],
    default: 'draft'
  },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  localChurch: { type: mongoose.Schema.Types.ObjectId, ref: 'LocalChurch' }, // Which local church this entry belongs to (optional = parish-general)
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
});

// Ensure totalDebit equals totalCredit
journalEntrySchema.pre('save', function(next) {
  if (this.totalDebit !== this.totalCredit) {
    next(new Error('Total debit must equal total credit'));
  }
  next();
});

const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema);
module.exports = JournalEntry; 