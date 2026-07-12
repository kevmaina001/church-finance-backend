const mongoose = require('mongoose');
const Expenditure = require('../models/Expenditure');
const Votehead = require('../models/Votehead');
const JournalEntry = require('../models/JournalEntry');

// Build the balanced double-entry lines for an expenditure:
//   debit the Expense account, credit the Cash/Bank (asset) account.
function buildExpenditureEntries(expenseAccount, assetAccount, amount) {
  return {
    entries: [
      { account: expenseAccount, debit: amount, credit: 0, description: 'Expense incurred' },
      { account: assetAccount, debit: 0, credit: amount, description: 'Asset paid out' },
    ],
    totalDebit: amount,
    totalCredit: amount,
  };
}

exports.addExpenditure = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    if (!req.user) return res.status(401).json({ message: 'User not authenticated' });
    const { votehead, amount, description, year, assetAccount, date, localChurch } = req.body;
    const tenantId = req.user.tenantId;
    const user = req.user.name;

    // Resolve the expense account this votehead posts to (read-only, before the transaction)
    const voteheadDoc = await Votehead.findOne({ _id: votehead, tenantId }).populate('account');
    if (!voteheadDoc || !voteheadDoc.account) {
      return res.status(400).json({ message: 'Votehead is not linked to an expense account.' });
    }

    let savedExpenditure;
    await session.withTransaction(async () => {
      const [expenditure] = await Expenditure.create([{
        votehead, amount, description, year, user, assetAccount,
        localChurch: localChurch || undefined, tenantId, date: date || new Date(),
      }], { session });
      savedExpenditure = expenditure;

      const { entries, totalDebit, totalCredit } = buildExpenditureEntries(voteheadDoc.account._id, assetAccount, amount);
      await JournalEntry.create([{
        date: expenditure.date,
        reference: `EXP-${expenditure._id}`,
        description: description || `Expenditure for ${voteheadDoc.name}`,
        entries, totalDebit, totalCredit,
        status: 'posted', createdBy: user, tenantId,
      }], { session });
    });

    res.status(201).json({ message: 'Expenditure added successfully', expenditure: savedExpenditure });
  } catch (error) {
    console.error('Error in addExpenditure:', error.message);
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

exports.getExpenditures = async (req, res) => {
  try {
    const filter = { tenantId: req.user.tenantId };
    // Optional filter by local church (?localChurch=<id>)
    if (req.query.localChurch) {
      filter.localChurch = req.query.localChurch;
    }
    const expenditures = await Expenditure.find(filter)
      .populate({ path: 'votehead', select: 'name', options: { strictPopulate: false } })
      .populate({ path: 'localChurch', select: 'name', options: { strictPopulate: false } });
    res.status(200).json({ expenditures });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateExpenditure = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized. User not authenticated.' });
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    const expenditure = await Expenditure.findOne({ _id: id, tenantId });
    if (!expenditure) return res.status(404).json({ message: 'Expenditure not found' });

    // Only these fields may be updated (prevents mass-assignment of tenantId etc.)
    const { votehead, amount, description, year, assetAccount, localChurch, date } = req.body;
    if (votehead !== undefined) expenditure.votehead = votehead;
    if (amount !== undefined) expenditure.amount = amount;
    if (description !== undefined) expenditure.description = description;
    if (year !== undefined) expenditure.year = year;
    if (assetAccount !== undefined) expenditure.assetAccount = assetAccount;
    if (localChurch !== undefined) expenditure.localChurch = localChurch || undefined;
    if (date !== undefined) expenditure.date = date;
    expenditure.user = req.user.name;

    const voteheadDoc = await Votehead.findOne({ _id: expenditure.votehead, tenantId }).populate('account');
    if (!voteheadDoc || !voteheadDoc.account) {
      return res.status(400).json({ message: 'Votehead is not linked to an expense account.' });
    }

    let updated;
    await session.withTransaction(async () => {
      updated = await expenditure.save({ session });
      // Keep the linked journal entry in sync (upsert covers legacy rows with no entry yet)
      const { entries, totalDebit, totalCredit } = buildExpenditureEntries(voteheadDoc.account._id, expenditure.assetAccount, expenditure.amount);
      await JournalEntry.findOneAndUpdate(
        { reference: `EXP-${expenditure._id}`, tenantId },
        {
          $set: {
            date: expenditure.date,
            description: expenditure.description || `Expenditure for ${voteheadDoc.name}`,
            entries, totalDebit, totalCredit, updatedAt: new Date(),
          },
          $setOnInsert: { status: 'posted', createdBy: req.user.name },
        },
        { session, upsert: true }
      );
    });

    res.status(200).json({ message: 'Expenditure updated successfully', updatedExpenditure: updated });
  } catch (error) {
    console.error('Error in updateExpenditure:', error.message);
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

exports.deleteExpenditure = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    let deletedExpenditure;
    await session.withTransaction(async () => {
      deletedExpenditure = await Expenditure.findOneAndDelete({ _id: id, tenantId }, { session });
      if (deletedExpenditure) {
        // Remove the linked journal entry so the ledger stays consistent
        await JournalEntry.deleteOne({ reference: `EXP-${id}`, tenantId }, { session });
      }
    });

    if (!deletedExpenditure) return res.status(404).json({ message: 'Expenditure not found' });
    res.status(200).json({ message: 'Expenditure deleted successfully', deletedExpenditure });
  } catch (error) {
    console.error('Error in deleteExpenditure:', error.message);
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};
