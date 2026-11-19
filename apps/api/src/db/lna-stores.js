'use strict';
// Store Postgres untuk DNA, TNA, dan wawancara (POC Desember). Setiap query memfilter tenant_id,
// dan query data karyawan menerima `scope` dari visibleEmployeeScope() (RG-3).
const { QueryTypes } = require('sequelize');

/** scope: { all: true } | { userIds: [...] } -> potongan SQL untuk kolom user id. */
function scopeSql(column, scope, rep) {
  if (!scope || scope.all) return '';
  rep.scopeIds = scope.userIds && scope.userIds.length ? scope.userIds : ['00000000-0000-0000-0000-000000000000'];
  return ` AND ${column} IN (:scopeIds)`;
}

const COMPETENCY_COLS = `c.id, c.job_role_id AS "jobRoleId", c.career_level_id AS "careerLevelId", c.kind, c.name,
  c.definition, c.indicators, c.source, c.version, c.required_score AS "requiredScore", c.importance,
  c.approved_at AS "approvedAt"`;

const PLAN_COLS = `p.id, p.user_id AS "userId", u.name AS "userName", p.finding_id AS "findingId", p.origin, p.status,
  p.program_tier AS "programTier", p.catalog_source AS "catalogSource", p.catalog_item_ref AS "catalogItemRef",
  p.catalog_item_title AS "catalogItemTitle", p.note, p.requested_by AS "requestedBy", p.created_at AS "createdAt",
  p.updated_at AS "updatedAt"`;

/** Kolom opsional yang undefined diganti null agar replacement Sequelize selalu terisi. */
function withNulls(obj, keys) {
  const out = { ...obj };
  for (const k of keys) if (out[k] === undefined) out[k] = null;
  return out;
}

/**
 * cipher: enkripsi kolom per tenant (R2-3). Kolom terenkripsi: transkrip/jawaban (lna_interview_turns.text),
 * bukti asesmen (lna_assessments.evidence), temuan (lna_findings.title, detail), catatan rencana training
 * (lna_training_plan_items.note), dan baris mentah impor (import_batches.rows). Skor angka tetap terbuka
 * agar bisa dihitung; skor tanpa transkrip/bukti tidak mengungkap isi wawancara.
 */
