const Member = require('../models/Member');
const Income = require('../models/Income');
const { lockedChurch, canWriteChurch } = require('../utils/permissions');

// List members for the parish (optionally filtered by local church)
exports.getMembers = async (req, res) => {
  try {
    const filter = { tenantId: req.user.tenantId };
    if (req.query.localChurch) filter.localChurch = req.query.localChurch;
    const members = await Member.find(filter)
      .populate({ path: 'localChurch', select: 'name', options: { strictPopulate: false } })
      .sort({ name: 1 });
    res.status(200).json({ members });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add a member
exports.addMember = async (req, res) => {
  try {
    const { name, memberNumber, phone, email, localChurch } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Member name is required' });
    }
    // Church-scoped users can only register members under their own church.
    const effectiveChurch = lockedChurch(req.user) || localChurch || undefined;
    const member = new Member({
      name: name.trim(),
      memberNumber: memberNumber && memberNumber.trim() ? memberNumber.trim() : undefined,
      phone, email,
      localChurch: effectiveChurch,
      tenantId: req.user.tenantId,
    });
    await member.save();
    res.status(201).json({ message: 'Member added', member });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'A member with that number already exists' });
    res.status(400).json({ message: error.message });
  }
};

// Update a member (whitelisted fields only)
exports.updateMember = async (req, res) => {
  try {
    const { id } = req.params;
    const member = await Member.findOne({ _id: id, tenantId: req.user.tenantId });
    if (!member) return res.status(404).json({ message: 'Member not found' });

    // A church-scoped user may only edit members in their own church.
    if (!canWriteChurch(req.user, member.localChurch)) {
      return res.status(403).json({ message: 'You can only edit members in your own church.' });
    }

    const { name, memberNumber, phone, email, localChurch } = req.body;
    if (name !== undefined) member.name = name.trim();
    if (memberNumber !== undefined) member.memberNumber = memberNumber && memberNumber.trim() ? memberNumber.trim() : undefined;
    if (phone !== undefined) member.phone = phone;
    if (email !== undefined) member.email = email;
    if (localChurch !== undefined) member.localChurch = localChurch || undefined;
    const locked = lockedChurch(req.user);
    if (locked) member.localChurch = locked;
    await member.save();
    res.status(200).json({ message: 'Member updated', member });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'A member with that number already exists' });
    res.status(400).json({ message: error.message });
  }
};

// Activate/deactivate a member
exports.toggleMemberActive = async (req, res) => {
  try {
    const { id } = req.params;
    const member = await Member.findOne({ _id: id, tenantId: req.user.tenantId });
    if (!member) return res.status(404).json({ message: 'Member not found' });
    if (!canWriteChurch(req.user, member.localChurch)) {
      return res.status(403).json({ message: 'You can only change members in your own church.' });
    }
    member.isActive = !member.isActive;
    await member.save();
    res.status(200).json({ message: `Member ${member.isActive ? 'activated' : 'deactivated'}`, member });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Per-member giving statement: all contributions attributed to the member in a period.
exports.getMemberStatement = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    const tenantId = req.user.tenantId;

    const member = await Member.findOne({ _id: id, tenantId })
      .populate({ path: 'localChurch', select: 'name', options: { strictPopulate: false } });
    if (!member) return res.status(404).json({ message: 'Member not found' });

    // Church-scoped users may only view members in their own church.
    const locked = lockedChurch(req.user);
    if (locked && String(member.localChurch?._id || member.localChurch || '') !== String(locked)) {
      return res.status(403).json({ message: 'You can only view members in your own church.' });
    }

    const filter = { member: id, tenantId };
    if (startDate && endDate) {
      filter.date = { $gte: new Date(startDate), $lte: new Date(endDate + 'T23:59:59.999Z') };
    }
    const incomes = await Income.find(filter)
      .populate('revenueSource', 'name')
      .sort({ date: 1 });

    const contributions = incomes.map(i => ({
      date: i.date,
      revenueSource: i.revenueSource ? i.revenueSource.name : 'N/A',
      amount: i.amount,
      description: i.description || '',
    }));

    // Totals grouped by revenue source
    const bySourceMap = {};
    let total = 0;
    for (const c of contributions) {
      bySourceMap[c.revenueSource] = (bySourceMap[c.revenueSource] || 0) + c.amount;
      total += c.amount;
    }
    const bySource = Object.entries(bySourceMap).map(([source, amount]) => ({ source, amount }));

    res.status(200).json({
      member: { name: member.name, memberNumber: member.memberNumber, localChurch: member.localChurch ? member.localChurch.name : null },
      period: { startDate: startDate || null, endDate: endDate || null },
      contributions,
      bySource,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
