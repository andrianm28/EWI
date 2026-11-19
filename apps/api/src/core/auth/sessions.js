'use strict';
// PK-16: sesi login yang bisa dicabut. Setiap login membuat satu baris sesi; JWT membawa id sesi (sid).
// requireAuth memeriksa sesi di setiap request: dicabut, kedaluwarsa, user dinonaktifkan, atau tenant
// tidak aktif = 401. Dengan begitu "Keluar", "Keluar dari semua perangkat", dan pencabutan oleh HR
// langsung berlaku tanpa menunggu JWT habis.
const crypto = require('crypto');

/**
 * store: {
 *   create({ id, tenantId, userId, method, expiresAt, ip, userAgent }),
 *   findActive(id) -> { id, tenantId, userId } | null   (belum dicabut, belum kedaluwarsa, user & tenant aktif),
 *   revoke(id, { revokedBy, reason }) -> bool,
 *   revokeAllForUser(tenantId, userId, { revokedBy, reason, exceptId }) -> jumlah,
 *   listActiveForUser(tenantId, userId) -> [...]
 * }
 */
function createSessionService({ store, tokens }) {
  return {
    async issue(user, { method, ip, userAgent } = {}) {
      const id = crypto.randomUUID();
      const token = tokens.sign(user, { sid: id });
      await store.create({
        id, tenantId: user.tenantId, userId: user.id, method: method || 'unknown',
        expiresAt: tokens.expiresAt(token), ip: ip || null, userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
      });
      return { token, sessionId: id };
    },
    /** true bila sesi milik user ini masih berlaku. */
    async isActive(claims) {
      if (!claims || !claims.sid) return false;
      const s = await store.findActive(claims.sid);
      return !!s && String(s.userId) === String(claims.id) && String(s.tenantId) === String(claims.tenantId);
    },
    revoke: (id, opts = {}) => store.revoke(id, opts),
    revokeAllForUser: (tenantId, userId, opts = {}) => store.revokeAllForUser(tenantId, userId, opts),
    listActiveForUser: (tenantId, userId) => store.listActiveForUser(tenantId, userId),
  };
}

/** Store sesi in-memory (test tanpa database). `inactiveUsers`: id user yang dianggap dinonaktifkan. */
function memorySessionStore({ now = () => new Date() } = {}) {
  const rows = new Map();
  const inactiveUsers = new Set();
  const live = (s) => !s.revokedAt && s.expiresAt > now() && !inactiveUsers.has(s.userId);
  return {
    rows,
    inactiveUsers,
    async create(s) { rows.set(s.id, { ...s, createdAt: now(), revokedAt: null }); },
    async findActive(id) { const s = rows.get(id); return s && live(s) ? s : null; },
    async revoke(id, { revokedBy = null, reason = null } = {}) {
      const s = rows.get(id);
      if (!s || s.revokedAt) return false;
      Object.assign(s, { revokedAt: now(), revokedBy, revokeReason: reason });
      return true;
    },
    async revokeAllForUser(tenantId, userId, { revokedBy = null, reason = null, exceptId = null } = {}) {
      let n = 0;
      for (const s of rows.values()) {
        if (s.tenantId === tenantId && s.userId === userId && !s.revokedAt && s.id !== exceptId) {
          Object.assign(s, { revokedAt: now(), revokedBy, revokeReason: reason }); n += 1;
        }
      }
      return n;
    },
    async listActiveForUser(tenantId, userId) {
      return [...rows.values()].filter((s) => s.tenantId === tenantId && s.userId === userId && live(s))
        .map(({ id, method, createdAt, expiresAt, ip, userAgent }) => ({ id, method, createdAt, expiresAt, ip, userAgent }));
    },
  };
}

module.exports = { createSessionService, memorySessionStore };
