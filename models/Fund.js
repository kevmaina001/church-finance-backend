const mongoose = require('mongoose');

// A Fund earmarks money for a purpose. Restricted funds (e.g. Building, Missions,
// Welfare) may only be spent on that purpose; unrestricted/general money can be spent
// on anything. Income and expenditure can be tagged with a fund so each fund's balance
// (money received - money spent) is tracked separately from the overall cash position.
const fundSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['restricted', 'unrestricted'], default: 'restricted' },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
}, { timestamps: true });

// Fund name is unique within a parish
fundSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Fund', fundSchema);
