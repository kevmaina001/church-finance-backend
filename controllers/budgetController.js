const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const Income = require('../models/Income');
const Expenditure = require('../models/Expenditure');
const RevenueSource = require('../models/RevenueSource');
const Votehead = require('../models/Votehead');

// List budget lines for a year (scoped to a local church, or parish-level when unscoped)
exports.getBudgets = async (req, res) => {
  try {
    const { year, localChurch } = req.query;
    const filter = { tenantId: req.user.tenantId, localChurch: localChurch || null };
    if (year) filter.year = Number(year);
    const budgets = await Budget.find(filter)
      .populate('revenueSource', 'name')
      .populate('votehead', 'name');
    res.status(200).json({ budgets });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create or update a budget line (upsert on year + kind + source/votehead + church)
exports.setBudget = async (req, res) => {
  try {
    const { year, kind, revenueSource, votehead, amount, localChurch } = req.body;
    const tenantId = req.user.tenantId;
    if (!year || !['income', 'expense'].includes(kind) || amount === undefined || amount === null) {
      return res.status(400).json({ message: 'year, kind and amount are required' });
    }
    if (kind === 'income' && !revenueSource) return res.status(400).json({ message: 'revenueSource is required for income budgets' });
    if (kind === 'expense' && !votehead) return res.status(400).json({ message: 'votehead is required for expense budgets' });

    const key = { tenantId, year: Number(year), kind, localChurch: localChurch || null };
    if (kind === 'income') key.revenueSource = revenueSource;
    else key.votehead = votehead;

    const budget = await Budget.findOneAndUpdate(
      key,
      { $set: { amount: Number(amount) } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.status(200).json({ message: 'Budget saved', budget });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteBudget = async (req, res) => {
  try {
    const deleted = await Budget.findOneAndDelete({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!deleted) return res.status(404).json({ message: 'Budget line not found' });
    res.status(200).json({ message: 'Budget line deleted' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Budget vs Actual report.
// Parish view (no localChurch): parish-level budgets vs CONSOLIDATED actuals (all churches).
// Church view: that church's budgets vs that church's actuals.
exports.getBudgetReport = async (req, res) => {
  try {
    const { year, localChurch } = req.query;
    const tenantId = req.user.tenantId;
    if (!year) return res.status(400).json({ message: 'year is required' });

    const budgetFilter = { tenantId, year: Number(year), localChurch: localChurch || null };
    const budgets = await Budget.find(budgetFilter);

    const actualMatch = { tenantId: new mongoose.Types.ObjectId(tenantId), year: Number(year) };
    if (localChurch) actualMatch.localChurch = new mongoose.Types.ObjectId(localChurch);

    const [incomeActuals, expenseActuals, revenueSources, voteheads] = await Promise.all([
      Income.aggregate([{ $match: actualMatch }, { $group: { _id: '$revenueSource', total: { $sum: '$amount' } } }]),
      Expenditure.aggregate([{ $match: actualMatch }, { $group: { _id: '$votehead', total: { $sum: '$amount' } } }]),
      RevenueSource.find({ tenantId }).select('name'),
      Votehead.find({ tenantId }).select('name'),
    ]);

    const rsMap = Object.fromEntries(revenueSources.map(r => [String(r._id), r.name]));
    const vhMap = Object.fromEntries(voteheads.map(v => [String(v._id), v.name]));

    const buildRows = (kind, budgetById, actualsAgg, nameMap) => {
      const actualMap = {};
      actualsAgg.forEach(a => { if (a._id) actualMap[String(a._id)] = a.total; });
      const ids = new Set([...Object.keys(budgetById), ...Object.keys(actualMap)]);
      return [...ids].map(id => {
        const budget = budgetById[id] || 0;
        const actual = actualMap[id] || 0;
        return {
          id,
          name: nameMap[id] || 'Unknown',
          budget,
          actual,
          variance: actual - budget,
          percentUsed: budget > 0 ? Math.round((actual / budget) * 100) : null,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
    };

    const incomeBudgetById = {};
    const expenseBudgetById = {};
    budgets.forEach(b => {
      if (b.kind === 'income' && b.revenueSource) incomeBudgetById[String(b.revenueSource)] = b.amount;
      if (b.kind === 'expense' && b.votehead) expenseBudgetById[String(b.votehead)] = b.amount;
    });

    const income = buildRows('income', incomeBudgetById, incomeActuals, rsMap);
    const expense = buildRows('expense', expenseBudgetById, expenseActuals, vhMap);

    const sum = (rows, field) => rows.reduce((s, r) => s + r[field], 0);

    res.status(200).json({
      year: Number(year),
      scope: localChurch ? 'church' : 'parish',
      income,
      expense,
      totals: {
        incomeBudget: sum(income, 'budget'),
        incomeActual: sum(income, 'actual'),
        expenseBudget: sum(expense, 'budget'),
        expenseActual: sum(expense, 'actual'),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
