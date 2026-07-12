const Tenant = require('../models/Tenant');

// Get Tenant by ID
exports.getTenantById = async (req, res) => {
  try {
    // A user may only read their own tenant
    if (String(req.user.tenantId) !== String(req.params.id)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    res.json(tenant);
  } catch (error) {
    console.error('Error fetching tenant:', error);
    res.status(500).json({ message: 'Server error' });
  }
}; 