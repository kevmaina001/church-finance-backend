const LocalChurch = require('../models/LocalChurch');

// List all local churches for the parish (tenant)
exports.getLocalChurches = async (req, res) => {
  try {
    const localChurches = await LocalChurch.find({ tenantId: req.user.tenantId }).sort({ name: 1 });
    res.status(200).json({ localChurches });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add a new local church under the parish
exports.addLocalChurch = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Church name is required' });
    }
    const localChurch = new LocalChurch({ name: name.trim(), description, tenantId: req.user.tenantId });
    await localChurch.save();
    res.status(201).json({ message: 'Local church created', localChurch });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A local church with that name already exists' });
    }
    res.status(400).json({ message: error.message });
  }
};

// Update a local church
exports.updateLocalChurch = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const localChurch = await LocalChurch.findOneAndUpdate(
      { _id: id, tenantId: req.user.tenantId },
      { ...(name !== undefined && { name: name.trim() }), ...(description !== undefined && { description }) },
      { new: true }
    );
    if (!localChurch) return res.status(404).json({ message: 'Local church not found' });
    res.status(200).json({ message: 'Local church updated', localChurch });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A local church with that name already exists' });
    }
    res.status(400).json({ message: error.message });
  }
};

// Activate/deactivate a local church
exports.toggleLocalChurchActive = async (req, res) => {
  try {
    const { id } = req.params;
    const localChurch = await LocalChurch.findOne({ _id: id, tenantId: req.user.tenantId });
    if (!localChurch) return res.status(404).json({ message: 'Local church not found' });
    localChurch.isActive = !localChurch.isActive;
    await localChurch.save();
    res.status(200).json({ message: `Local church ${localChurch.isActive ? 'activated' : 'deactivated'}`, localChurch });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
