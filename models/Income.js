const mongoose = require('mongoose');

const incomeSchema = new mongoose.Schema(
  {
    revenueSource: { type: mongoose.Schema.Types.ObjectId, ref: 'RevenueSource', required: true }, // Reference to RevenueSource
    amount: { type: Number, required: true },
    description: { type: String },
    user: { type: String, required: true }, // Add user field
    assetAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true }, // Asset account (Cash/Bank)
    localChurch: { type: mongoose.Schema.Types.ObjectId, ref: 'LocalChurch' }, // Which local church this income belongs to (optional = parish-general)
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' }, // Contributing member (optional)
    fund: { type: mongoose.Schema.Types.ObjectId, ref: 'Fund' }, // Fund this income is earmarked for (optional = general/unrestricted)
    date: { type: Date, default: Date.now },
    year: { type: Number, required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  },
  { timestamps: true }
);

const Income = mongoose.model('Income', incomeSchema);
module.exports = Income;
