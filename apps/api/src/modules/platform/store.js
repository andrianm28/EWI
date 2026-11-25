'use strict';
// B12: query agregat lintas tenant untuk konsol Super Admin (ADR 0002). Hanya metadata dan angka; tidak ada isi
// wawancara atau data karyawan per orang.
const { QueryTypes } = require('sequelize');
const { ROLES } = require('../../core/rbac/roles');

// Pengelola tenant = tenant_admin saja sejak masa interim hr_admin dicabut 24 Nov (keputusan user, review PR #8).
const MANAGER_ROLES = [ROLES.TENANT_ADMIN];

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
    /** Sasaran kirim ulang: pengelola invited yang belum pernah login, tenant_admin lebih dulu, lalu yang terlama. */
    async pendingAdmin(tenantId) {
      const [row] = await q(`
        SELECT u.id, u.tenant_id AS "tenantId", u.email, u.name, t.name AS "tenantName"
          FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
          JOIN tenants t ON t.id = u.tenant_id
         WHERE u.tenant_id = :tenantId AND ur.role IN (:roles) AND u.status = 'invited' AND u.last_login_at IS NULL
         ORDER BY CASE WHEN ur.role = 'tenant_admin' THEN 0 ELSE 1 END, u.created_at
         LIMIT 1`, { tenantId, roles: MANAGER_ROLES });
      return row || null;
    },
    async hasActiveAdmin(tenantId) {
      return (await q(`SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
         WHERE u.tenant_id = :tenantId AND ur.role IN (:roles) AND u.status = 'active' LIMIT 1`, { tenantId, roles: MANAGER_ROLES })).length > 0;
    },
    /** Jumlah tenant dengan flag menyala (baris konfigurasi Autentikasi). */
    async tenantsWithFlag(key) {
      return (await q('SELECT count(*)::int AS n FROM feature_flags WHERE key = :key AND enabled', { key }))[0].n;
    },
    /** Temuan hasil job analisis AI yang sudah ditinjau HR, per tenant per tanggal Asia/Jakarta. */
    async aiQuality({ days }) {
      return q(`
        SELECT f.tenant_id AS "tenantId", t.name,
               to_char((f.reviewed_at AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS day,
               count(*)::int AS reviewed, (count(*) FILTER (WHERE f.review_status = 'approved'))::int AS approved
          FROM lna_findings f JOIN tenants t ON t.id = f.tenant_id
         WHERE f.analysis_job_id IS NOT NULL AND f.review_status <> 'draft' AND f.reviewed_at IS NOT NULL
           AND f.reviewed_at >= now() - make_interval(days => :days)
         GROUP BY 1, 2, 3 ORDER BY 2, 3`, { days });
    },
    /** Pemakaian token per tenant per minggu ISO (Senin, Asia/Jakarta); hanya minggu yang punya pemakaian. */
    async aiCost({ weeks }) {
      return q(`
        SELECT l.tenant_id AS "tenantId", t.name,
               to_char(date_trunc('week', l.created_at AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS week,
               count(DISTINCT l.session_id)::int AS sessions, count(*)::int AS calls,
               sum(l.input_tokens)::bigint AS "tokensIn", sum(l.output_tokens)::bigint AS "tokensOut",
               coalesce(sum(l.cost_usd), 0)::float8 AS "costUsd", bool_or(l.cost_usd IS NULL) AS "costMissing"
          FROM ai_usage_logs l JOIN tenants t ON t.id = l.tenant_id
         WHERE l.created_at >= (date_trunc('week', now() AT TIME ZONE 'Asia/Jakarta') - make_interval(weeks => :weeks - 1)) AT TIME ZONE 'Asia/Jakarta'
         GROUP BY 1, 2, 3 ORDER BY 3 DESC, 2`, { weeks });
    },
    async tenantExists(tenantId) {
      return (await q('SELECT 1 FROM tenants WHERE id = :tenantId', { tenantId })).length > 0;
    },
  };
}

module.exports = { createPlatformStore, MANAGER_ROLES };
