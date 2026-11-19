'use strict';
// PK-16: sesi login yang bisa dicabut. Setiap login membuat satu baris sesi; JWT membawa id sesi (sid).
// requireAuth memeriksa sesi di setiap request: dicabut, kedaluwarsa, user dinonaktifkan, atau tenant
// tidak aktif = 401. Dengan begitu "Keluar", "Keluar dari semua perangkat", dan pencabutan oleh HR
// langsung berlaku tanpa menunggu JWT habis.
const crypto = require('crypto');
const { switchableRoles } = require('../rbac/roles');

/**
 * store: {
 *   create({ id, tenantId, userId, method, mfa, activeRole, expiresAt, ip, userAgent }),
 *   findActive(id) -> { id, tenantId, userId, activeRole, roleVersion, expiresAt, primaryRole, roles } | null
 *                     (belum dicabut, belum kedaluwarsa, user & tenant aktif; roles = isi user_roles akun),
 *   setActiveRole(id, role, expectedVersion) -> { roleVersion, expiresAt } | null   (atomik),
 *   revoke(id, { revokedBy, reason }) -> bool,
 *   revokeAllForUser(tenantId, userId, { revokedBy, reason, exceptId }) -> jumlah,
 *   listActiveForUser(tenantId, userId) -> [...]
 * }
 * multiRole(tenantId) -> bool: flag auth.multi_role (B2). Mati = akun hanya memakai peran utamanya.
 */
function createSessionService({ store, tokens, multiRole = async () => false }) {
  /** Peran yang boleh dipakai akun ini sekarang. */
  async function allowedRoles(s) {
    const primary = s.primaryRole || s.activeRole;
    if (!(await multiRole(s.tenantId))) return [primary];
    return switchableRoles(s.roles && s.roles.length ? s.roles : [primary]);
  }
  /**
   * Periksa token terhadap sesi. Return { ok:true, roles, primaryRole } atau { ok:false, code? }.
   * B2: klaim role harus sama dengan peran aktif sesi, versi peran harus sama, dan peran itu masih dimiliki akun.
   */
  async function check(claims) {
    if (!claims || !claims.sid) return { ok: false };
    const s = await store.findActive(claims.sid);
    if (!s || String(s.userId) !== String(claims.id) || String(s.tenantId) !== String(claims.tenantId)) return { ok: false };
    if ((s.roleVersion || 0) !== (claims.rv || 0)) return { ok: false, code: 'ROLE_VIEW_CHANGED' };
    const active = s.activeRole || s.primaryRole;
    const roles = await allowedRoles({ ...s, activeRole: active });
    if (active !== claims.role || !roles.includes(active)) return { ok: false };
    return { ok: true, roles, primaryRole: s.primaryRole || active };
  }
  return {
    async issue(user, { method, ip, userAgent, mfa = false } = {}) {
      const id = crypto.randomUUID();
      const token = tokens.sign(user, { sid: id });
      await store.create({
        id, tenantId: user.tenantId, userId: user.id, method: method || 'unknown', mfa: mfa === true, activeRole: user.role,
        expiresAt: tokens.expiresAt(token), ip: ip || null, userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
      });
      return { token, sessionId: id };
    },
    check,
    /** true bila sesi milik user ini masih berlaku. */
    async isActive(claims) { return (await check(claims)).ok; },
    /**
     * B2: ganti tampilan pada sesi yang sama. user = req.user. Return { token, roles }, null bila peran
     * tidak boleh dipakai akun ini, atau { conflict: true } bila sesi berubah di tempat lain (tab lain).
     */
    async switchRole(user, role) {
      const state = await check({ ...user, rv: user.rv });
      if (!state.ok || !state.roles.includes(role)) return null;
      const next = await store.setActiveRole(user.sid, role, user.rv || 0);
      if (!next) return { conflict: true };
      const token = tokens.sign({ ...user, role }, { sid: user.sid, rv: next.roleVersion, expiresAt: next.expiresAt });
      return { token, roles: state.roles };
    },
    revoke: (id, opts = {}) => store.revoke(id, opts),
    revokeAllForUser: (tenantId, userId, opts = {}) => store.revokeAllForUser(tenantId, userId, opts),
    listActiveForUser: (tenantId, userId) => store.listActiveForUser(tenantId, userId),
  };
}

/**
 * Store sesi in-memory (test tanpa database). `inactiveUsers`: id user yang dianggap dinonaktifkan.
 * `accountOf(userId)` -> { primaryRole, roles } opsional; tanpa itu peran akun = peran saat sesi dibuat.
 */
function memorySessionStore({ now = () => new Date(), accountOf } = {}) {
  const rows = new Map();
  const inactiveUsers = new Set();
  const live = (s) => !s.revokedAt && s.expiresAt > now() && !inactiveUsers.has(s.userId);
  return {
    rows,
    inactiveUsers,
    async create(s) { rows.set(s.id, { ...s, createdAt: now(), revokedAt: null, roleVersion: 0, firstRole: s.activeRole }); },
    async findActive(id) {
      const s = rows.get(id);
      if (!s || !live(s)) return null;
      const acct = (accountOf && accountOf(s.userId)) || { primaryRole: s.firstRole, roles: [s.firstRole] };
      return { ...s, ...acct };
    },
    async setActiveRole(id, role, expectedVersion) {
      const s = rows.get(id);
      if (!s || !live(s) || s.roleVersion !== expectedVersion) return null;
      Object.assign(s, { activeRole: role, roleVersion: s.roleVersion + 1 });
      return { roleVersion: s.roleVersion, expiresAt: s.expiresAt };
    },
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
        .map(({ id, method, mfa, createdAt, expiresAt, ip, userAgent }) => ({ id, method, mfa, createdAt, expiresAt, ip, userAgent }));
    },
  };
}

module.exports = { createSessionService, memorySessionStore };
