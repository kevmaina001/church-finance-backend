const mongoose = require('mongoose');

const expenditureSchema = new mongoose.Schema({
  votehead: { type: mongoose.Schema.Types.ObjectId, ref: 'Votehead', required: true }, // Reference to Votehead
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  year: { type: Number, default: new Date().getFullYear() },
  date: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  user: { type: String, required: true }, // Store user name from `req.user`
  assetAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true }, // Asset account (Cash/Bank)
  localChurch: { type: mongoose.Schema.Types.ObjectId, ref: 'LocalChurch' }, // Which local church this expenditure belongs to (optional = parish-general)
  fund: { type: mongoose.Schema.Types.ObjectId, ref: 'Fund' }, // Fund this expenditure is drawn from (optional = general/unrestricted)
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
});

module.exports = mongoose.model('Expenditure', expenditureSchema);
