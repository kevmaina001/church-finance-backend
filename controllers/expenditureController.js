const Expenditure = require('../models/Expenditure');
const Votehead = require('../models/Votehead');
const JournalEntry = require('../models/JournalEntry');

exports.addExpenditure = async (req, res) => {
  try {
    console.log('User Object in addExpenditure:', req.user); // Debugging log for req.user

    if (!req.user) {
      throw new Error('User not authenticated'); // Explicit error if req.user is undefined
    }

    const { votehead, amount, description, year, assetAccount, date, localChurch } = req.body;
    const user = req.user.name; // Retrieve user name from req.user

    // Create a new Expenditure record, using the provided date or defaulting to now
    const expenditure = new Expenditure({ votehead, amount, description, year, user, assetAccount, localChurch: localChurch || undefined, tenantId: req.user.tenantId, date: date || new Date() });
    await expenditure.save();

    // Fetch the votehead to get the linked expense account
    const voteheadDoc = await Votehead.findOne({_id: votehead, tenantId: req.user.tenantId}).populate('account');
    if (!voteheadDoc || !voteheadDoc.account) {
      return res.status(400).json({ message: 'Votehead is not linked to an expense account.' });
    }

    // Create the journal entry
    const journalEntry = new JournalEntry({
      date: expenditure.date,
      reference: `EXP-${expenditure._id}`,
      description: description || `Expenditure for ${voteheadDoc.name}`,
      entries: [
        {
          account: voteheadDoc.account,
          debit: amount,
          credit: 0,
          description: 'Expense incurred'
        },
        {
          account: assetAccount,
          debit: 0,
          credit: amount,
          description: 'Asset paid out'
        }
      ],
      totalDebit: amount,
      totalCredit: amount,
      status: 'posted',
      createdBy: user,
      tenantId: req.user.tenantId
    });
    await journalEntry.save();

    res.status(201).json({ message: 'Expenditure added successfully', expenditure });
  } catch (error) {
    console.error('Error in addExpenditure:', error.message); // Debugging log
    res.status(500).json({ message: error.message });
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
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized. User not authenticated.' });
    }

    const updatedExpenditure = await Expenditure.findOneAndUpdate(
      { _id: id, tenantId: req.user.tenantId },
      { ...req.body, user: req.user.name }, // Update the user field
      { new: true }
    );

    if (!updatedExpenditure) return res.status(404).json({ message: 'Expenditure not found' });
    res.status(200).json({ message: 'Expenditure updated successfully', updatedExpenditure });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteExpenditure = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedExpenditure = await Expenditure.findOneAndDelete({ _id: id, tenantId: req.user.tenantId });
    if (!deletedExpenditure) return res.status(404).json({ message: 'Expenditure not found' });
    res.status(200).json({ message: 'Expenditure deleted successfully', deletedExpenditure });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
