'use strict';
// B1: pencatatan percobaan masuk ke log audit tenant (aksi 'login', resource 'auth.attempt').
// Hanya kejadian yang terikat tenant yang dikenal yang dicatat (audit_logs.tenant_id wajib, tabel append-only),
// supaya orang tanpa akun tidak bisa menambah baris permanen ke audit tenant mana pun.
// B12: kejadian tanpa tenant (organisasi/akun tak dikenal, link tidak valid) hanya menaikkan hitungan per jam
// di platform_attempt_counters, tanpa email, IP, atau identitas (spek B12 §Log audit platform).
// Best-effort: kegagalan menulis tidak mengubah jawaban login (tetap 401/202), hanya ditulis ke log proses.

const PLATFORM_OUTCOMES = new Set(['unknown_org', 'unknown_account', 'invalid_link']);

function createAttemptLog(audit, { platformLog = null, logger = console } = {}) {
  const attempts = {
    /** who: user ({ id, tenantId, role }) atau { tenantId } saja (mis. SSO sebelum akun dikenal); {} = tanpa tenant. */
    async record(who, meta) {
      if (!who || !who.tenantId) {
        // countAttempt tidak ditunggu dan tidak melempar; try menjaga adapter lain yang melempar sinkron
        if (platformLog && meta && PLATFORM_OUTCOMES.has(meta.outcome)) {
          try { platformLog.countAttempt(meta.outcome); } catch (e) { logger.error(`Hitungan percobaan gagal: ${e.message}`); }
        }
        return;
      }
      try {
        await audit.record({ tenantId: who.tenantId, user: who.id ? who : null }, 'login', 'auth.attempt', meta);
      } catch (e) {
        logger.error(`Audit percobaan masuk gagal ditulis: ${e.message}`);
      }
    },
    /** Akun tidak ditemukan: bedakan organisasi tak dikenal dan akun tak dikenal (tanpa audit tenant). */
    async unknownAccount(users, slug, method) {
      let tenant = null;
      try { tenant = users.findTenantBySlug ? await users.findTenantBySlug(slug) : null; } catch { /* best-effort */ }
      await attempts.record({}, { method, outcome: tenant ? 'unknown_account' : 'unknown_org' });
    },
  };
  return attempts;
}

module.exports = { createAttemptLog };
