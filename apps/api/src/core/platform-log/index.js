'use strict';
// B12: log audit platform. Mencatat tindakan Super Admin yang tidak milik satu tenant atau menyentuh tenant lain
// (CONTEXT.md "Log audit platform"). Gagal mencatat = tindakan gagal (R2-2), kecuali hitungan percobaan (best-effort).
const { insertSql } = require('./store');

/** entry = { actor: { userId, tenantId }, action: 'create'|'update', resource, targetTenantId?, meta? } */
function createPlatformLog({ store }) {
  return {
    record: (entry, { transaction } = {}) => store.insert(entry, { transaction }),
    insertSql,
    /** Tidak ditunggu dan tidak pernah melempar: serangan tidak boleh membuat login antre atau gagal. */
    countAttempt(outcome) {
      Promise.resolve().then(() => store.countAttempt(outcome)).catch(() => {});
    },
    recent: (limit) => store.recent(limit),
    attemptsByDay: (days) => store.attemptsByDay(days),
  };
}

module.exports = { createPlatformLog };
