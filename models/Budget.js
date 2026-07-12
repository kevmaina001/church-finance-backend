const mongoose = require('mongoose');

// One budgeted amount for a year, tied to either a revenue source (income) or a
// votehead (expense). Optionally scoped to a local church (else parish-level).
const budgetSchema = new mongoose.Schema({
  year: { type: Number, required: true },
  kind: { type: String, enum: ['income', 'expense'], required: true },
  revenueSource: { type: mongoose.Schema.Types.ObjectId, ref: 'RevenueSource' }, // when kind === 'income'
  votehead: { type: mongoose.Schema.Types.ObjectId, ref: 'Votehead' },           // when kind === 'expense'
  amount: { type: Number, required: true, default: 0 },
  localChurch: { type: mongoose.Schema.Types.ObjectId, ref: 'LocalChurch' },      // optional (null = parish)
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Budget', budgetSchema);
