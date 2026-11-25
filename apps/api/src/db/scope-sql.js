'use strict';
// Potongan SQL untuk cakupan visibleEmployeeScope() (RG-3, aturan 4 CLAUDE.md). Dipakai store LNA, LI, dan LD.

/** scope { all: true } = tanpa batas; { userIds } = hanya id itu (kosong = tidak ada baris). Mengisi rep.scopeIds. */
function scopeSql(column, scope, rep) {
  if (!scope || scope.all) return '';
  rep.scopeIds = scope.userIds && scope.userIds.length ? scope.userIds : ['00000000-0000-0000-0000-000000000000'];
  return ` AND ${column} IN (:scopeIds)`;
}

module.exports = { scopeSql };
