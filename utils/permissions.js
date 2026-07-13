// Central role/scope rules for the parish → local-church hierarchy.
//
// Roles:
//   Admin        - super admin, full access incl. user management
//   Vicar        - vicar in charge; full rights across the whole parish
//   Treasurer    - if parish-level (no localChurch): full parish rights; if scoped to a
//                  church: may only write that church's records
//   Secretary    - same scoping rules as Treasurer
//   Member/User  - read-only; may not modify anything
//   Special User - legacy super-user (kept for backward compatibility)

const FULL_PARISH_ROLES = ['Admin', 'Special User', 'Vicar'];
const SCOPED_ROLES = ['Treasurer', 'Secretary'];
const READ_ONLY_ROLES = ['Member', 'User'];

// Full authority over the whole parish and every local church.
function isParishLevel(user) {
  if (!user) return false;
  if (FULL_PARISH_ROLES.includes(user.role)) return true;
  // A parish-level (unscoped) treasurer/secretary has full parish authority.
  if (SCOPED_ROLES.includes(user.role) && !user.localChurch) return true;
  return false;
}

// View-only users may not modify anything.
function isReadOnly(user) {
  return !user || READ_ONLY_ROLES.includes(user.role);
}

// Can this user write a record that belongs to `targetChurchId`
// (null/undefined = parish-general)?
function canWriteChurch(user, targetChurchId) {
  if (isReadOnly(user)) return false;
  if (isParishLevel(user)) return true;
  // Church-scoped treasurer/secretary: only their own church.
  // A parish-general record (no church) counts as a parish-level change → denied.
  if (!targetChurchId) return false;
  return String(targetChurchId) === String(user.localChurch);
}

// The church a scoped user is locked to (null for parish-level users).
function lockedChurch(user) {
  if (isParishLevel(user)) return null;
  return user && user.localChurch ? String(user.localChurch) : null;
}

// Who may manage users: admin, vicar, and a parish-level treasurer.
function canManageUsers(user) {
  if (!user) return false;
  if (user.role === 'Admin' || user.role === 'Special User' || user.role === 'Vicar') return true;
  if (user.role === 'Treasurer' && !user.localChurch) return true;
  return false;
}

module.exports = {
  FULL_PARISH_ROLES,
  SCOPED_ROLES,
  READ_ONLY_ROLES,
  isParishLevel,
  isReadOnly,
  canWriteChurch,
  lockedChurch,
  canManageUsers,
};
