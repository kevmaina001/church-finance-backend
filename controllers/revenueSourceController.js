const RevenueSource = require('../models/RevenueSource');
const Account = require('../models/Account');

// Add a new revenue source
exports.addRevenueSource = async (req, res) => {
  try {
    const { name, description, account, localChurch } = req.body;
    // Verify the account exists and is a revenue account
    const accountDoc = await Account.findOne({ _id: account, tenantId: req.user.tenantId });
    if (!accountDoc) {
      return res.status(400).json({ message: 'Account not found for your tenant.' });
    }
    if (accountDoc.type !== 'revenue') {
      return res.status(400).json({ message: 'Account must be a revenue account' });
    }
    if (!accountDoc.isActive) {
      return res.status(400).json({ message: 'Account must be active' });
    }
    const revenueSource = new RevenueSource({ name, description, account, localChurch: localChurch || undefined, tenantId: req.user.tenantId });
    await revenueSource.save();
    res.status(201).json({ message: 'Revenue source added successfully', revenueSource });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get revenue sources. In a local-church context (?localChurch=<id>) returns that church's
// own categories plus the shared (parish-wide) ones; unscoped returns everything.
exports.getRevenueSources = async (req, res) => {
  try {
    const filter = { tenantId: req.user.tenantId };
    if (req.query.localChurch) {
      // In Mongo, { field: null } matches both null and missing, so this covers legacy rows too.
      filter.$or = [{ localChurch: req.query.localChurch }, { localChurch: null }];
    }
    const revenueSources = await RevenueSource.find(filter)
      .populate('account', 'name code type')
      .populate({ path: 'localChurch', select: 'name', options: { strictPopulate: false } });
    res.status(200).json({ revenueSources });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a revenue source (whitelisted fields only)
exports.updateRevenueSource = async (req, res) => {
  try {
    const source = await RevenueSource.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!source) return res.status(404).json({ message: 'Revenue source not found' });
    const { name, description, account, localChurch } = req.body;
    if (account !== undefined) {
      const accountDoc = await Account.findOne({ _id: account, tenantId: req.user.tenantId });
      if (!accountDoc || accountDoc.type !== 'revenue' || !accountDoc.isActive) {
        return res.status(400).json({ message: 'Account must be an active revenue account' });
      }
      source.account = account;
    }
    if (name !== undefined) source.name = name;
    if (description !== undefined) source.description = description;
    if (localChurch !== undefined) source.localChurch = localChurch || undefined;
    await source.save();
    res.status(200).json({ message: 'Revenue source updated', revenueSource: source });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a revenue source
exports.deleteRevenueSource = async (req, res) => {
  try {
    const { id } = req.params;
    const revenueSource = await RevenueSource.findOneAndDelete({ _id: id, tenantId: req.user.tenantId });
    if (!revenueSource) return res.status(404).json({ message: 'Revenue source not found' });
    res.status(200).json({ message: 'Revenue source deleted successfully', revenueSource });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}; 