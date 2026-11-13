'use strict';
// Implementasi store berbasis Postgres. Setiap query memfilter tenant_id.
const { QueryTypes } = require('sequelize');
const { createLnaStores } = require('./lna-stores');

function createStores(sequelize) {
  const q = (sql, replacements, type = QueryTypes.SELECT) => sequelize.query(sql, { replacements, type });

  return {
    ...createLnaStores(sequelize),
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
      async insert(row) {
        await sequelize.query(
          `INSERT INTO audit_logs (tenant_id, user_id, action, resource, meta, at)
           VALUES (:tenantId, :userId, :action, :resource, CAST(:meta AS jsonb), :at)`,
          { replacements: { ...row, userId: row.userId || null, meta: JSON.stringify(row.meta || {}) } },
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
