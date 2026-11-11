'use strict';
// Implementasi store berbasis Postgres. Setiap query memfilter tenant_id.
const { QueryTypes } = require('sequelize');

function createStores(sequelize) {
  const q = (sql, replacements, type = QueryTypes.SELECT) => sequelize.query(sql, { replacements, type });

  return {
    users: {
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
