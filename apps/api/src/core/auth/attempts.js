'use strict';
// B1: pencatatan percobaan masuk ke log audit tenant (aksi 'login', resource 'auth.attempt').
// Hanya kejadian yang terikat tenant yang dikenal yang dicatat (audit_logs.tenant_id wajib, tabel append-only),
// supaya orang tanpa akun tidak bisa menambah baris permanen ke audit tenant mana pun.
// Best-effort: kegagalan menulis audit tidak mengubah jawaban login (tetap 401/202), hanya ditulis ke log proses.

function createAttemptLog(audit, { logger = console } = {}) {
  return {
    /** who: user ({ id, tenantId, role }) atau { tenantId } saja (mis. SSO sebelum akun dikenal). */
    async record(who, meta) {
      if (!who || !who.tenantId) return;
      try {
        await audit.record({ tenantId: who.tenantId, user: who.id ? who : null }, 'login', 'auth.attempt', meta);
      } catch (e) {
        logger.error(`Audit percobaan masuk gagal ditulis: ${e.message}`);
      }
    },
  };
}

module.exports = { createAttemptLog };
