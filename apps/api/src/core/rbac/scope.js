'use strict';
const { visibleEmployeeScope } = require('./index');

/** Hitung cakupan lihat data karyawan untuk request ini (RG-3). people: { directReportIds } */
async function scopeFor(req, people) {
  const reports = req.user.role === 'supervisor' ? await people.directReportIds(req.tenantId, req.user.id) : [];
  return visibleEmployeeScope(req.user, reports);
}

const inScope = (scope, userId) => scope.all || scope.userIds.includes(userId);

module.exports = { scopeFor, inScope };
