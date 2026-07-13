const mongoose = require('mongoose');
const Income = require('../models/Income');
const Expenditure = require('../models/Expenditure');
const LocalChurch = require('../models/LocalChurch');
const Budget = require('../models/Budget');
const Votehead = require('../models/Votehead');

// Daily activity ("day book"): all income + expenditure for a given calendar date,
// scoped to one church or across the whole parish. Powers the Daily Activity tab.
exports.getDailyActivity = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { date, localChurch } = req.query;
    if (!date) return res.status(400).json({ message: 'date is required (YYYY-MM-DD)' });

    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    const range = { $gte: start, $lte: end };
    const incFilter = { tenantId, date: range };
    const expFilter = { tenantId, date: range };
    if (localChurch) { incFilter.localChurch = localChurch; expFilter.localChurch = localChurch; }

    const [incomes, expenditures] = await Promise.all([
      Income.find(incFilter)
        .populate('revenueSource', 'name')
        .populate({ path: 'localChurch', select: 'name', options: { strictPopulate: false } })
        .sort({ date: 1, createdAt: 1 }),
      Expenditure.find(expFilter)
        .populate('votehead', 'name')
        .populate({ path: 'localChurch', select: 'name', options: { strictPopulate: false } })
        .sort({ date: 1, createdAt: 1 }),
    ]);

    const mapRow = (r, categoryField) => ({
      id: String(r._id),
      churchId: r.localChurch ? String(r.localChurch._id) : null,
      church: r.localChurch ? r.localChurch.name : 'Parish general',
      category: r[categoryField] ? r[categoryField].name : 'N/A',
      amount: r.amount,
      description: r.description || '',
      user: r.user || '',
      time: r.createdAt,
    });
    const income = incomes.map((r) => mapRow(r, 'revenueSource'));
    const expenditure = expenditures.map((r) => mapRow(r, 'votehead'));

    // Per-church subtotals for the day
    const bucket = {};
    const add = (key, name, field, amt) => {
      if (!bucket[key]) bucket[key] = { churchId: key === 'general' ? null : key, church: name, income: 0, expenditure: 0 };
      bucket[key][field] += amt;
    };
    income.forEach((r) => add(r.churchId || 'general', r.church, 'income', r.amount));
    expenditure.forEach((r) => add(r.churchId || 'general', r.church, 'expenditure', r.amount));
    const byChurch = Object.values(bucket)
      .map((b) => ({ ...b, net: b.income - b.expenditure }))
      .sort((a, b) => a.church.localeCompare(b.church));

    const totalIncome = income.reduce((s, r) => s + r.amount, 0);
    const totalExpenditure = expenditure.reduce((s, r) => s + r.amount, 0);

    res.status(200).json({
      date,
      scope: localChurch ? 'church' : 'parish',
      income,
      expenditure,
      byChurch,
      totals: { income: totalIncome, expenditure: totalExpenditure, net: totalIncome - totalExpenditure },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Parish overview: per-child-church stats plus consolidated roll-ups, in a single call.
// Powers the parish (consolidated) dashboard.
exports.getParishOverview = async (req, res) => {
  try {
    const tenantId = new mongoose.Types.ObjectId(req.user.tenantId);
    const tenantStr = req.user.tenantId;
    const year = Number(req.query.year) || new Date().getFullYear();

    const groupByChurch = (extraMatch = {}) => [
      { $match: { tenantId, ...extraMatch } },
      { $group: { _id: '$localChurch', total: { $sum: '$amount' } } },
    ];

    const quotaVh = await Votehead.findOne({ tenantId: tenantStr, name: 'Parish Quota' }).select('_id');

    // Income/expenditure by calendar month of the record's date, for the year.
    const byMonth = () => [
      { $match: { tenantId, year } },
      { $group: { _id: { $month: '$date' }, total: { $sum: '$amount' } } },
    ];

    const [churches, incYear, expYear, incAll, expAll, quotaAgg, budgets, incMonthly, expMonthly] = await Promise.all([
      LocalChurch.find({ tenantId: tenantStr, isActive: true }).select('name').sort({ name: 1 }),
      Income.aggregate(groupByChurch({ year })),
      Expenditure.aggregate(groupByChurch({ year })),
      Income.aggregate(groupByChurch()),        // all-time (for running cash)
      Expenditure.aggregate(groupByChurch()),   // all-time
      quotaVh
        ? Expenditure.aggregate(groupByChurch({ year, votehead: quotaVh._id }))
        : Promise.resolve([]),
      Budget.find({ tenantId: tenantStr, year, localChurch: null }), // parish-level budgets
      Income.aggregate(byMonth()),
      Expenditure.aggregate(byMonth()),
    ]);

    const toMap = (agg) => {
      const m = {};
      agg.forEach((a) => { m[a._id ? String(a._id) : 'general'] = a.total; });
      return m;
    };
    const incY = toMap(incYear), expY = toMap(expYear), incA = toMap(incAll), expA = toMap(expAll), quotaM = toMap(quotaAgg);

    const churchRows = churches.map((c) => {
      const id = String(c._id);
      const income = incY[id] || 0;
      const expenditure = expY[id] || 0;
      const cash = (incA[id] || 0) - (expA[id] || 0); // running balance (all-time in − out)
      return { id, name: c.name, income, expenditure, net: income - expenditure, cash, quota: quotaM[id] || 0 };
    });

    // Money not tagged to any church (parish-general)
    const generalIncome = incY.general || 0;
    const generalExpenditure = expY.general || 0;
    const generalCash = (incA.general || 0) - (expA.general || 0);

    const incomeActual = Object.values(incY).reduce((s, v) => s + v, 0);
    const expenseActual = Object.values(expY).reduce((s, v) => s + v, 0);
    let incomeBudget = 0, expenseBudget = 0;
    budgets.forEach((b) => { if (b.kind === 'income') incomeBudget += b.amount; else expenseBudget += b.amount; });

    // Parish-quota annual target = the parish-level expense budget on the Parish Quota votehead.
    let quotaTarget = 0;
    if (quotaVh) {
      const qb = budgets.find((b) => b.kind === 'expense' && String(b.votehead) === String(quotaVh._id));
      if (qb) quotaTarget = qb.amount;
    }

    // 12-month trend (parish-wide), months 1-12 → Jan..Dec
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthMap = (agg) => { const mm = {}; agg.forEach((a) => { mm[a._id] = a.total; }); return mm; };
    const imMonth = monthMap(incMonthly), emMonth = monthMap(expMonthly);
    const monthly = MONTHS.map((name, i) => ({ month: name, income: imMonth[i + 1] || 0, expenditure: emMonth[i + 1] || 0 }));

    res.status(200).json({
      year,
      churches: churchRows,
      parishGeneral: { income: generalIncome, expenditure: generalExpenditure, net: generalIncome - generalExpenditure, cash: generalCash },
      totals: {
        income: incomeActual,
        expenditure: expenseActual,
        net: incomeActual - expenseActual,
        cash: churchRows.reduce((s, c) => s + c.cash, 0) + generalCash,
      },
      budget: { incomeBudget, incomeActual, expenseBudget, expenseActual },
      monthly,
      quotaTracked: Boolean(quotaVh),
      quotaTarget,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
