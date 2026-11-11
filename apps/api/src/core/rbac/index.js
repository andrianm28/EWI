'use strict';
const { forbidden, unauthorized } = require('../errors');
const { ROLES } = require('./roles');

/** Middleware: hanya role tertentu. ETA admin selalu lolos. */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === ROLES.ETA_ADMIN || roles.includes(req.user.role)) return next();
    return next(forbidden('ROLE_FORBIDDEN', 'Peran Anda tidak punya akses ke fitur ini'));
  };
}

/**
 * Cakupan data karyawan yang boleh dilihat user (RG-3).
 * Return { all: true } | { userIds: [...] }.
 */
function visibleEmployeeScope(user, directReportIds = []) {
  if ([ROLES.ETA_ADMIN, ROLES.HR_ADMIN].includes(user.role)) return { all: true };
  if (user.role === ROLES.SUPERVISOR) return { userIds: [user.id, ...directReportIds] };
  return { userIds: [user.id] };
}

module.exports = { requireRole, visibleEmployeeScope, ...require('./roles') };
