'use strict';
// B11: query layar Admin Tenant. Setiap query memfilter tenant_id; id dari klien selalu dicari ulang dalam tenant.
const { QueryTypes } = require('sequelize');

const USER_COLS = `u.id, u.name, u.email, u.employee_id AS "employeeId", u.role, u.job_role_id AS "jobRoleId",
  jr.name AS "jobRoleName", u.career_level_id AS "careerLevelId", u.supervisor_id AS "supervisorId", u.status,
  u.last_login_at AS "lastLoginAt"`;
const USER_FROM = 'FROM users u LEFT JOIN lna_job_roles jr ON jr.id = u.job_role_id AND jr.tenant_id = u.tenant_id';
// field API -> kolom users yang boleh diubah admin tenant
const USER_FIELDS = Object.freeze({
  name: 'name', role: 'role', employeeId: 'employee_id', jobRoleId: 'job_role_id', careerLevelId: 'career_level_id',
  supervisorId: 'supervisor_id', status: 'status',
});
const MAX_USERS = 2000;

/** Pelanggaran UNIQUE Postgres -> null agar router menjawab 409, bukan 500. */
const isUnique = (e) => e && (e.name === 'SequelizeUniqueConstraintError' || (e.original && e.original.code === '23505'));

function createTenantAdminStores(sequelize) {
  const select = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  const one = async (sql, replacements) => (await select(sql, replacements))[0] || null;

  const tenantAdmin = {
    async listUsers(tenantId, { q, status } = {}) {
      const rep = { tenantId, limit: MAX_USERS };
      let sql = `SELECT ${USER_COLS} ${USER_FROM} WHERE u.tenant_id = :tenantId`;
      if (status) { sql += ' AND u.status = :status'; rep.status = status; }
      if (q) { sql += ' AND (u.name ILIKE :q OR u.email ILIKE :q OR u.employee_id ILIKE :q)'; rep.q = `%${q.replace(/[\\%_]/g, '\\$&')}%`; }
      return select(`${sql} ORDER BY u.name NULLS LAST, u.email LIMIT :limit`, rep);
    },
    async countUsers(tenantId) {
      return (await one('SELECT count(*)::int AS n FROM users WHERE tenant_id = :tenantId', { tenantId })).n;
    },
    async getUser(tenantId, id) {
      return one(`SELECT ${USER_COLS} ${USER_FROM} WHERE u.tenant_id = :tenantId AND u.id = :id`, { tenantId, id });
    },
    /** Return user baru, atau null bila email / ID karyawan sudah dipakai di tenant ini. */
    async createUser(tenantId, u) {
      try {
        const [rows] = await sequelize.query(
          `INSERT INTO users (tenant_id, email, name, employee_id, role, status, job_role_id, career_level_id, supervisor_id)
           VALUES (:tenantId, :email, :name, :employeeId, :role, 'invited', :jobRoleId, :careerLevelId, :supervisorId) RETURNING id`,
          { replacements: { tenantId, email: u.email, name: u.name, role: u.role, employeeId: u.employeeId ?? null, jobRoleId: u.jobRoleId ?? null, careerLevelId: u.careerLevelId ?? null, supervisorId: u.supervisorId ?? null } },
        );
        return tenantAdmin.getUser(tenantId, rows[0].id);
      } catch (e) { if (isUnique(e)) return null; throw e; }
    },
    /** patch: field API yang berubah. Return user, atau null bila bentrok UNIQUE. */
    async updateUser(tenantId, id, patch) {
      const sets = []; const rep = { tenantId, id };
      for (const [k, col] of Object.entries(USER_FIELDS)) {
        if (patch[k] !== undefined) { sets.push(`${col} = :${k}`); rep[k] = patch[k]; }
      }
      if (!sets.length) return tenantAdmin.getUser(tenantId, id);
      try {
        await sequelize.query(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE tenant_id = :tenantId AND id = :id`, { replacements: rep });
      } catch (e) { if (isUnique(e)) return null; throw e; }
      return tenantAdmin.getUser(tenantId, id);
    },
    /** Peran dan status terkini pelaku (bukan dari klaim token), untuk gerbang Admin Tenant. */
    async actor(tenantId, id) {
      return one('SELECT id, role, status FROM users WHERE tenant_id = :tenantId AND id = :id', { tenantId, id });
    },
    async tenantInfo(tenantId) {
      return one('SELECT name, elitementor_organization_id IS NOT NULL AS "organizationMapped" FROM tenants WHERE id = :tenantId', { tenantId });
    },

    /** Jabatan + jumlah kompetensi, jumlah pegawai (akun tidak nonaktif), dan sumber kamus. */
    async jobRoleStats(tenantId) {
      return select(
        `SELECT jr.id, jr.name, jr.division, jr.description,
                (SELECT count(*)::int FROM lna_competencies c WHERE c.tenant_id = jr.tenant_id AND c.job_role_id = jr.id) AS "competencyCount",
                (SELECT count(*)::int FROM users u WHERE u.tenant_id = jr.tenant_id AND u.job_role_id = jr.id AND u.status <> 'disabled') AS "employeeCount",
                COALESCE((SELECT array_agg(DISTINCT c.source ORDER BY c.source) FROM lna_competencies c
                           WHERE c.tenant_id = jr.tenant_id AND c.job_role_id = jr.id), '{}') AS sources
           FROM lna_job_roles jr WHERE jr.tenant_id = :tenantId ORDER BY jr.name`, { tenantId });
    },
    async getJobRole(tenantId, id) {
      return one('SELECT id, name, division, description FROM lna_job_roles WHERE tenant_id = :tenantId AND id = :id', { tenantId, id });
    },
    async jobRoleNameTaken(tenantId, name, exceptId) {
      return Boolean(await one(
        `SELECT 1 AS ok FROM lna_job_roles WHERE tenant_id = :tenantId AND lower(btrim(name)) = lower(btrim(:name))
            AND (CAST(:exceptId AS uuid) IS NULL OR id <> CAST(:exceptId AS uuid))`, { tenantId, name, exceptId: exceptId || null }));
    },
    async updateJobRole(tenantId, id, patch) {
      const sets = []; const rep = { tenantId, id };
      for (const k of ['name', 'division', 'description']) if (patch[k] !== undefined) { sets.push(`${k} = :${k}`); rep[k] = patch[k]; }
      try {
        if (sets.length) await sequelize.query(`UPDATE lna_job_roles SET ${sets.join(', ')} WHERE tenant_id = :tenantId AND id = :id`, { replacements: rep });
      } catch (e) { if (isUnique(e)) return null; throw e; }
      return tenantAdmin.getJobRole(tenantId, id);
    },

    /** Agregat kinerja per periode (tanpa data per karyawan). */
    async performanceByPeriod(tenantId) {
      return select(
        `SELECT period, count(*)::int AS records, (count(*) FILTER (WHERE is_met = false))::int AS missed,
                (array_agg(import_batch_id ORDER BY created_at DESC) FILTER (WHERE import_batch_id IS NOT NULL))[1] AS "batchId"
           FROM lna_performance_records WHERE tenant_id = :tenantId AND period IS NOT NULL
          GROUP BY period ORDER BY period DESC LIMIT 200`, { tenantId });
    },
  };

  return { tenantAdmin };
}

module.exports = { createTenantAdminStores, USER_FIELDS, isUniqueViolation: isUnique };
