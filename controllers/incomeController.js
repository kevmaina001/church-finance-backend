const mongoose = require('mongoose');
const Income = require('../models/Income');
const RevenueSource = require('../models/RevenueSource');
const JournalEntry = require('../models/JournalEntry');

// Build the balanced double-entry lines for an income:
//   debit the Cash/Bank (asset) account, credit the Revenue account.
function buildIncomeEntries(assetAccount, revenueAccount, amount) {
  return {
    entries: [
      { account: assetAccount, debit: amount, credit: 0, description: 'Income received' },
      { account: revenueAccount, debit: 0, credit: amount, description: 'Income recognized' },
    ],
    totalDebit: amount,
    totalCredit: amount,
  };
}

exports.addIncome = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    if (!req.user) return res.status(401).json({ message: 'User not authenticated' });
    const { revenueSource, amount, description, year, assetAccount, localChurch, member, fund } = req.body;
    const tenantId = req.user.tenantId;
    const user = req.user.name;

    // Resolve the revenue account this source posts to (read-only, before the transaction)
    const revenueSourceDoc = await RevenueSource.findOne({ _id: revenueSource, tenantId }).populate('account');
    if (!revenueSourceDoc || !revenueSourceDoc.account) {
      return res.status(400).json({ message: 'Revenue source is not linked to a revenue account.' });
    }

    let savedIncome;
    await session.withTransaction(async () => {
      const [income] = await Income.create([{
        revenueSource, amount, description, year, user, assetAccount,
        localChurch: localChurch || undefined, member: member || undefined, fund: fund || undefined, tenantId,
      }], { session });
      savedIncome = income;

      const { entries, totalDebit, totalCredit } = buildIncomeEntries(assetAccount, revenueSourceDoc.account._id, amount);
      await JournalEntry.create([{
        date: income.date,
        reference: `INC-${income._id}`,
        description: description || `Income for ${revenueSourceDoc.name}`,
        entries, totalDebit, totalCredit,
        status: 'posted', createdBy: user, tenantId,
        localChurch: localChurch || undefined,
      }], { session });
    });

    res.status(201).json({ message: 'Income added successfully', income: savedIncome });
  } catch (error) {
    console.error('Error in addIncome:', error.message);
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

exports.getIncomes = async (req, res) => {
  try {
    const filter = { tenantId: req.user.tenantId };
    // Optional filter by local church (?localChurch=<id>)
    if (req.query.localChurch) {
      filter.localChurch = req.query.localChurch;
    }
    if (req.query.member) {
      filter.member = req.query.member;
    }
    const incomes = await Income.find(filter)
      .populate('revenueSource', 'name')
      .populate({ path: 'localChurch', select: 'name', options: { strictPopulate: false } })
      .populate({ path: 'member', select: 'name', options: { strictPopulate: false } })
      .populate({ path: 'fund', select: 'name', options: { strictPopulate: false } });
    res.status(200).json({ incomes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateIncome = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized. User not authenticated.' });
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    const income = await Income.findOne({ _id: id, tenantId });
    if (!income) return res.status(404).json({ message: 'Income not found' });

    // Only these fields may be updated (prevents mass-assignment of tenantId etc.)
    const { revenueSource, amount, description, year, assetAccount, localChurch, member, fund, date } = req.body;
    if (revenueSource !== undefined) income.revenueSource = revenueSource;
    if (amount !== undefined) income.amount = amount;
    if (description !== undefined) income.description = description;
    if (year !== undefined) income.year = year;
    if (assetAccount !== undefined) income.assetAccount = assetAccount;
    if (localChurch !== undefined) income.localChurch = localChurch || undefined;
    if (member !== undefined) income.member = member || undefined;
    if (fund !== undefined) income.fund = fund || undefined;
    if (date !== undefined) income.date = date;
    income.user = req.user.name;

    const revenueSourceDoc = await RevenueSource.findOne({ _id: income.revenueSource, tenantId }).populate('account');
    if (!revenueSourceDoc || !revenueSourceDoc.account) {
      return res.status(400).json({ message: 'Revenue source is not linked to a revenue account.' });
    }

    let updated;
    await session.withTransaction(async () => {
      updated = await income.save({ session });
      // Keep the linked journal entry in sync (upsert covers legacy rows with no entry yet)
      const { entries, totalDebit, totalCredit } = buildIncomeEntries(income.assetAccount, revenueSourceDoc.account._id, income.amount);
      await JournalEntry.findOneAndUpdate(
        { reference: `INC-${income._id}`, tenantId },
        {
          $set: {
            date: income.date,
            description: income.description || `Income for ${revenueSourceDoc.name}`,
            entries, totalDebit, totalCredit, updatedAt: new Date(),
            localChurch: income.localChurch || undefined,
          },
          $setOnInsert: { status: 'posted', createdBy: req.user.name },
        },
        { session, upsert: true }
      );
    });

    res.status(200).json({ message: 'Income updated successfully', updatedIncome: updated });
  } catch (error) {
    console.error('Error in updateIncome:', error.message);
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

exports.deleteIncome = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    let deletedIncome;
    await session.withTransaction(async () => {
      deletedIncome = await Income.findOneAndDelete({ _id: id, tenantId }, { session });
      if (deletedIncome) {
        // Remove the linked journal entry so the ledger stays consistent
        await JournalEntry.deleteOne({ reference: `INC-${id}`, tenantId }, { session });
      }
    });

    if (!deletedIncome) return res.status(404).json({ message: 'Income not found' });
    res.status(200).json({ message: 'Income deleted successfully', deletedIncome });
  } catch (error) {
    console.error('Error in deleteIncome:', error.message);
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};
