const mongoose = require('mongoose');

// A Member (contributor) of the parish. Giving (income) can be attributed to a member
// so the church can produce per-member giving statements and receipts.
const memberSchema = new mongoose.Schema({
  name: { type: String, required: true },
  memberNumber: { type: String },   // optional church membership number
  phone: { type: String },
  email: { type: String },
  localChurch: { type: mongoose.Schema.Types.ObjectId, ref: 'LocalChurch' }, // optional
  isActive: { type: Boolean, default: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
}, { timestamps: true });

// Membership number, when supplied, is unique within a parish
memberSchema.index(
  { tenantId: 1, memberNumber: 1 },
  { unique: true, partialFilterExpression: { memberNumber: { $type: 'string' } } }
);

module.exports = mongoose.model('Member', memberSchema);
