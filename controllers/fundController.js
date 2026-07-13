const mongoose = require('mongoose');
const Fund = require('../models/Fund');
const Income = require('../models/Income');
const Expenditure = require('../models/Expenditure');

// List funds for the parish
exports.getFunds = async (req, res) => {
  try {
    const funds = await Fund.find({ tenantId: req.user.tenantId }).sort({ name: 1 });
    res.status(200).json({ funds });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create a fund
exports.addFund = async (req, res) => {
  try {
    const { name, type, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Fund name is required' });
    const fund = new Fund({
      name: name.trim(),
      type: type === 'unrestricted' ? 'unrestricted' : 'restricted',
      description,
      tenantId: req.user.tenantId,
    });
    await fund.save();
    res.status(201).json({ message: 'Fund created', fund });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'A fund with that name already exists' });
    res.status(400).json({ message: error.message });
  }
};

// Update a fund (whitelisted fields only)
exports.updateFund = async (req, res) => {
  try {
    const fund = await Fund.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!fund) return res.status(404).json({ message: 'Fund not found' });
    const { name, type, description } = req.body;
    if (name !== undefined) fund.name = name.trim();
    if (type !== undefined) fund.type = type === 'unrestricted' ? 'unrestricted' : 'restricted';
    if (description !== undefined) fund.description = description;
    await fund.save();
    res.status(200).json({ message: 'Fund updated', fund });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'A fund with that name already exists' });
    res.status(400).json({ message: error.message });
  }
};

// Activate/deactivate a fund
exports.toggleFundActive = async (req, res) => {
  try {
    const fund = await Fund.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!fund) return res.status(404).json({ message: 'Fund not found' });
    fund.isActive = !fund.isActive;
    await fund.save();
    res.status(200).json({ message: `Fund ${fund.isActive ? 'activated' : 'deactivated'}`, fund });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Fund balances report.
// For each fund: money received (income tagged to it) - money spent (expenditure tagged to it) = balance.
// Money not tagged to any fund is reported as a "General fund (untagged)" row so nothing is hidden.
// Scoped to a local church when ?localChurch=<id>; otherwise consolidated across the parish.
exports.getFundReport = async (req, res) => {
  try {
    const { localChurch, year } = req.query;
    const tenantId = req.user.tenantId;

    const match = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (localChurch) match.localChurch = new mongoose.Types.ObjectId(localChurch);
    if (year) match.year = Number(year);

    const [funds, incomeAgg, expenseAgg] = await Promise.all([
      Fund.find({ tenantId }).sort({ name: 1 }),
      Income.aggregate([{ $match: match }, { $group: { _id: '$fund', total: { $sum: '$amount' } } }]),
      Expenditure.aggregate([{ $match: match }, { $group: { _id: '$fund', total: { $sum: '$amount' } } }]),
    ]);

    const incomeByFund = {};
    const expenseByFund = {};
    let untaggedIncome = 0;
    let untaggedExpense = 0;
    incomeAgg.forEach(a => { if (a._id) incomeByFund[String(a._id)] = a.total; else untaggedIncome += a.total; });
    expenseAgg.forEach(a => { if (a._id) expenseByFund[String(a._id)] = a.total; else untaggedExpense += a.total; });

    const rows = funds.map(f => {
      const received = incomeByFund[String(f._id)] || 0;
      const spent = expenseByFund[String(f._id)] || 0;
      return {
        id: String(f._id),
        name: f.name,
        type: f.type,
        isActive: f.isActive,
        received,
        spent,
        balance: received - spent,
      };
    });

    // Always surface untagged/general money so the report reconciles to total cash movement.
    if (untaggedIncome || untaggedExpense) {
      rows.push({
        id: null,
        name: 'General fund (untagged)',
        type: 'unrestricted',
        isActive: true,
        received: untaggedIncome,
        spent: untaggedExpense,
        balance: untaggedIncome - untaggedExpense,
      });
    }

    const totals = rows.reduce((t, r) => ({
      received: t.received + r.received,
      spent: t.spent + r.spent,
      balance: t.balance + r.balance,
    }), { received: 0, spent: 0, balance: 0 });

    res.status(200).json({
      scope: localChurch ? 'church' : 'parish',
      year: year ? Number(year) : null,
      funds: rows,
      totals,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
