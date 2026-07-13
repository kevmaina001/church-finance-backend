const Votehead = require('../models/Votehead');
const Account = require('../models/Account');

exports.addVotehead = async (req, res) => {
  try {
    const { name, description, account, localChurch } = req.body;

    // Verify the account exists and is an expense account
    const accountDoc = await Account.findOne({ _id: account, tenantId: req.user.tenantId });
    if (!accountDoc) {
      return res.status(400).json({ message: 'Account not found for your tenant' });
    }
    if (accountDoc.type !== 'expense') {
      return res.status(400).json({ message: 'Account must be an expense account' });
    }
    if (!accountDoc.isActive) {
      return res.status(400).json({ message: 'Account must be active' });
    }

    const votehead = new Votehead({ name, description, account, localChurch: localChurch || undefined, tenantId: req.user.tenantId });
    await votehead.save();
    res.status(201).json({ message: 'Votehead added successfully', votehead });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get voteheads. In a local-church context (?localChurch=<id>) returns that church's own
// categories plus the shared (parish-wide) ones; unscoped returns everything.
exports.getVoteheads = async (req, res) => {
  try {
    const filter = { tenantId: req.user.tenantId };
    if (req.query.localChurch) {
      filter.$or = [{ localChurch: req.query.localChurch }, { localChurch: null }];
    }
    const voteheads = await Votehead.find(filter)
      .populate('account', 'name code type')
      .populate({ path: 'localChurch', select: 'name', options: { strictPopulate: false } });
    res.status(200).json({ voteheads });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a votehead (whitelisted fields only)
exports.updateVotehead = async (req, res) => {
  try {
    const votehead = await Votehead.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!votehead) return res.status(404).json({ message: 'Votehead not found' });
    const { name, description, account, localChurch } = req.body;
    if (account !== undefined) {
      const accountDoc = await Account.findOne({ _id: account, tenantId: req.user.tenantId });
      if (!accountDoc || accountDoc.type !== 'expense' || !accountDoc.isActive) {
        return res.status(400).json({ message: 'Account must be an active expense account' });
      }
      votehead.account = account;
    }
    if (name !== undefined) votehead.name = name;
    if (description !== undefined) votehead.description = description;
    if (localChurch !== undefined) votehead.localChurch = localChurch || undefined;
    await votehead.save();
    res.status(200).json({ message: 'Votehead updated', votehead });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteVotehead = async (req, res) => {
  try {
    const { id } = req.params;
    const votehead = await Votehead.findOneAndDelete({ _id: id, tenantId: req.user.tenantId });
    if (!votehead) return res.status(404).json({ message: 'Votehead not found' });
    res.status(200).json({ message: 'Votehead deleted successfully', votehead });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
