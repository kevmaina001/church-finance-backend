const mongoose = require('mongoose');

// A LocalChurch is a congregation that belongs to a parish (the tenant).
// One parish (tenant) can have many local churches. Financial transactions
// (income/expenditure) are tagged with a local church so each church keeps its
// own book, while everything still rolls up to the parish tenant.
const localChurchSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
}, { timestamps: true });

// Names must be unique within a parish
localChurchSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('LocalChurch', localChurchSchema);
