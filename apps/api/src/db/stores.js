'use strict';
// Implementasi store berbasis Postgres. Setiap query memfilter tenant_id.
const { QueryTypes } = require('sequelize');
const crypto = require('crypto');
const { createLnaStores } = require('./lna-stores');
const { createTenantAdminStores } = require('./tenant-admin-stores');
const { createInaStores } = require('./ina-stores');
const { createCcaStores } = require('./cca-stores');
const { createFieldCipher, createProvider } = require('../core/crypto');
const { PRIVILEGED_ROLES, ROLES } = require('../core/rbac/roles');
const { MAX_ATTEMPTS } = require('../core/auth/mfa');

/** Penyimpan DEK terbungkus per tenant (R2-3). */
function tenantKeyStore(sequelize) {
  const cols = 'version, key_ref AS "keyRef", wrapped_key AS "wrappedKey"';
  return {
    /** Satu DEK apa saja (terbaru), untuk pemeriksaan kesiapan penyedia enkripsi. */
    async any() {
      const [row] = await sequelize.query(`SELECT tenant_id AS "tenantId", ${cols} FROM tenant_keys ORDER BY created_at DESC LIMIT 1`,
        { type: QueryTypes.SELECT });
      return row || null;
    },
    async get(tenantId) {
      const [row] = await sequelize.query(`SELECT ${cols} FROM tenant_keys WHERE tenant_id = :tenantId ORDER BY version DESC LIMIT 1`,
        { replacements: { tenantId }, type: QueryTypes.SELECT });
      return row || null;
    },
    async insert(tenantId, { version, keyRef, wrappedKey }) {
      // aman bila dua request membuat kunci bersamaan: yang kalah memakai kunci yang sudah tersimpan
      await sequelize.query(
        `INSERT INTO tenant_keys (tenant_id, version, key_ref, wrapped_key) VALUES (:tenantId, :version, :keyRef, :wrappedKey)
         ON CONFLICT (tenant_id, version) DO NOTHING`,
        { replacements: { tenantId, version, keyRef, wrappedKey } },
      );
      const [row] = await sequelize.query(`SELECT ${cols} FROM tenant_keys WHERE tenant_id = :tenantId AND version = :version`,
        { replacements: { tenantId, version }, type: QueryTypes.SELECT });
      return row;
    },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sesi login (PK-16). Sesi hanya berlaku bila belum dicabut, belum kedaluwarsa, user tidak nonaktif, tenant aktif. */
function authSessionStore(q) {
  return {
    async create({ id, tenantId, userId, method, mfa = false, activeRole = null, expiresAt, ip, userAgent }) {
      await q(
        `INSERT INTO auth_sessions (id, tenant_id, user_id, method, mfa, active_role, expires_at, ip, user_agent)
         VALUES (:id, :tenantId, :userId, :method, :mfa, :activeRole, :expiresAt, :ip, :userAgent)`,
        { id, tenantId, userId, method, mfa, activeRole, expiresAt, ip, userAgent }, QueryTypes.INSERT,
      );
    },
    async findActive(id) {
      if (!UUID_RE.test(String(id))) return null;
      const [row] = await q(
        `SELECT s.id, s.tenant_id AS "tenantId", s.user_id AS "userId", s.active_role AS "activeRole",
                s.role_version AS "roleVersion", s.expires_at AS "expiresAt", u.role AS "primaryRole",
                ARRAY(SELECT ur.role FROM user_roles ur WHERE ur.user_id = u.id AND ur.tenant_id = u.tenant_id ORDER BY ur.role) AS roles
           FROM auth_sessions s JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
           JOIN tenants t ON t.id = s.tenant_id
          WHERE s.id = :id AND s.revoked_at IS NULL AND s.expires_at > now()
            AND u.status <> 'disabled' AND t.status = 'active'`,
        { id },
      );
      return row || null;
    },
    /** B2: ganti peran aktif; versi naik agar token lama tidak berlaku. Gagal bila sesi berubah di tempat lain. */
    async setActiveRole(id, role, expectedVersion) {
      if (!UUID_RE.test(String(id))) return null;
      const [row] = await q(
        `UPDATE auth_sessions SET active_role = :role, role_version = role_version + 1
          WHERE id = :id AND role_version = :expectedVersion AND revoked_at IS NULL AND expires_at > now()
          RETURNING role_version AS "roleVersion", expires_at AS "expiresAt"`,
        { id, role, expectedVersion },
      );
      return row || null;
    },
    async revoke(id, { revokedBy = null, reason = null } = {}) {
      if (!UUID_RE.test(String(id))) return false;
      const rows = await q(
        `UPDATE auth_sessions SET revoked_at = now(), revoked_by = :revokedBy, revoke_reason = :reason
          WHERE id = :id AND revoked_at IS NULL RETURNING id`,
        { id, revokedBy, reason },
      );
      return rows.length > 0;
    },
    async revokeAllForUser(tenantId, userId, { revokedBy = null, reason = null, exceptId = null } = {}) {
      if (!UUID_RE.test(String(userId))) return 0;
      const rows = await q(
        `UPDATE auth_sessions SET revoked_at = now(), revoked_by = :revokedBy, revoke_reason = :reason
          WHERE tenant_id = :tenantId AND user_id = :userId AND revoked_at IS NULL
            AND (CAST(:exceptId AS uuid) IS NULL OR id <> CAST(:exceptId AS uuid))
          RETURNING id`,
        { tenantId, userId, revokedBy, reason, exceptId },
      );
      return rows.length;
    },
    async listActiveForUser(tenantId, userId) {
      return q(
        `SELECT id, method, mfa, created_at AS "createdAt", expires_at AS "expiresAt", ip, user_agent AS "userAgent"
           FROM auth_sessions
          WHERE tenant_id = :tenantId AND user_id = :userId AND revoked_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC`,
        { tenantId, userId },
      );
    },
  };
}

/** B1: secret autentikator dan tantangan langkah kedua. Semua perubahan status atomik (satu UPDATE ... RETURNING). */
function mfaStore(q) {
  return {
    async get(tenantId, userId) {
      if (!UUID_RE.test(String(userId))) return null;
      const [row] = await q(
        `SELECT user_id AS "userId", tenant_id AS "tenantId", secret_enc AS "secretEnc", enabled_at AS "enabledAt", last_step AS "lastStep"
           FROM user_mfa WHERE tenant_id = :tenantId AND user_id = :userId`, { tenantId, userId });
      if (!row) return null;
      return { ...row, lastStep: row.lastStep === null ? null : Number(row.lastStep) };
    },
    async savePending(tenantId, userId, secretEnc) {
      await q(
        `INSERT INTO user_mfa (user_id, tenant_id, secret_enc) VALUES (:userId, :tenantId, :secretEnc)
         ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, last_step = NULL, created_at = now()
           WHERE user_mfa.enabled_at IS NULL`,
        { tenantId, userId, secretEnc }, QueryTypes.INSERT,
      );
    },
    async enable(tenantId, userId) {
      await q('UPDATE user_mfa SET enabled_at = now() WHERE tenant_id = :tenantId AND user_id = :userId AND enabled_at IS NULL RETURNING user_id', { tenantId, userId });
    },
    async remove(tenantId, userId) {
      if (!UUID_RE.test(String(userId))) return false;
      const rows = await q('DELETE FROM user_mfa WHERE tenant_id = :tenantId AND user_id = :userId RETURNING user_id', { tenantId, userId });
      return rows.length > 0;
    },
    async advanceStep(tenantId, userId, step) {
      const rows = await q(
        'UPDATE user_mfa SET last_step = :step WHERE tenant_id = :tenantId AND user_id = :userId AND (last_step IS NULL OR last_step < :step) RETURNING user_id',
        { tenantId, userId, step });
      return rows.length > 0;
    },
    async createChallenge({ id, tenantId, userId, method, tokenHash, expiresAt }) {
      await q(
        `INSERT INTO auth_mfa_challenges (id, tenant_id, user_id, method, token_hash, expires_at)
         VALUES (:id, :tenantId, :userId, :method, :tokenHash, :expiresAt)`,
        { id, tenantId, userId, method, tokenHash, expiresAt }, QueryTypes.INSERT,
      );
    },
    async attemptChallenge(tokenHash) {
      const [row] = await q(
        `UPDATE auth_mfa_challenges SET attempts = attempts + 1
          WHERE token_hash = :tokenHash AND used_at IS NULL AND expires_at > now() AND attempts < :maxAttempts
          RETURNING id, tenant_id AS "tenantId", user_id AS "userId", method`, { tokenHash, maxAttempts: MAX_ATTEMPTS });
      return row || null;
    },
    async useChallenge(id) {
      const rows = await q('UPDATE auth_mfa_challenges SET used_at = now() WHERE id = :id AND used_at IS NULL RETURNING id', { id });
      return rows.length > 0;
    },
  };
}

/** B2: peran per akun. users.role = peran utama; user_roles = semua peran (trigger users_role_sync menjaga keduanya). */
function userRoleStore(sequelize) {
  const read = async (tenantId, userId, transaction) => {
    const [row] = await sequelize.query(
      `SELECT u.role AS "primary",
              ARRAY(SELECT ur.role FROM user_roles ur WHERE ur.user_id = u.id AND ur.tenant_id = u.tenant_id ORDER BY ur.role) AS roles
         FROM users u WHERE u.tenant_id = :tenantId AND u.id = :userId`,
      { replacements: { tenantId, userId }, type: QueryTypes.SELECT, transaction });
    return row || null;
  };
  return {
    async get(tenantId, userId) {
      if (!UUID_RE.test(String(userId))) return null;
      return read(tenantId, userId);
    },
    /**
     * Ganti peran akun. Satu transaksi yang mengunci baris tenant, supaya dua permintaan bersamaan tidak
     * mencabut dua Admin Tenant terakhir. Return { status: 'ok', from, to } | 'not_found' | 'protected' | 'last_admin'.
     */
    async replace(tenantId, userId, { roles, primary, grantedBy }) {
      if (!UUID_RE.test(String(userId))) return { status: 'not_found' };
      return sequelize.transaction(async (transaction) => {
        const opt = { transaction };
        await sequelize.query('SELECT id FROM tenants WHERE id = :tenantId FOR UPDATE', { replacements: { tenantId }, ...opt });
        const from = await read(tenantId, userId, transaction);
        if (!from) return { status: 'not_found' };
        if (from.roles.includes(ROLES.ETA_ADMIN)) return { status: 'protected' };
        if (from.roles.includes(ROLES.TENANT_ADMIN) && !roles.includes(ROLES.TENANT_ADMIN)) {
          const [{ n }] = await sequelize.query(
            `SELECT count(*)::int AS n FROM user_roles ur JOIN users u ON u.id = ur.user_id
              WHERE ur.tenant_id = :tenantId AND ur.role = :role AND ur.user_id <> :userId AND u.status <> 'disabled'`,
            { replacements: { tenantId, userId, role: ROLES.TENANT_ADMIN }, type: QueryTypes.SELECT, ...opt });
          if (n === 0) return { status: 'last_admin' };
        }
        // Urutan penting: peran utama dulu (trigger mengganti baris peran utama lama), lalu samakan sisanya
        await sequelize.query('UPDATE users SET role = :primary, updated_at = now() WHERE tenant_id = :tenantId AND id = :userId',
          { replacements: { tenantId, userId, primary }, ...opt });
        await sequelize.query('DELETE FROM user_roles WHERE tenant_id = :tenantId AND user_id = :userId AND role NOT IN (:roles)',
          { replacements: { tenantId, userId, roles }, ...opt });
        for (const role of roles) {
          await sequelize.query(
            `INSERT INTO user_roles (tenant_id, user_id, role, granted_by) VALUES (:tenantId, :userId, :role, :grantedBy)
             ON CONFLICT (user_id, role) DO NOTHING`,
            { replacements: { tenantId, userId, role, grantedBy: grantedBy || null }, ...opt });
        }
        return { status: 'ok', from, to: await read(tenantId, userId, transaction) };
      });
    },
  };
}

/**
 * encryption: config.encryption (R2-3). Tanpa config hanya boleh di test (kunci lokal acak per proses).
 */
function createStores(sequelize, { encryption } = {}) {
  const q = (sql, replacements, type = QueryTypes.SELECT) => sequelize.query(sql, { replacements, type });
  let enc = encryption;
  if (!enc) {
    if (process.env.NODE_ENV !== 'test') throw new Error('createStores butuh config.encryption (R2-3)');
    enc = { provider: 'local', localMasterKey: crypto.randomBytes(32) };
  }
  const cipher = createFieldCipher({ provider: createProvider(enc), keyStore: tenantKeyStore(sequelize) });

  return {
    cipher,
    /** PK-07: kesiapan database (kueri sungguhan, bukan sekadar koneksi terbuka). */
    async ping() { await sequelize.query('SELECT 1', { type: QueryTypes.SELECT }); },
    /** PK-07 / P1-7: siapa user koneksi aplikasi dan apakah superuser (diperiksa saat boot). */
    async dbRole() {
      const [row] = await sequelize.query(
        `SELECT current_user AS "user", r.rolsuper AS superuser FROM pg_roles r WHERE r.rolname = current_user`,
        { type: QueryTypes.SELECT });
      return row;
    },
    ...createLnaStores(sequelize, { cipher }),
    ...createTenantAdminStores(sequelize),
    ...createInaStores(sequelize, { cipher }),
    ...createCcaStores(sequelize, { cipher }),
    users: {
      async listActiveTenants() {
        return q(`SELECT slug, name FROM tenants WHERE status = 'active' ORDER BY name`);
      },
      async findByEmail(tenantSlug, email) {
        const [row] = await q(
          `SELECT u.id, u.tenant_id AS "tenantId", u.email, u.name, u.role, u.password_hash AS "passwordHash"
             FROM users u JOIN tenants t ON t.id = u.tenant_id
            WHERE t.slug = :tenantSlug AND u.email = :email AND u.status = 'active' AND t.status = 'active'`,
          { tenantSlug, email },
        );
        return row || null;
      },
      /** B1: tenant aktif dari slug (untuk /methods dan SSO). */
      async findTenantBySlug(slug) {
        const [row] = await q(`SELECT id, slug, name FROM tenants WHERE slug = :slug AND status = 'active'`, { slug });
        return row || null;
      },
      /** B1: akun yang masih boleh masuk (tidak dinonaktifkan, tenant aktif), dicari di tenant yang diberikan. */
      async findById(tenantId, id) {
        if (!UUID_RE.test(String(id))) return null;
        const [row] = await q(
          `SELECT u.id, u.tenant_id AS "tenantId", u.email, u.name, u.role,
                  ARRAY(SELECT ur.role FROM user_roles ur WHERE ur.tenant_id = u.tenant_id AND ur.user_id = u.id ORDER BY ur.role) AS roles
             FROM users u JOIN tenants t ON t.id = u.tenant_id
            WHERE u.tenant_id = :tenantId AND u.id = :id AND u.status <> 'disabled' AND t.status = 'active'`,
          { tenantId, id },
        );
        return row || null;
      },
      /** R3-2: penerima undangan; `pendingOnly` = belum pernah masuk. HR/Admin tidak diundang lewat jalur ini. */
      async listInvitees(tenantId, { userIds, pendingOnly } = {}) {
        let sql = `SELECT id, tenant_id AS "tenantId", email, name, role FROM users
                    WHERE tenant_id = :tenantId AND status <> 'disabled'
                      AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = users.id AND ur.role IN (:privileged))`;
        const rep = { tenantId, privileged: PRIVILEGED_ROLES };
        if (userIds) { sql += ' AND id IN (:userIds)'; rep.userIds = userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']; }
        if (pendingOnly) sql += ' AND last_login_at IS NULL';
        return q(`${sql} ORDER BY name NULLS LAST, email`, rep);
      },
      async tenantName(tenantId) {
        const [row] = await q('SELECT name FROM tenants WHERE id = :tenantId', { tenantId });
        return row ? row.name : null;
      },
    },
    // R3-2: link masuk via email (hanya hash token yang disimpan)
    loginLinks: {
      async create({ tenantId, userId, tokenHash, purpose, expiresAt, createdBy }) {
        await sequelize.query(
          `INSERT INTO login_links (tenant_id, user_id, token_hash, purpose, expires_at, created_by)
           VALUES (:tenantId, :userId, :tokenHash, :purpose, :expiresAt, :createdBy)`,
          { replacements: { tenantId, userId, tokenHash, purpose, expiresAt, createdBy: createdBy || null } },
        );
      },
      async countSince(tenantId, userId, since) {
        const [row] = await q(`SELECT count(*)::int AS n FROM login_links WHERE tenant_id = :tenantId AND user_id = :userId AND created_at > :since`, { tenantId, userId, since });
        return row.n;
      },
      /** Pakai token sekali (atomik). Return user aktif + tenant atau null. */
      async consume(tokenHash) {
        const [row] = await q(
          `WITH used AS (
             UPDATE login_links SET used_at = now()
              WHERE token_hash = :tokenHash AND used_at IS NULL AND expires_at > now()
              RETURNING tenant_id, user_id, purpose)
           SELECT u.id, u.tenant_id AS "tenantId", u.email, u.name, u.role, used.purpose
             FROM used JOIN users u ON u.id = used.user_id AND u.tenant_id = used.tenant_id
             JOIN tenants t ON t.id = u.tenant_id
            WHERE u.status <> 'disabled' AND t.status = 'active'`,
          { tokenHash },
        );
        if (row) await q(`UPDATE users SET status = 'active', last_login_at = now() WHERE id = :id`, { id: row.id }, QueryTypes.UPDATE);
        return row || null;
      },
    },
    // PK-16: sesi login yang bisa dicabut
    authSessions: authSessionStore(q),
    // B1: verifikasi dua langkah
    mfa: mfaStore(q),
    // B2: peran per akun
    userRoles: userRoleStore(sequelize),
    flags: {
      async getTenantFlags(tenantId) {
        const rows = await q('SELECT key, enabled FROM feature_flags WHERE tenant_id = :tenantId', { tenantId });
        return Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
      },
      async getKillSwitches() {
        const rows = await q('SELECT key FROM feature_kill_switches WHERE active');
        return Object.fromEntries(rows.map((r) => [r.key, true]));
      },
      /** Upsert flag tenant; mengembalikan nilai sebelumnya (null bila belum pernah diset). */
      async setTenantFlag(tenantId, key, enabled, userId) {
        const [prev] = await q('SELECT enabled FROM feature_flags WHERE tenant_id = :tenantId AND key = :key', { tenantId, key });
        await sequelize.query(
          `INSERT INTO feature_flags (tenant_id, key, enabled, updated_by, updated_at)
           VALUES (:tenantId, :key, :enabled, :userId, now())
           ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          { replacements: { tenantId, key, enabled, userId: userId || null } },
        );
        return prev ? prev.enabled : null;
      },
      async setKillSwitch(key, active, reason, userId) {
        const [prev] = await q('SELECT active FROM feature_kill_switches WHERE key = :key', { key });
        await sequelize.query(
          `INSERT INTO feature_kill_switches (key, active, reason, updated_by, updated_at)
           VALUES (:key, :active, :reason, :userId, now())
           ON CONFLICT (key) DO UPDATE SET active = EXCLUDED.active, reason = EXCLUDED.reason,
             updated_by = EXCLUDED.updated_by, updated_at = now()`,
          { replacements: { key, active, reason: reason || null, userId: userId || null } },
        );
        return prev ? prev.active : null;
      },
    },
    audit: {
      async insert(row, { transaction } = {}) {
        await sequelize.query(
          `INSERT INTO audit_logs (tenant_id, user_id, action, resource, meta, at)
           VALUES (:tenantId, :userId, :action, :resource, CAST(:meta AS jsonb), :at)`,
          { replacements: { ...row, userId: row.userId || null, meta: JSON.stringify(row.meta || {}) }, transaction },
        );
      },
    },
    entitlements: {
      async getActiveEntitlements(tenantId, now) {
        return q(
          `SELECT product FROM entitlements
            WHERE tenant_id = :tenantId AND starts_at <= :now AND (ends_at IS NULL OR ends_at > :now)`,
          { tenantId, now },
        );
      },
    },
    projects: {
      async list(tenantId) {
        return q(
          `SELECT id, name, division, period_start AS "periodStart", period_end AS "periodEnd", status
             FROM lna_projects WHERE tenant_id = :tenantId ORDER BY created_at DESC`,
          { tenantId },
        );
      },
      async create(tenantId, p) {
        const [rows] = await sequelize.query(
          `INSERT INTO lna_projects (tenant_id, name, division, period_start, period_end, created_by)
           VALUES (:tenantId, :name, :division, :periodStart, :periodEnd, :createdBy)
           RETURNING id, name, division, period_start AS "periodStart", period_end AS "periodEnd", status`,
          {
            replacements: {
              tenantId,
              name: p.name,
              division: p.division ?? null,
              periodStart: p.periodStart ?? null,
              periodEnd: p.periodEnd ?? null,
              createdBy: p.createdBy ?? null,
            },
          },
        );
        return rows[0];
      },
    },
  };
}

module.exports = { createStores };
