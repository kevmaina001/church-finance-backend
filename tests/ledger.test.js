const { sumForAccount, normalBalance, accountBalance, computeTrialBalance } = require('../utils/ledger');

// Minimal fixtures: two income postings and one expenditure posting.
const CASH = { _id: 'cash', code: '1000', name: 'Cash at Hand', type: 'asset' };
const BANK = { _id: 'bank', code: '1010', name: 'Equity Bank', type: 'asset' };
const OFFERINGS = { _id: 'off', code: '4010', name: 'Offerings', type: 'revenue' };
const RENT = { _id: 'rent', code: '5020', name: 'Rent', type: 'expense' };

const journalEntries = [
  // Income 1000 into cash
  { entries: [
    { account: CASH, debit: 1000, credit: 0 },
    { account: OFFERINGS, debit: 0, credit: 1000 },
  ] },
  // Income 500 into bank
  { entries: [
    { account: BANK, debit: 500, credit: 0 },
    { account: OFFERINGS, debit: 0, credit: 500 },
  ] },
  // Expenditure 300 rent paid from cash
  { entries: [
    { account: RENT, debit: 300, credit: 0 },
    { account: CASH, debit: 0, credit: 300 },
  ] },
];

describe('sumForAccount', () => {
  test('aggregates debits and credits across entries', () => {
    expect(sumForAccount('cash', journalEntries)).toEqual({ debit: 1000, credit: 300 });
    expect(sumForAccount('off', journalEntries)).toEqual({ debit: 0, credit: 1500 });
  });

  test('matches when account is a populated doc or a raw id', () => {
    expect(sumForAccount(CASH._id, journalEntries).debit).toBe(1000);
  });
});

describe('normalBalance', () => {
  test('assets and expenses are debit-normal', () => {
    expect(normalBalance('asset', 1000, 300)).toBe(700);
    expect(normalBalance('expense', 300, 0)).toBe(300);
  });
  test('liabilities, equity and revenue are credit-normal', () => {
    expect(normalBalance('revenue', 0, 1500)).toBe(1500);
    expect(normalBalance('equity', 0, 200)).toBe(200);
    expect(normalBalance('liability', 0, 50)).toBe(50);
  });
});

describe('accountBalance', () => {
  test('cash = debits - credits', () => {
    expect(accountBalance(CASH, journalEntries)).toBe(700); // 1000 in - 300 out
  });
  test('bank = 500', () => {
    expect(accountBalance(BANK, journalEntries)).toBe(500);
  });
  test('revenue is positive (credit-normal)', () => {
    expect(accountBalance(OFFERINGS, journalEntries)).toBe(1500);
  });
  test('expense is positive (debit-normal)', () => {
    expect(accountBalance(RENT, journalEntries)).toBe(300);
  });
});

describe('computeTrialBalance', () => {
  const accounts = [CASH, BANK, OFFERINGS, RENT];
  const tb = computeTrialBalance(accounts, journalEntries);

  test('has one row per account', () => {
    expect(tb).toHaveLength(4);
  });

  test('total debits equal total credits (the ledger balances)', () => {
    const totalDebit = tb.reduce((s, r) => s + r.debit, 0);
    const totalCredit = tb.reduce((s, r) => s + r.credit, 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(1800); // 1000 + 500 + 300
  });
});
