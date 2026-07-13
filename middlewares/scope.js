const { lockedChurch } = require('../utils/permissions');

// Church-scoped users (a Treasurer/Secretary tied to a local church) may only ever READ
// their own church's data. This forces the localChurch query param to their church,
// overriding whatever the client sent. No-op for parish-level users and Members.
const forceReadScope = (req, res, next) => {
  const church = lockedChurch(req.user);
  if (church) req.query.localChurch = church;
  next();
};

// Block church-scoped users from consolidated / parish-only endpoints entirely.
const parishScopeOnly = (req, res, next) => {
  if (lockedChurch(req.user)) {
    return res.status(403).json({ message: 'The consolidated parish view is available to parish-level roles only.' });
  }
  next();
};

module.exports = { forceReadScope, parishScopeOnly };
