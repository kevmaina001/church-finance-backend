const Income = require('../models/Income');
const RevenueSource = require('../models/RevenueSource');
const JournalEntry = require('../models/JournalEntry');

exports.addIncome = async (req, res) => {
  try {
    if (!req.user) {
      throw new Error('User not authenticated');
    }
    const { revenueSource, amount, description, year, assetAccount, localChurch } = req.body;
    const user = req.user.name;
    // Save the income record
    const income = new Income({ revenueSource, amount, description, year, user, assetAccount, localChurch: localChurch || undefined, tenantId: req.user.tenantId });
    await income.save();
    // Fetch the revenue source to get the linked revenue account
    const revenueSourceDoc = await RevenueSource.findOne({_id: revenueSource, tenantId: req.user.tenantId}).populate('account');
    if (!revenueSourceDoc || !revenueSourceDoc.account) {
      return res.status(400).json({ message: 'Revenue source is not linked to a revenue account.' });
    }
    // Create the journal entry
    const journalEntry = new JournalEntry({
      date: income.date,
      reference: `INC-${income._id}`,
      description: description || `Income for ${revenueSourceDoc.name}`,
      entries: [
        {
          account: assetAccount,
          debit: amount,
          credit: 0,
          description: 'Income received'
        },
        {
          account: revenueSourceDoc.account,
          debit: 0,
          credit: amount,
          description: 'Income recognized'
        }
      ],
      totalDebit: amount,
      totalCredit: amount,
      status: 'posted',
      createdBy: user,
      tenantId: req.user.tenantId
    });
    await journalEntry.save();
    res.status(201).json({ message: 'Income added successfully', income });
  } catch (error) {
    console.error('Error in addIncome:', error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.getIncomes = async (req, res) => {
  try {
    const filter = { tenantId: req.user.tenantId };
    // Optional filter by local church (?localChurch=<id>)
    if (req.query.localChurch) {
      filter.localChurch = req.query.localChurch;
    }
    const incomes = await Income.find(filter)
      .populate('revenueSource', 'name')
      .populate({ path: 'localChurch', select: 'name', options: { strictPopulate: false } });
    res.status(200).json({ incomes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateIncome = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if the user is defined
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized. User not authenticated.' });
    }

    const updatedIncome = await Income.findOneAndUpdate(
      { _id: id, tenantId: req.user.tenantId },
      { ...req.body, user: req.user.name }, // Update the user field
      { new: true }
    );

    if (!updatedIncome) return res.status(404).json({ message: 'Income not found' });
    res.status(200).json({ message: 'Income updated successfully', updatedIncome });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteIncome = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedIncome = await Income.findOneAndDelete({ _id: id, tenantId: req.user.tenantId });
    if (!deletedIncome) return res.status(404).json({ message: 'Income not found' });
    res.status(200).json({ message: 'Income deleted successfully', deletedIncome });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
