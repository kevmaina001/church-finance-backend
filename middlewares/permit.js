const { isReadOnly, isParishLevel, canManageUsers } = require('../utils/permissions');

// Block view-only users (Member) from any mutating route.
const requireWrite = (req, res, next) => {
  if (isReadOnly(req.user)) {
    return res.status(403).json({ message: 'Your role is view-only and cannot make changes.' });
  }
  next();
};

// Only parish-level users (admin, vicar, parish treasurer/secretary) — used for
// parish-wide setup (accounts, categories, churches, budgets, funds).
const requireParishLevel = (req, res, next) => {
  if (!isParishLevel(req.user)) {
    return res.status(403).json({ message: 'Only parish-level roles can change parish-wide settings.' });
  }
  next();
};

// User management is limited to admin, vicar, and the parish treasurer.
const requireUserManagement = (req, res, next) => {
  if (!canManageUsers(req.user)) {
    return res.status(403).json({ message: 'You do not have permission to manage users.' });
  }
  next();
};

module.exports = { requireWrite, requireParishLevel, requireUserManagement };
