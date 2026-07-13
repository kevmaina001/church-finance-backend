const Account = require('../models/Account');
const RevenueSource = require('../models/RevenueSource');
const Votehead = require('../models/Votehead');
const LocalChurch = require('../models/LocalChurch');
const Income = require('../models/Income');
const Expenditure = require('../models/Expenditure');
const JournalEntry = require('../models/JournalEntry');
const Budget = require('../models/Budget');

// Seed a brand-new tenant with a usable starter setup plus demonstration data:
// a chart of accounts, two local churches, income/expenditure categories, a year of
// sample transactions across months and churches, a parish budget, and a parish-quota
// target. Everything is tagged "(demo)" so it can be cleared before going live.
async function seedTenant(tenantId) {
  const ACCOUNTS = [
    ['1000', 'Cash at Hand', 'asset'],
    ['1010', 'Bank Account', 'asset'],
    ['3000', 'General Fund', 'equity'],
    ['3010', 'Building Fund', 'equity'],
    ['4000', 'Tithes', 'revenue'],
    ['4010', 'Offerings', 'revenue'],
    ['4020', 'Thanksgiving', 'revenue'],
    ['4040', 'Donations', 'revenue'],
    ['4080', 'Fundraising', 'revenue'],
    ['5010', 'Staff Salaries', 'expense'],
    ['5030', 'Electricity and Water', 'expense'],
    ['5060', 'Repairs and Maintenance', 'expense'],
    ['5100', 'Bank Charges', 'expense'],
    ['5120', 'Welfare / Charity', 'expense'],
    ['5150', 'Parish Quota', 'expense'],
  ];
  const acc = {};
  for (const [code, name, type] of ACCOUNTS) {
    acc[code] = await Account.create({ code, name, type, isActive: true, tenantId });
  }

  const churches = [];
  for (const name of ["St. Peter's Church (demo)", "St. Mark's Church (demo)"]) {
    churches.push(await LocalChurch.create({ name, description: 'Demonstration church', isActive: true, tenantId }));
  }

  // Category → account, keeping a direct id map for the journal legs.
  const rs = {}, rsAccount = {};
  for (const [name, code] of [['Tithe', '4000'], ['Offerings', '4010'], ['Thanksgiving', '4020'], ['Donations', '4040'], ['Fundraising', '4080']]) {
    rs[name] = await RevenueSource.create({ name, description: `Income: ${name}`, account: acc[code]._id, tenantId });
    rsAccount[String(rs[name]._id)] = acc[code]._id;
  }
  const vh = {}, vhAccount = {};
  for (const [name, code] of [['Staff Salaries', '5010'], ['Electricity and Water', '5030'], ['Maintenance', '5060'], ['Bank Charges', '5100'], ['Welfare', '5120'], ['Parish Quota', '5150']]) {
    vh[name] = await Votehead.create({ name, description: `Votehead: ${name}`, account: acc[code]._id, tenantId });
    vhAccount[String(vh[name]._id)] = acc[code]._id;
  }

  const year = new Date().getFullYear();
  const uptoMonth = new Date().getMonth(); // 0-based; seed Jan..current month
  const rnd = (min, max) => Math.round((min + Math.random() * (max - min)) / 100) * 100;
  const QUOTA_TARGET_PER_CHURCH = 240000; // annual (20k/month)

  const incomes = [];
  const expenditures = [];
  for (let m = 0; m <= uptoMonth; m++) {
    const date = new Date(year, m, 15);
    churches.forEach((church, ci) => {
      const asset = ci === 0 ? acc['1000']._id : acc['1010']._id;
      const base = ci === 0 ? 1 : 1.4;
      const push = (arr, row) => arr.push({ ...row, date, year, user: 'System (demo)', localChurch: church._id, assetAccount: asset, tenantId });

      push(incomes, { revenueSource: rs['Tithe']._id, amount: rnd(9000, 16000) * base, description: 'Sunday tithe (demo)' });
      push(incomes, { revenueSource: rs['Offerings']._id, amount: rnd(5000, 9000) * base, description: 'Weekly offerings (demo)' });
      if (m % 2 === 0) push(incomes, { revenueSource: rs['Thanksgiving']._id, amount: rnd(4000, 12000) * base, description: 'Thanksgiving (demo)' });
      if (m % 3 === 0) push(incomes, { revenueSource: rs['Fundraising']._id, amount: rnd(15000, 40000) * base, description: 'Harambee (demo)' });

      push(expenditures, { votehead: vh['Staff Salaries']._id, amount: rnd(6000, 9000) * base, description: 'Monthly stipend (demo)' });
      push(expenditures, { votehead: vh['Electricity and Water']._id, amount: rnd(1500, 4000), description: 'Utilities (demo)' });
      push(expenditures, { votehead: vh['Parish Quota']._id, amount: 20000, description: 'Monthly parish quota (demo)' });
      if (m % 2 === 1) push(expenditures, { votehead: vh['Maintenance']._id, amount: rnd(2000, 8000), description: 'Repairs (demo)' });
    });
  }

  const incDocs = await Income.insertMany(incomes);
  const expDocs = await Expenditure.insertMany(expenditures);

  const journals = [];
  for (const i of incDocs) {
    journals.push({
      date: i.date, reference: `INC-${i._id}`, description: i.description,
      entries: [
        { account: i.assetAccount, debit: i.amount, credit: 0, description: 'Income received' },
        { account: rsAccount[String(i.revenueSource)], debit: 0, credit: i.amount, description: 'Income recognized' },
      ],
      totalDebit: i.amount, totalCredit: i.amount, status: 'posted', createdBy: 'System (demo)', localChurch: i.localChurch, tenantId,
    });
  }
  for (const e of expDocs) {
    journals.push({
      date: e.date, reference: `EXP-${e._id}`, description: e.description,
      entries: [
        { account: vhAccount[String(e.votehead)], debit: e.amount, credit: 0, description: 'Expense incurred' },
        { account: e.assetAccount, debit: 0, credit: e.amount, description: 'Asset paid out' },
      ],
      totalDebit: e.amount, totalCredit: e.amount, status: 'posted', createdBy: 'System (demo)', localChurch: e.localChurch, tenantId,
    });
  }
  await JournalEntry.insertMany(journals);

  // Parish budget, incl. the parish-quota annual target (expense budget on Parish Quota).
  await Budget.insertMany([
    { kind: 'income', revenueSource: rs['Tithe']._id, amount: 300000 },
    { kind: 'income', revenueSource: rs['Offerings']._id, amount: 180000 },
    { kind: 'income', revenueSource: rs['Fundraising']._id, amount: 250000 },
    { kind: 'expense', votehead: vh['Staff Salaries']._id, amount: 200000 },
    { kind: 'expense', votehead: vh['Parish Quota']._id, amount: QUOTA_TARGET_PER_CHURCH * churches.length },
  ].map((b) => ({ ...b, year, localChurch: null, tenantId })));

  return { churches: churches.length, incomes: incDocs.length, expenditures: expDocs.length };
}

module.exports = seedTenant;
