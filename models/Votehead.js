const mongoose = require('mongoose');

const voteheadSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  account: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Account',
    required: true,
    validate: {
      validator: async function(accountId) {
        const Account = mongoose.model('Account');
        const account = await Account.findById(accountId);
        return account && account.type === 'expense' && account.isActive;
      },
      message: 'Account must be an active expense account'
    }
  },
  // Optional: scope this spending category to a single local church. Null/absent = shared
  // parish-wide (available to every church). Church-scoped ones only appear in that church's context.
  localChurch: { type: mongoose.Schema.Types.ObjectId, ref: 'LocalChurch' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
}, { timestamps: true });

const Votehead = mongoose.model('Votehead', voteheadSchema);
module.exports = Votehead;
