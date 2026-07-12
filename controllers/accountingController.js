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
    const assets = await Account.find({ type: 'asset', isActive: true, tenantId });
    const liabilities = await Account.find({ type: 'liability', isActive: true, tenantId });
    const equity = await Account.find({ type: 'equity', isActive: true, tenantId });
    const journalEntries = await JournalEntry.find({ status: 'posted', tenantId }).populate('entries.account');

    const calculateBalance = (accounts) =>
      accounts.map(account => ({
        accountName: account.name,
        balance: accountBalance(account, journalEntries),
      }));

    const assetsBalance = calculateBalance(assets);
    const liabilitiesBalance = calculateBalance(liabilities);
    const equityBalance = calculateBalance(equity);

    const totalAssets = assetsBalance.reduce((sum, item) => sum + item.balance, 0);
    const totalLiabilities = liabilitiesBalance.reduce((sum, item) => sum + item.balance, 0);
    const totalEquity = equityBalance.reduce((sum, item) => sum + item.balance, 0);

    res.status(200).json({
      assets: assetsBalance,
      liabilities: liabilitiesBalance,
      equity: equityBalance,
      totalAssets,
      totalLiabilities,
      totalEquity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Cash Flow Statement
exports.getCashFlowStatement = async (req, res) => {
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
    let cashAccount = await Account.findOne({ name: 'Cash', isActive: true, tenantId });
    if (!cashAccount) {
      // Fallback: find any asset account with 'cash' in the name
      cashAccount = await Account.findOne({ type: 'asset', name: /cash/i, isActive: true, tenantId });
    }
    if (!cashAccount) {
      return res.status(404).json({ message: 'Cash account not found. Please ensure you have a cash account.' });
    }
    const journalEntries = await JournalEntry.find({
      ...query,
      status: 'posted'
    }).populate('entries.account');
    const cashFlows = journalEntries.map(entry => {
      const cashEntry = entry.entries.find(line =>
        line.account._id.toString() === cashAccount._id.toString()
      );
      if (cashEntry) {
        return {
          date: entry.date,
          description: entry.description,
          amount: cashEntry.debit - cashEntry.credit,
          type: cashEntry.debit > cashEntry.credit ? 'inflow' : 'outflow'
        };
      }
      return null;
    }).filter(Boolean);
    const operatingActivities = cashFlows.filter(flow =>
      flow.description && flow.description.toLowerCase().includes('operating')
    );
    const investingActivities = cashFlows.filter(flow =>
      flow.description && flow.description.toLowerCase().includes('investing')
    );
    const financingActivities = cashFlows.filter(flow =>
      flow.description && flow.description.toLowerCase().includes('financing')
    );
    const netCashFlow = cashFlows.reduce((sum, flow) => sum + flow.amount, 0);
    res.status(200).json({
      operatingActivities: operatingActivities || [],
      investingActivities: investingActivities || [],
      financingActivities: financingActivities || [],
      netCashFlow: netCashFlow || 0
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
      const openingEntries = await JournalEntry.find({
        date: { $lt: new Date(startDate) },
        status: 'posted',
        tenantId
      }).populate('entries.account');
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