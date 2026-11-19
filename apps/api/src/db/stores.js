'use strict';
// Implementasi store berbasis Postgres. Setiap query memfilter tenant_id.
const { QueryTypes } = require('sequelize');
const crypto = require('crypto');
const { createLnaStores } = require('./lna-stores');
const { createCcaStores } = require('./cca-stores');
const { createFieldCipher, createProvider } = require('../core/crypto');

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
      /** R3-2: penerima undangan; `pendingOnly` = belum pernah masuk. HR/Admin tidak diundang lewat jalur ini. */
      async listInvitees(tenantId, { userIds, pendingOnly } = {}) {
        let sql = `SELECT id, tenant_id AS "tenantId", email, name, role FROM users
                    WHERE tenant_id = :tenantId AND status <> 'disabled' AND role NOT IN ('hr_admin','eta_admin')`;
        const rep = { tenantId };
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
