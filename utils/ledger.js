// Pure ledger math — no database access, so it can be unit-tested directly.
// A journal entry looks like: { entries: [{ account, debit, credit }, ...] }
// where `account` may be an ObjectId or a populated document.

// Sum all debits and credits posted to one account across journal entries.
function sumForAccount(accountId, journalEntries) {
  let debit = 0;
  let credit = 0;
  for (const entry of journalEntries) {
    for (const line of entry.entries) {
      const lineAccount = line.account && (line.account._id || line.account);
      if (String(lineAccount) === String(accountId)) {
        debit += line.debit || 0;
        credit += line.credit || 0;
      }
    }
  }
  return { debit, credit };
}

// Normal-balance sign: assets & expenses are debit-normal (debit - credit);
// liabilities, equity & revenue are credit-normal (credit - debit).
function normalBalance(type, debit, credit) {
  if (type === 'asset' || type === 'expense') return debit - credit;
  return credit - debit;
}

// Signed balance of a single account, honouring its normal balance.
function accountBalance(account, journalEntries) {
  const { debit, credit } = sumForAccount(account._id, journalEntries);
  return normalBalance(account.type, debit, credit);
}

// Trial balance: one row per account with its total debit and credit.
function computeTrialBalance(accounts, journalEntries) {
  return accounts.map((account) => {
    const { debit, credit } = sumForAccount(account._id, journalEntries);
    return { accountCode: account.code, accountName: account.name, debit, credit };
  });
}

module.exports = { sumForAccount, normalBalance, accountBalance, computeTrialBalance };
