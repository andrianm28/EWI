'use strict';
// B12: query agregat lintas tenant untuk konsol Super Admin (ADR 0002). Hanya metadata dan angka; tidak ada isi
// wawancara atau data karyawan per orang.
const { QueryTypes } = require('sequelize');

const MANAGER_ROLES = ['tenant_admin', 'hr_admin'];

function createPlatformStore(db) {
  const q = (sql, replacements = {}, opts = {}) => db.query(sql, { replacements, type: QueryTypes.SELECT, ...opts });
  return {
    /** Satu baris per tenant dengan status turunan (spek §Status tenant). */
    async listTenants() {
      return q(`
        WITH mgr AS (
          SELECT u.tenant_id, u.email, u.status, u.created_at,
                 CASE WHEN ur.role = 'tenant_admin' THEN 0 ELSE 1 END AS pri
            FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
           WHERE ur.role IN (:roles)
        )
        SELECT t.id, t.slug, t.name, t.created_at AS "createdAt",
               CASE WHEN t.status = 'suspended' THEN 'suspended'
                    WHEN EXISTS (SELECT 1 FROM mgr WHERE mgr.tenant_id = t.id AND mgr.status = 'active') THEN 'active'
                    WHEN EXISTS (SELECT 1 FROM mgr WHERE mgr.tenant_id = t.id AND mgr.status = 'invited') THEN 'pending_admin'
                    ELSE 'draft' END AS status,
               (SELECT mgr.email FROM mgr WHERE mgr.tenant_id = t.id AND mgr.status <> 'disabled'
                 ORDER BY mgr.pri, mgr.created_at LIMIT 1) AS "adminEmail",
               (SELECT count(*)::int FROM users u WHERE u.tenant_id = t.id AND u.status <> 'disabled') AS users
          FROM tenants t
         ORDER BY t.created_at DESC`, { roles: MANAGER_ROLES });
    },
    async tenantExists(tenantId) {
      return (await q('SELECT 1 FROM tenants WHERE id = :tenantId', { tenantId })).length > 0;
    },
  };
}

module.exports = { createPlatformStore, MANAGER_ROLES };
