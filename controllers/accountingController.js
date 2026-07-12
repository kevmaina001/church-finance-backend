const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const Income = require('../models/Income');
const Expenditure = require('../models/Expenditure');
const Balance = require('../models/Balance');
const { computeTrialBalance, accountBalance } = require('../utils/ledger');

// Get Trial Balance
exports.getTrialBalance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { tenantId } = req.user;
    const query = { tenantId };
    
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (req.query.localChurch) query.localChurch = req.query.localChurch;
    const accounts = await Account.find({ isActive: true, tenantId });
    const journalEntries = await JournalEntry.find({
      ...query,
      status: 'posted'
    }).populate('entries.account');

    const trialBalance = computeTrialBalance(accounts, journalEntries);

    res.status(200).json({ trialBalance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Income and Expenditure Statement
exports.getIncomeExpenditureStatement = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { tenantId } = req.user;
    const query = { tenantId };
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    if (req.query.localChurch) query.localChurch = req.query.localChurch;
    const revenueAccounts = await Account.find({ type: 'revenue', isActive: true, tenantId });
    const expenseAccounts = await Account.find({ type: 'expense', isActive: true, tenantId });
    const journalEntries = await JournalEntry.find({
      ...query,
      status: 'posted'
    }).populate('entries.account');
    const revenue = revenueAccounts.map(account => {
      let total = 0;
      journalEntries.forEach(entry => {
        entry.entries.forEach(line => {
          if (line.account._id.toString() === account._id.toString()) {
            total += line.credit - line.debit;
          }
        });
      });
      return {
        accountName: account.name,
        amount: total
      };
    });
    const expenses = expenseAccounts.map(account => {
      let total = 0;
      journalEntries.forEach(entry => {
        entry.entries.forEach(line => {
          if (line.account._id.toString() === account._id.toString()) {
            total += line.debit - line.credit;
          }
        });
      });
      return {
        accountName: account.name,
        amount: total
      };
    });
    const totalRevenue = revenue.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
    const netIncome = totalRevenue - totalExpenses;
    res.status(200).json({
      revenue: revenue || [],
      expenses: expenses || [],
      totalRevenue: totalRevenue || 0,
      totalExpenses: totalExpenses || 0,
      netIncome: netIncome || 0
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to generate Income & Expenditure Statement.' });
  }
};

// Get Balance Sheet
exports.getBalanceSheet = async (req, res) => {
  try {
    const { tenantId } = req.user;
    // Include ALL accounts (not just active) so the sheet reflects every balance and stays balanced.
    const assets = await Account.find({ type: 'asset', tenantId });
    const liabilities = await Account.find({ type: 'liability', tenantId });
    const equity = await Account.find({ type: 'equity', tenantId });
    const jeFilter = { status: 'posted', tenantId };
    if (req.query.localChurch) jeFilter.localChurch = req.query.localChurch;
    const journalEntries = await JournalEntry.find(jeFilter).populate('entries.account');

    const calculateBalance = (accounts) =>
      accounts.map(account => ({
        accountName: account.name,
        balance: accountBalance(account, journalEntries),
      }));

    const assetsBalance = calculateBalance(assets);
    const liabilitiesBalance = calculateBalance(liabilities);
    const equityBalance = calculateBalance(equity);

    // Revenue and expense are temporary accounts; their net (surplus/deficit) belongs to
    // the accumulated fund. Closing it into equity is what makes Assets = Liabilities + Equity.
    let netSurplus = 0;
    journalEntries.forEach(entry => {
      entry.entries.forEach(line => {
        const type = line.account && line.account.type;
        if (type === 'revenue') netSurplus += (line.credit - line.debit);
        else if (type === 'expense') netSurplus -= (line.debit - line.credit);
      });
    });
    equityBalance.push({ accountName: 'Accumulated Surplus/(Deficit)', balance: netSurplus });

    const totalAssets = assetsBalance.reduce((sum, item) => sum + item.balance, 0);
    const totalLiabilities = liabilitiesBalance.reduce((sum, item) => sum + item.balance, 0);
    const totalEquity = equityBalance.reduce((sum, item) => sum + item.balance, 0);
    const difference = Number((totalAssets - (totalLiabilities + totalEquity)).toFixed(2));

    // Hide zero-balance account rows for readability (totals are unaffected); always keep the surplus line.
    const nonZero = (rows) => rows.filter(r => Math.abs(r.balance) > 0.005);

    res.status(200).json({
      assets: nonZero(assetsBalance),
      liabilities: nonZero(liabilitiesBalance),
      equity: nonZero(equityBalance.slice(0, -1)).concat(equityBalance.slice(-1)),
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: Math.abs(difference) < 0.01,
      difference
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Cash Flow Statement.
// For every entry that moves cash/bank, the movement is classified by the type of the
// counterpart account: revenue/expense -> operating, other assets -> investing,
// liabilities/equity -> financing.
exports.getCashFlowStatement = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { tenantId } = req.user;
    const query = { status: 'posted', tenantId };
    if (req.query.localChurch) query.localChurch = req.query.localChurch;
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Money accounts = cash & bank (asset codes 1000-1099)
    const moneyAccounts = await Account.find({ type: 'asset', tenantId, code: /^10/ });
    if (moneyAccounts.length === 0) {
      return res.status(404).json({ message: 'No cash/bank account found. Please set up a Cash or Bank account (code 1000-1099).' });
    }
    const moneyIds = new Set(moneyAccounts.map(a => String(a._id)));

    const journalEntries = await JournalEntry.find(query).populate('entries.account').sort({ date: 1 });

    const classify = (type) => {
      if (type === 'revenue' || type === 'expense') return 'operating';
      if (type === 'asset') return 'investing';
      if (type === 'liability' || type === 'equity') return 'financing';
      return 'operating';
    };

    const operatingActivities = [];
    const investingActivities = [];
    const financingActivities = [];

    for (const entry of journalEntries) {
      let cashDelta = 0;
      const counterpartLines = [];
      for (const line of entry.entries) {
        const accId = line.account && String(line.account._id || line.account);
        if (accId && moneyIds.has(accId)) {
          cashDelta += (line.debit || 0) - (line.credit || 0);
        } else if (line.account) {
          counterpartLines.push(line);
        }
      }
      if (cashDelta === 0) continue; // entry doesn't affect cash

      // Classify by the largest counterpart line
      let category = 'operating';
      if (counterpartLines.length) {
        const primary = counterpartLines.reduce((a, b) =>
          ((b.debit || 0) + (b.credit || 0)) > ((a.debit || 0) + (a.credit || 0)) ? b : a
        );
        category = classify(primary.account.type);
      }

      const flow = {
        date: entry.date,
        description: entry.description,
        amount: cashDelta,
        type: cashDelta > 0 ? 'inflow' : 'outflow',
      };
      if (category === 'investing') investingActivities.push(flow);
      else if (category === 'financing') financingActivities.push(flow);
      else operatingActivities.push(flow);
    }

    const sum = (arr) => arr.reduce((s, f) => s + f.amount, 0);
    const netOperating = sum(operatingActivities);
    const netInvesting = sum(investingActivities);
    const netFinancing = sum(financingActivities);

    res.status(200).json({
      operatingActivities,
      investingActivities,
      financingActivities,
      netOperating,
      netInvesting,
      netFinancing,
      netCashFlow: netOperating + netInvesting + netFinancing,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to generate Cash Flow Statement.' });
  }
};

// Get General Ledger
exports.getGeneralLedger = async (req, res) => {
  try {
    const { startDate, endDate, accountId } = req.query;
    const { tenantId } = req.user;
    const query = { status: 'posted', tenantId };
    
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (accountId) {
      query['entries.account'] = accountId;
    }
    if (req.query.localChurch) query.localChurch = req.query.localChurch;

    const journalEntries = await JournalEntry.find(query)
      .populate('entries.account')
      .sort({ date: 1 });

    const ledger = journalEntries.map(entry => ({
      date: entry.date,
      reference: entry.reference,
      description: entry.description,
      entries: entry.entries.map(line => ({
        accountCode: line.account.code,
        accountName: line.account.name,
        debit: line.debit,
        credit: line.credit,
        description: line.description
      }))
    }));

    res.status(200).json({ ledger });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Account Statement
exports.getAccountStatement = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { startDate, endDate } = req.query;
    const { tenantId } = req.user;

    const account = await Account.findOne({ _id: accountId, tenantId });
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const query = {
      status: 'posted',
      tenantId,
      'entries.account': accountId
    };
    if (req.query.localChurch) query.localChurch = req.query.localChurch;

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const journalEntries = await JournalEntry.find(query)
      .populate('entries.account')
      .sort({ date: 1 });

    let runningBalance = 0;
    const statement = journalEntries.map(entry => {
      const accountEntry = entry.entries.find(line => 
        line.account._id.toString() === accountId
      );

      if (accountEntry) {
        if (account.type === 'asset' || account.type === 'expense') {
          runningBalance += accountEntry.debit - accountEntry.credit;
        } else {
          runningBalance += accountEntry.credit - accountEntry.debit;
        }

        return {
          date: entry.date,
          reference: entry.reference,
          description: entry.description,
          debit: accountEntry.debit,
          credit: accountEntry.credit,
          balance: runningBalance
        };
      }
      return null;
    }).filter(Boolean);

    res.status(200).json({
      accountCode: account.code,
      accountName: account.name,
      accountType: account.type,
      statement
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Equity Statement
exports.getEquityStatement = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { tenantId } = req.user;
    const query = { status: 'posted', tenantId };
    if (req.query.localChurch) query.localChurch = req.query.localChurch;
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    const equityAccounts = await Account.find({ type: 'equity', isActive: true, tenantId });
    // Opening balance: sum of all entries before startDate
    let openingBalances = {};
    if (startDate) {
      const openingFilter = { date: { $lt: new Date(startDate) }, status: 'posted', tenantId };
      if (req.query.localChurch) openingFilter.localChurch = req.query.localChurch;
      const openingEntries = await JournalEntry.find(openingFilter).populate('entries.account');
      equityAccounts.forEach(account => {
        let balance = 0;
        openingEntries.forEach(entry => {
          entry.entries.forEach(line => {
            if (line.account._id.toString() === account._id.toString()) {
              balance += line.credit - line.debit;
            }
          });
        });
        openingBalances[account._id] = balance;
      });
    }
    // Movements in period
    const periodEntries = await JournalEntry.find(query).populate('entries.account');
    const statement = equityAccounts.map(account => {
      let additions = 0;
      let withdrawals = 0;
      periodEntries.forEach(entry => {
        entry.entries.forEach(line => {
          if (line.account._id.toString() === account._id.toString()) {
            const net = line.credit - line.debit;
            if (net > 0) additions += net;
            if (net < 0) withdrawals += Math.abs(net);
          }
        });
      });
      const opening = openingBalances[account._id] || 0;
      const closing = opening + additions - withdrawals;
      return {
        accountName: account.name,
        opening,
        additions,
        withdrawals,
        closing
      };
    });
    res.status(200).json({ statement });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to generate Equity Statement.' });
  }
}; 