function createLnaStores(sequelize, { cipher } = {}) {
  if (!cipher) throw new Error('createLnaStores butuh cipher (R2-3)');
  const enc = (tenantId, v) => cipher.encrypt(tenantId, v);
  const open = (tenantId, rows, fields) => cipher.open(tenantId, rows, fields);
  const select = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  const one = async (sql, replacements) => (await select(sql, replacements))[0] || null;
  const insert = async (sql, replacements) => {
    const [rows] = await sequelize.query(sql, { replacements });
    return rows[0];
  };

  const people = {
    async directReportIds(tenantId, userId) {
      const rows = await select('SELECT id FROM users WHERE tenant_id = :tenantId AND supervisor_id = :userId', { tenantId, userId });
      return rows.map((r) => r.id);
    },
    async list(tenantId, scope, { roles, jobRoleId } = {}) {
      const rep = { tenantId };
      let sql = `SELECT u.id, u.name, u.email, u.employee_id AS "employeeId", u.role, u.supervisor_id AS "supervisorId",
                        u.job_role_id AS "jobRoleId", u.career_level_id AS "careerLevelId", jr.name AS "jobRoleName"
                   FROM users u LEFT JOIN lna_job_roles jr ON jr.id = u.job_role_id
                  WHERE u.tenant_id = :tenantId AND u.status <> 'disabled'`;
      sql += scopeSql('u.id', scope, rep);
      if (roles) { sql += ' AND u.role IN (:roles)'; rep.roles = roles; }
      if (jobRoleId) { sql += ' AND u.job_role_id = :jobRoleId'; rep.jobRoleId = jobRoleId; }
      return select(`${sql} ORDER BY u.name NULLS LAST, u.email`, rep);
    },
    async get(tenantId, userId) {
      return one(`SELECT id, name, email, employee_id AS "employeeId", role, supervisor_id AS "supervisorId",
                         job_role_id AS "jobRoleId", career_level_id AS "careerLevelId"
                    FROM users WHERE tenant_id = :tenantId AND id = :userId`, { tenantId, userId });
    },
    async resolve(tenantId, { employeeIds, emails }) {
      // privileged (B2): akun punya peran HR/Admin Tenant/Super Admin di user_roles, walau peran utamanya lain
      return select(`SELECT id, email, employee_id AS "employeeId", role, job_role_id AS "jobRoleId", career_level_id AS "careerLevelId",
                            EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = users.id
                                       AND ur.role IN ('hr_admin','tenant_admin','eta_admin')) AS privileged
                       FROM users
                      WHERE tenant_id = :tenantId AND (employee_id IN (:employeeIds) OR email IN (:emails))`,
      { tenantId, employeeIds: employeeIds.length ? employeeIds : [''], emails: emails.length ? emails : [''] });
    },
    /**
     * R3-3: buat/perbarui karyawan dari impor (satu transaksi), lalu tautkan atasan berdasarkan ID karyawan.
     * Akun baru tanpa kata sandi (masuk lewat link email, R3-2). Akun HR/Admin sudah ditolak saat validasi.
     */
    async importEmployees(tenantId, rows) {
      const t = await sequelize.transaction();
      try {
        let created = 0; let updated = 0;
        for (const r of rows) {
          const rep = withNulls({ tenantId, ...r }, ['id', 'jobRoleId', 'careerLevelId']);
          if (r.id) {
            await sequelize.query(
              `UPDATE users SET employee_id = :employeeId, name = :name, email = :email, role = :role,
                      job_role_id = :jobRoleId, career_level_id = :careerLevelId, updated_at = now()
                WHERE tenant_id = :tenantId AND id = :id
                  AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = users.id
                                     AND ur.role IN ('hr_admin','tenant_admin','eta_admin'))`,
              { replacements: rep, transaction: t },
            );
            updated += 1;
          } else {
            await sequelize.query(
              `INSERT INTO users (tenant_id, employee_id, name, email, role, status, job_role_id, career_level_id)
               VALUES (:tenantId, :employeeId, :name, :email, :role, 'active', :jobRoleId, :careerLevelId)`,
              { replacements: rep, transaction: t },
            );
            created += 1;
          }
        }
        let linked = 0;
        for (const r of rows.filter((x) => x.supervisorEmployeeId)) {
          const [, meta] = await sequelize.query(
            `UPDATE users u SET supervisor_id = s.id, updated_at = now()
               FROM users s
              WHERE u.tenant_id = :tenantId AND u.employee_id = :employeeId
                AND s.tenant_id = :tenantId AND s.employee_id = :sup`,
            { replacements: { tenantId, employeeId: r.employeeId, sup: r.supervisorEmployeeId }, transaction: t },
          );
          linked += (meta && meta.rowCount) || 0;
        }
        await t.commit();
        return { created, updated, supervisorsLinked: linked };
      } catch (e) { await t.rollback(); throw e; }
    },
    async setPosition(tenantId, userId, { jobRoleId, careerLevelId }) {
      return insert(`UPDATE users SET job_role_id = :jobRoleId, career_level_id = :careerLevelId, updated_at = now()
                      WHERE tenant_id = :tenantId AND id = :userId RETURNING id`, { tenantId, userId, jobRoleId, careerLevelId });
    },
  };

  const settings = {
    async getTenantSettings(tenantId) {
      const row = await one('SELECT settings FROM tenants WHERE id = :tenantId', { tenantId });
      return row ? row.settings : {};
    },
  };

  const dna = {
    async listJobRoles(tenantId) {
      const roles = await select(`SELECT id, name, division, description FROM lna_job_roles WHERE tenant_id = :tenantId ORDER BY name`, { tenantId });
      const levels = await dna.listLevels(tenantId);
      return roles.map((r) => ({ ...r, levels: levels.filter((l) => l.jobRoleId === r.id) }));
    },
    async listLevels(tenantId, jobRoleId) {
      const rep = { tenantId };
      let sql = `SELECT id, job_role_id AS "jobRoleId", name, level_order AS "levelOrder", required_program_tier AS "requiredProgramTier"
                   FROM lna_career_levels WHERE tenant_id = :tenantId`;
      if (jobRoleId) { sql += ' AND job_role_id = :jobRoleId'; rep.jobRoleId = jobRoleId; }
      return select(`${sql} ORDER BY level_order`, rep);
    },
    async createJobRole(tenantId, { name, division, description, levels }) {
      const t = await sequelize.transaction();
      try {
        const [[role]] = await sequelize.query(
          `INSERT INTO lna_job_roles (tenant_id, name, division, description) VALUES (:tenantId, :name, :division, :description)
           RETURNING id, name, division, description`,
          { replacements: { tenantId, name, division: division ?? null, description: description ?? null }, transaction: t },
        );
        const created = [];
        for (const [i, l] of (levels || []).entries()) {
          const [[lvl]] = await sequelize.query(
            `INSERT INTO lna_career_levels (tenant_id, job_role_id, name, level_order, required_program_tier)
             VALUES (:tenantId, :roleId, :name, :order, :tier)
             RETURNING id, job_role_id AS "jobRoleId", name, level_order AS "levelOrder", required_program_tier AS "requiredProgramTier"`,
            { replacements: { tenantId, roleId: role.id, name: l.name, order: i, tier: l.programTier ?? null }, transaction: t },
          );
          created.push(lvl);
        }
        await t.commit();
        return { ...role, levels: created };
      } catch (e) { await t.rollback(); throw e; }
    },
    async listCompetencies(tenantId, { jobRoleId, careerLevelId } = {}) {
      const rep = { tenantId };
      let sql = `SELECT ${COMPETENCY_COLS} FROM lna_competencies c WHERE c.tenant_id = :tenantId`;
      if (jobRoleId) { sql += ' AND c.job_role_id = :jobRoleId'; rep.jobRoleId = jobRoleId; }
      if (careerLevelId) { sql += ' AND (c.career_level_id = :careerLevelId OR c.career_level_id IS NULL)'; rep.careerLevelId = careerLevelId; }
      return select(`${sql} ORDER BY c.kind, c.name`, rep);
    },
    /** Kompetensi yang berlaku untuk posisi karyawan: kompetensi jabatan levelnya + kompetensi umum role + inti org. */
    async competenciesForPosition(tenantId, { jobRoleId, careerLevelId }) {
      return select(`SELECT ${COMPETENCY_COLS} FROM lna_competencies c
                      WHERE c.tenant_id = :tenantId
                        AND ((c.job_role_id = :jobRoleId AND (c.career_level_id IS NULL OR c.career_level_id = :careerLevelId))
                             OR (c.kind = 'core' AND c.job_role_id IS NULL))
                      ORDER BY c.kind, c.name`, { tenantId, jobRoleId: jobRoleId ?? null, careerLevelId: careerLevelId ?? null });
    },
    async getCompetency(tenantId, id) {
      return one(`SELECT ${COMPETENCY_COLS} FROM lna_competencies c WHERE c.tenant_id = :tenantId AND c.id = :id`, { tenantId, id });
    },
    async createCompetency(tenantId, c) {
      return insert(`INSERT INTO lna_competencies (tenant_id, job_role_id, career_level_id, kind, name, definition, indicators, source, required_score, importance)
                     VALUES (:tenantId, :jobRoleId, :careerLevelId, :kind, :name, :definition, CAST(:indicators AS jsonb), :source, :requiredScore, :importance)
                     RETURNING id, job_role_id AS "jobRoleId", career_level_id AS "careerLevelId", kind, name, definition, indicators, source,
                               version, required_score AS "requiredScore", importance, approved_at AS "approvedAt"`,
      { tenantId, ...c, indicators: JSON.stringify(c.indicators || []) });
    },
    async approveCompetency(tenantId, id, userId) {
      return insert(`UPDATE lna_competencies SET approved_at = now(), approved_by = :userId
                      WHERE tenant_id = :tenantId AND id = :id RETURNING id, approved_at AS "approvedAt"`, { tenantId, id, userId });
    },
    async assessments(tenantId, userId) {
      return open(tenantId, await select(`SELECT id, competency_id AS "competencyId", score, confidence, evidence, session_id AS "sessionId", source, assessor,
                            assessed_at AS "assessedAt", created_at AS "createdAt"
                       FROM lna_assessments WHERE tenant_id = :tenantId AND user_id = :userId ORDER BY created_at`, { tenantId, userId }), ['evidence']);
    },
    async assessmentsFor(tenantId, userIds) {
      if (!userIds.length) return [];
      return select(`SELECT user_id AS "userId", competency_id AS "competencyId", score, source, assessed_at AS "assessedAt", created_at AS "createdAt"
                       FROM lna_assessments WHERE tenant_id = :tenantId AND user_id IN (:userIds)`, { tenantId, userIds });
    },
    async addAssessment(tenantId, a) {
      return insert(`INSERT INTO lna_assessments (tenant_id, user_id, competency_id, session_id, score, confidence, evidence, source, assessor, assessed_at, import_batch_id)
                     VALUES (:tenantId, :userId, :competencyId, :sessionId, :score, :confidence, :evidence, COALESCE(:source, 'ai_interview'), :assessor, :assessedAt, :importBatchId)
                     RETURNING id, competency_id AS "competencyId", score, source, assessed_at AS "assessedAt", created_at AS "createdAt"`,
      withNulls({ tenantId, ...a, evidence: await enc(tenantId, a.evidence) }, ['sessionId', 'confidence', 'evidence', 'source', 'assessor', 'assessedAt', 'importBatchId']));
    },
    async completions(tenantId, userIds) {
      if (!userIds.length) return [];
      return select(`SELECT user_id AS "userId", program_tier AS "programTier", status, source, passed_at AS "passedAt"
                       FROM lna_program_completions WHERE tenant_id = :tenantId AND user_id IN (:userIds)`, { tenantId, userIds });
    },
    async upsertCompletion(tenantId, c) {
      return insert(`INSERT INTO lna_program_completions (tenant_id, user_id, program_tier, status, source, passed_at, recorded_by)
                     VALUES (:tenantId, :userId, :programTier, :status, :source, :passedAt, :recordedBy)
                     ON CONFLICT (tenant_id, user_id, program_tier) DO UPDATE
                       SET status = EXCLUDED.status, source = EXCLUDED.source, passed_at = EXCLUDED.passed_at,
                           recorded_by = EXCLUDED.recorded_by, updated_at = now()
                     RETURNING user_id AS "userId", program_tier AS "programTier", status, source, passed_at AS "passedAt"`,
      withNulls({ tenantId, ...c }, ['passedAt', 'recordedBy']));
    },
  };

  const interviews = {
    async create(tenantId, s) {
      return insert(`INSERT INTO lna_interview_sessions (tenant_id, project_id, submodule, interviewee_id, job_role_id, trigger_record_ids)
                     VALUES (:tenantId, :projectId, :submodule, :intervieweeId, :jobRoleId, CAST(:triggers AS uuid[]))
                     RETURNING id, project_id AS "projectId", submodule, interviewee_id AS "intervieweeId", status, trigger_record_ids AS "triggerRecordIds"`,
      { ...withNulls({ tenantId, ...s }, ['jobRoleId']), triggers: `{${(s.triggerRecordIds || []).join(',')}}` });
    },
    async openFor(tenantId, { projectId, submodule }) {
      const rows = await select(`SELECT interviewee_id AS "userId" FROM lna_interview_sessions
                                  WHERE tenant_id = :tenantId AND project_id = :projectId AND submodule = :submodule AND status <> 'abandoned'`,
      { tenantId, projectId, submodule });
      return new Set(rows.map((r) => r.userId));
    },
    async list(tenantId, submodule, scope, { projectId } = {}) {
      const rep = { tenantId, submodule };
      let sql = `SELECT s.id, s.project_id AS "projectId", s.interviewee_id AS "intervieweeId", u.name AS "intervieweeName",
                        s.status, s.mode, s.consent_at AS "consentAt", s.started_at AS "startedAt", s.ended_at AS "endedAt",
                        cardinality(s.trigger_record_ids) AS "triggerCount"
                   FROM lna_interview_sessions s JOIN users u ON u.id = s.interviewee_id
                  WHERE s.tenant_id = :tenantId AND s.submodule = :submodule`;
      sql += scopeSql('s.interviewee_id', scope, rep);
      if (projectId) { sql += ' AND s.project_id = :projectId'; rep.projectId = projectId; }
      return select(`${sql} ORDER BY s.created_at DESC`, rep);
    },
    async get(tenantId, id) {
      return one(`SELECT id, project_id AS "projectId", submodule, interviewee_id AS "intervieweeId", job_role_id AS "jobRoleId",
                         status, mode, consent_at AS "consentAt", trigger_record_ids AS "triggerRecordIds",
                         started_at AS "startedAt", ended_at AS "endedAt"
                    FROM lna_interview_sessions WHERE tenant_id = :tenantId AND id = :id`, { tenantId, id });
    },
    async turns(tenantId, sessionId) {
      const rows = await select(`SELECT t.speaker, t.text, t.at FROM lna_interview_turns t
                                   JOIN lna_interview_sessions s ON s.id = t.session_id
                                  WHERE s.tenant_id = :tenantId AND t.session_id = :sessionId ORDER BY t.id`, { tenantId, sessionId });
      return open(tenantId, rows, ['text']);
    },
    async addTurn(tenantId, sessionId, speaker, text) {
      const row = await insert(`INSERT INTO lna_interview_turns (session_id, speaker, text)
                                SELECT s.id, :speaker, :text FROM lna_interview_sessions s WHERE s.tenant_id = :tenantId AND s.id = :sessionId
                                RETURNING speaker, at`, { tenantId, sessionId, speaker, text: await enc(tenantId, text) });
      return row ? { ...row, text } : null;
    },
    async update(tenantId, id, fields) {
      const allowed = { status: 'status', consentAt: 'consent_at', startedAt: 'started_at', endedAt: 'ended_at' };
      const sets = Object.keys(fields).filter((k) => allowed[k]).map((k) => `${allowed[k]} = :${k}`);
      if (!sets.length) return null;
      return insert(`UPDATE lna_interview_sessions SET ${sets.join(', ')} WHERE tenant_id = :tenantId AND id = :id RETURNING id, status`,
        { tenantId, id, ...fields });
    },
  };

  const tna = {
    async insertPerformance(tenantId, rows, { projectId, period, batchId }) {
      const t = await sequelize.transaction();
      try {
        for (const r of rows) {
          await sequelize.query(
            `INSERT INTO lna_performance_records (tenant_id, project_id, user_id, metric_type, name, target, actual, is_met, period, direction, unit, value_type, import_batch_id)
             VALUES (:tenantId, :projectId, :userId, :metricType, :name, :target, :actual, :isMet, :period, :direction, :unit, COALESCE(:valueType, 'angka'), :batchId)`,
            { replacements: withNulls({ tenantId, projectId, period, batchId, ...r }, ['projectId', 'period', 'unit', 'isMet', 'valueType']), transaction: t },
          );
        }
        await t.commit();
      } catch (e) { await t.rollback(); throw e; }
    },
    async listPerformance(tenantId, scope, { period, projectId, userIds } = {}) {
      const rep = { tenantId };
      let sql = `SELECT r.id, r.user_id AS "userId", u.name AS "userName", r.metric_type AS "metricType", r.name,
                        r.target::float AS target, r.actual::float AS actual, r.is_met AS "isMet", r.period, r.direction, r.unit,
                        r.value_type AS "valueType"
                   FROM lna_performance_records r JOIN users u ON u.id = r.user_id
                  WHERE r.tenant_id = :tenantId`;
      sql += scopeSql('r.user_id', scope, rep);
      if (period) { sql += ' AND r.period = :period'; rep.period = period; }
      if (projectId) { sql += ' AND (r.project_id = :projectId OR r.project_id IS NULL)'; rep.projectId = projectId; }
      if (userIds) { sql += ' AND r.user_id IN (:userIds)'; rep.userIds = userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']; }
      return select(`${sql} ORDER BY u.name, r.name`, rep);
    },
    async performanceByIds(tenantId, ids) {
      if (!ids || !ids.length) return [];
      return select(`SELECT id, user_id AS "userId", metric_type AS "metricType", name, target::float AS target, actual::float AS actual,
                            is_met AS "isMet", period, direction FROM lna_performance_records WHERE tenant_id = :tenantId AND id IN (:ids)`,
      { tenantId, ids });
    },
    async insertFinding(tenantId, f) {
      return insert(`INSERT INTO lna_findings (tenant_id, project_id, user_id, competency_id, session_id, category, title, detail,
                                                gap_score, performance_record_id, linked_finding_id)
                     VALUES (:tenantId, :projectId, :userId, :competencyId, :sessionId, :category, :title, :detail,
                             :gapScore, :performanceRecordId, :linkedFindingId)
                     RETURNING id, category`,
      withNulls({ tenantId, ...f, title: await enc(tenantId, f.title), detail: await enc(tenantId, f.detail) },
        ['competencyId', 'sessionId', 'detail', 'gapScore', 'performanceRecordId', 'linkedFindingId']))
        .then((row) => ({ ...row, title: f.title }));
    },
    async listFindings(tenantId, scope, { projectId, categories }) {
      const rep = { tenantId, categories };
      let sql = `SELECT f.id, f.project_id AS "projectId", f.user_id AS "userId", u.name AS "userName", f.category, f.title, f.detail,
                        f.status, f.competency_id AS "competencyId", c.name AS "competencyName", c.importance,
                        f.performance_record_id AS "performanceRecordId", pr.name AS "metricName",
                        pr.target::float AS target, pr.actual::float AS actual, pr.direction, f.created_at AS "createdAt"
                   FROM lna_findings f
                   LEFT JOIN users u ON u.id = f.user_id
                   LEFT JOIN lna_competencies c ON c.id = f.competency_id
                   LEFT JOIN lna_performance_records pr ON pr.id = f.performance_record_id
                  WHERE f.tenant_id = :tenantId AND f.category IN (:categories)`;
      sql += scopeSql('f.user_id', scope, rep);
      if (projectId) { sql += ' AND f.project_id = :projectId'; rep.projectId = projectId; }
      return open(tenantId, await select(`${sql} ORDER BY f.created_at DESC`, rep), ['title', 'detail']);
    },
    async getFinding(tenantId, id) {
      return open(tenantId, await one(`SELECT f.id, f.user_id AS "userId", f.category, f.title, f.competency_id AS "competencyId", f.status
                    FROM lna_findings f WHERE f.tenant_id = :tenantId AND f.id = :id`, { tenantId, id }), ['title']);
    },
    async setFindingStatus(tenantId, id, status) {
      return insert('UPDATE lna_findings SET status = :status WHERE tenant_id = :tenantId AND id = :id RETURNING id, status', { tenantId, id, status });
    },
    async insertPlanItem(tenantId, p) {
      return insert(`INSERT INTO lna_training_plan_items (tenant_id, finding_id, user_id, origin, status, program_tier,
                                                           catalog_source, catalog_item_ref, catalog_item_title, note, requested_by)
                     VALUES (:tenantId, :findingId, :userId, :origin, :status, :programTier, :catalogSource, :catalogItemRef,
                             :catalogItemTitle, :note, :requestedBy)
                     RETURNING id, user_id AS "userId", finding_id AS "findingId", origin, status, catalog_source AS "catalogSource",
                               catalog_item_ref AS "catalogItemRef", catalog_item_title AS "catalogItemTitle", note`,
      withNulls({ tenantId, ...p, note: await enc(tenantId, p.note) }, ['findingId', 'programTier', 'catalogSource', 'catalogItemRef', 'catalogItemTitle', 'note', 'requestedBy']))
        .then((row) => open(tenantId, row, ['note']));
    },
    async listPlanItems(tenantId, scope) {
      const rep = { tenantId };
      const sql = `SELECT ${PLAN_COLS}, f.title AS "findingTitle" FROM lna_training_plan_items p
                     JOIN users u ON u.id = p.user_id LEFT JOIN lna_findings f ON f.id = p.finding_id
                    WHERE p.tenant_id = :tenantId${scopeSql('p.user_id', scope, rep)} ORDER BY p.created_at DESC`;
      return open(tenantId, await select(sql, rep), ['note', 'findingTitle']);
    },
    async getPlanItem(tenantId, id) {
      return open(tenantId, await one(`SELECT ${PLAN_COLS} FROM lna_training_plan_items p JOIN users u ON u.id = p.user_id
                   WHERE p.tenant_id = :tenantId AND p.id = :id`, { tenantId, id }), ['note']);
    },
    async updatePlanItem(tenantId, id, { status, catalogItemRef, catalogItemTitle, catalogSource }) {
      return insert(`UPDATE lna_training_plan_items
                        SET status = COALESCE(:status, status),
                            catalog_item_ref = COALESCE(:catalogItemRef, catalog_item_ref),
                            catalog_item_title = COALESCE(:catalogItemTitle, catalog_item_title),
                            catalog_source = COALESCE(:catalogSource, catalog_source),
                            updated_at = now()
                      WHERE tenant_id = :tenantId AND id = :id RETURNING id, status`,
      { tenantId, id, status: status ?? null, catalogItemRef: catalogItemRef ?? null, catalogItemTitle: catalogItemTitle ?? null, catalogSource: catalogSource ?? null });
    },
  };

  const projectsExtra = {
    async exists(tenantId, id) {
      return Boolean(await one('SELECT id FROM lna_projects WHERE tenant_id = :tenantId AND id = :id', { tenantId, id }));
    },
  };

  const BATCH_COLS = `b.id, b.submodule, b.kind, b.filename, b.status, b.row_count AS "rowCount", b.headers, b.mapping, b.options,
    b.result, b.created_at AS "createdAt", b.committed_at AS "committedAt", u.name AS "createdByName"`;
  const imports = {
    async create(tenantId, b) {
      await sequelize.query(
        `INSERT INTO import_batches (id, tenant_id, submodule, kind, filename, row_count, headers, rows, mapping, created_by)
         VALUES (:id, :tenantId, :submodule, :kind, :filename, :rowCount, CAST(:headers AS jsonb), CAST(:rows AS jsonb), CAST(:mapping AS jsonb), :createdBy)`,
        { replacements: { ...b, tenantId, headers: JSON.stringify(b.headers), rows: JSON.stringify(await cipher.encryptJson(tenantId, b.rows)), mapping: JSON.stringify(b.mapping || {}) } },
      );
      return imports.get(tenantId, b.id);
    },
    async get(tenantId, id) {
      const row = await one(`SELECT ${BATCH_COLS}, b.rows FROM import_batches b LEFT JOIN users u ON u.id = b.created_by
                   WHERE b.tenant_id = :tenantId AND b.id = :id`, { tenantId, id });
      if (row) row.rows = await cipher.decryptJson(tenantId, row.rows);
      return row;
    },
    async list(tenantId, submodule) {
      return select(`SELECT ${BATCH_COLS} FROM import_batches b LEFT JOIN users u ON u.id = b.created_by
                      WHERE b.tenant_id = :tenantId AND b.submodule = :submodule ORDER BY b.created_at DESC LIMIT 100`, { tenantId, submodule });
    },
    async update(tenantId, id, patch) {
      const sets = []; const rep = { tenantId, id };
      for (const k of ['mapping', 'options', 'result', 'rows']) {
        if (patch[k] !== undefined) { sets.push(`${k} = CAST(:${k} AS jsonb)`); rep[k] = JSON.stringify(patch[k]); }
      }
      if (patch.status) { sets.push('status = :status'); rep.status = patch.status; }
      if (patch.committedAt) { sets.push('committed_at = :committedAt'); rep.committedAt = patch.committedAt; }
      if (patch.committedBy) { sets.push('committed_by = :committedBy'); rep.committedBy = patch.committedBy; }
      if (sets.length) await sequelize.query(`UPDATE import_batches SET ${sets.join(', ')} WHERE tenant_id = :tenantId AND id = :id`, { replacements: rep });
      return imports.get(tenantId, id);
    },
  };

  return { people, settings, dna, interviews, tna, projectsExtra, imports };
}

module.exports = { createLnaStores, scopeSql };
