const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const { accountBalance } = require('../utils/ledger');

// Cash/bank position is DERIVED from the ledger (single source of truth) rather than
// stored as a manually-edited number. Cash & bank are the money accounts (codes 1000-1099).
exports.getBalance = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const moneyAccounts = await Account.find({ type: 'asset', tenantId, code: /^10/ });
    const journalEntries = await JournalEntry.find({ status: 'posted', tenantId }).populate('entries.account');

    let cash = 0;
    let bank = 0;
    const accounts = moneyAccounts.map((acc) => {
      const balance = accountBalance(acc, journalEntries);
      if (/bank/i.test(acc.name)) bank += balance;
      else cash += balance;
      return { code: acc.code, name: acc.name, balance };
    });

    res.status(200).json({
      balance: { cash, bank, total: cash + bank, accounts, derivedFromLedger: true },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
