'use strict';
// Store Postgres untuk DNA, TNA, dan wawancara (POC Desember). Setiap query memfilter tenant_id,
// dan query data karyawan menerima `scope` dari visibleEmployeeScope() (RG-3).
const { QueryTypes } = require('sequelize');
const { createLiStores } = require('./li-stores');
const { createLdStores } = require('./ld-stores');
const { evaluate, effectiveRule, metricKey } = require('../modules/tna/performance');
const { planAssignments } = require('../modules/tna/assignment');
const { summaryStateOf, MAX_RESTARTS } = require('../modules/interviews/summary');

const COMPETENCY_COLS = `c.id, c.job_role_id AS "jobRoleId", c.career_level_id AS "careerLevelId", c.kind, c.name,
  c.definition, c.indicators, c.source, c.version, c.required_score AS "requiredScore", c.importance,
  c.approved_at AS "approvedAt"`;

/** Baris { reviewStatus, n } menjadi hitungan per status review, status tanpa baris bernilai 0. */
function byReviewStatus(rows) {
  const out = { draft: 0, approved: 0, edited: 0, rejected: 0 };
  for (const r of rows) out[r.reviewStatus] = r.n;
  return out;
}
const PLAN_COLS = `p.id, p.user_id AS "userId", u.name AS "userName", p.finding_id AS "findingId", p.origin, p.status,
  p.program_tier AS "programTier", p.catalog_source AS "catalogSource", p.catalog_item_ref AS "catalogItemRef",
  p.catalog_item_title AS "catalogItemTitle", (p.catalog_item_ref IS NULL AND p.origin <> 'learner_request') AS "needsModule", p.note, p.requested_by AS "requestedBy", p.created_at AS "createdAt",
  p.updated_at AS "updatedAt"`;

// PK-14: hanya temuan yang sudah direview yang boleh dipakai di luar antrean review
const { REVIEWED } = require('../modules/tna/review-status');
const { scopeSql } = require('./scope-sql');
const REVIEW_COLS = `f.id, f.project_id AS "projectId", f.session_id AS "sessionId", f.user_id AS "userId", u.name AS "userName",
  f.category, f.title, f.detail, f.competency_id AS "competencyId", c.name AS "competencyName",
  f.performance_record_id AS "performanceRecordId", pr.name AS "metricName", pr.target::float AS target, pr.actual::float AS actual,
  f.confidence::float AS confidence, f.scoring_agreement AS "scoringAgreement", f.review_status AS "reviewStatus",
  f.reviewed_by AS "reviewedBy", r.name AS "reviewedByName", f.reviewed_at AS "reviewedAt", f.review_note AS "reviewNote",
  f.original_title AS "originalTitle", f.original_detail AS "originalDetail", f.original_category AS "originalCategory",
  f.created_at AS "createdAt",
  s.status AS "sessionStatus", s.summary_at AS "summaryAt", s.summary_confirmed_at AS "summaryConfirmedAt",
  s.summary_disputed AS "summaryDisputed", s.summary_note AS "summaryNote"`;
const REVIEW_ENC = ['title', 'detail', 'reviewNote', 'originalTitle', 'originalDetail', 'summaryNote'];
const REVIEW_JOIN_SESSION = 'LEFT JOIN lna_interview_sessions s ON s.id = f.session_id AND s.tenant_id = f.tenant_id';

/** B6 (A9): kolom sesi mentah diganti satu tanda `summaryState` (+ catatan karyawan bila ada). */
function withSummaryState(row) {
  const { sessionStatus, summaryAt, summaryConfirmedAt, summaryDisputed, summaryNote, ...rest } = row;
  const session = row.sessionId && sessionStatus ? { status: sessionStatus, summaryAt, summaryConfirmedAt, summaryDisputed } : null;
  return { ...rest, summaryState: summaryStateOf(session), summaryNote: summaryNote ?? null };
}

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
      return select(`SELECT id, email, employee_id AS "employeeId", role, job_role_id AS "jobRoleId", career_level_id AS "careerLevelId"
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
                WHERE tenant_id = :tenantId AND id = :id AND role NOT IN ('hr_admin','eta_admin')`,
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
    /**
     * PK-15: hapus karyawan (hak hapus subjek data). Satu transaksi: bersihkan barisnya dari riwayat impor,
     * lalu DELETE user. FK menghapus data turunan (kinerja, sesi + transkrip, temuan, rencana, asesmen, link masuk)
     * dan mengosongkan user_id di audit_logs (diizinkan trigger 20261117000502). Akun HR/Admin tidak dihapus di sini.
     */
    async deleteEmployee(tenantId, userId) {
      return sequelize.transaction(async (transaction) => {
        const [person] = await sequelize.query(
          `SELECT id, employee_id AS "employeeId", email, role FROM users WHERE tenant_id = :tenantId AND id = :userId FOR UPDATE`,
          { replacements: { tenantId, userId }, type: QueryTypes.SELECT, transaction },
        );
        if (!person || ['hr_admin', 'eta_admin'].includes(person.role)) return null;
        const scrubbed = await imports.scrubEmployee(tenantId, person, { transaction });
        await sequelize.query('DELETE FROM users WHERE tenant_id = :tenantId AND id = :userId',
          { replacements: { tenantId, userId }, transaction });
        return { id: person.id, scrubbedImportRows: scrubbed };
      });
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
    /** B6 (A8): ID kompetensi yang masih ada di tenant ini. */
    async existingCompetencyIds(tenantId, ids) {
      if (!ids || !ids.length) return [];
      return (await select('SELECT id FROM lna_competencies WHERE tenant_id = :tenantId AND id IN (:ids)', { tenantId, ids })).map((r) => r.id);
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
      return insert(`INSERT INTO lna_interview_sessions (tenant_id, project_id, submodule, interviewee_id, job_role_id, trigger_record_ids, invite_expires_at)
                     VALUES (:tenantId, :projectId, :submodule, :intervieweeId, :jobRoleId, CAST(:triggers AS uuid[]),
                             COALESCE(CAST(:inviteExpiresAt AS timestamptz), now() + interval '7 days'))
                     RETURNING id, project_id AS "projectId", submodule, interviewee_id AS "intervieweeId", status, trigger_record_ids AS "triggerRecordIds",
                               invite_expires_at AS "inviteExpiresAt"`,
      { ...withNulls({ tenantId, ...s }, ['jobRoleId', 'inviteExpiresAt']), triggers: `{${(s.triggerRecordIds || []).join(',')}}` });
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
                        s.status, s.mode, s.consent_at AS "consentAt", s.consent_version AS "consentVersion", s.started_at AS "startedAt", s.ended_at AS "endedAt",
                        cardinality(s.trigger_record_ids) AS "triggerCount", j.status AS "analysisStatus", s.invite_expires_at AS "inviteExpiresAt",
                        s.invite_extended_count AS "inviteExtendedCount",
                        s.duration_minutes AS "durationMinutes", s.focus_kind AS "focusKind", s.focus_label AS "focusLabel",
                        s.assigned_by AS "assignedBy", ab.name AS "assignedByName"
                   FROM lna_interview_sessions s JOIN users u ON u.id = s.interviewee_id
                   LEFT JOIN users ab ON ab.id = s.assigned_by AND ab.tenant_id = s.tenant_id
                   LEFT JOIN lna_analysis_jobs j ON j.session_id = s.id
                  WHERE s.tenant_id = :tenantId AND s.submodule = :submodule`;
      sql += scopeSql('s.interviewee_id', scope, rep);
      if (projectId) { sql += ' AND s.project_id = :projectId'; rep.projectId = projectId; }
      return select(`${sql} ORDER BY s.created_at DESC`, rep);
    },
    async get(tenantId, id) {
      return one(`SELECT s.id, s.project_id AS "projectId", s.submodule, s.interviewee_id AS "intervieweeId", s.job_role_id AS "jobRoleId",
                         s.status, s.mode, s.consent_at AS "consentAt", s.consent_version AS "consentVersion", s.trigger_record_ids AS "triggerRecordIds",
                         s.started_at AS "startedAt", s.ended_at AS "endedAt", s.invite_expires_at AS "inviteExpiresAt",
                         s.invite_extended_count AS "inviteExtendedCount",
                         s.duration_minutes AS "durationMinutes", s.focus_kind AS "focusKind", s.focus_label AS "focusLabel",
                         s.assigned_by AS "assignedBy", ab.name AS "assignedByName",
                         s.summary_at AS "summaryAt", s.summary_confirmed_at AS "summaryConfirmedAt",
                         s.summary_disputed AS "summaryDisputed", s.restart_count AS "restartCount"
                    FROM lna_interview_sessions s
                    LEFT JOIN users ab ON ab.id = s.assigned_by AND ab.tenant_id = s.tenant_id
                   WHERE s.tenant_id = :tenantId AND s.id = :id`, { tenantId, id });
    },
    // --- B6: ringkasan temuan yang diperiksa karyawan. Isi ringkasan dan catatan karyawan terenkripsi dan
    // hanya dimuat lewat getSummary/summaryForAnalysis, tidak pernah lewat get() ---
    /**
     * Simpan ringkasan hanya bila sesi masih berjalan, belum punya ringkasan, belum diulang, dan tidak ada jawaban baru
     * sejak permintaan dimulai (A2). null bila kalah balapan.
     */
    async saveSummary(tenantId, id, findings, { restartCount, turnCount }) {
      // turnCount: jumlah giliran saat transkrip dibaca. Jawaban yang masuk selama AI meringkas membatalkan ringkasan ini.
      return insert(`UPDATE lna_interview_sessions s SET summary_findings = CAST(:findings AS jsonb), summary_at = now()
                      WHERE s.tenant_id = :tenantId AND s.id = :id AND s.status = 'in_progress' AND s.summary_at IS NULL AND s.restart_count = :restartCount
                        AND (SELECT count(*) FROM lna_interview_turns t WHERE t.session_id = s.id) = :turnCount
                      RETURNING s.id, s.summary_at AS "summaryAt"`,
      { tenantId, id, restartCount, turnCount, findings: JSON.stringify(await cipher.encryptJson(tenantId, findings)) });
    },
    async getSummary(tenantId, id) {
      const row = await one(`SELECT status, summary_findings AS findings, summary_at AS "summaryAt", summary_confirmed_at AS "summaryConfirmedAt",
                                    summary_disputed AS "summaryDisputed", restart_count AS "restartCount"
                               FROM lna_interview_sessions WHERE tenant_id = :tenantId AND id = :id AND summary_at IS NOT NULL`, { tenantId, id });
      if (!row) return null;
      return { ...row, findings: (await cipher.decryptJson(tenantId, row.findings)) || [] };
    },
    /** A8: temuan yang dikonfirmasi karyawan menjadi penilaian pertama job analisis. null bila tidak dikonfirmasi. */
    async summaryForAnalysis(tenantId, id) {
      const row = await one(`SELECT summary_findings AS findings FROM lna_interview_sessions
                              WHERE tenant_id = :tenantId AND id = :id AND summary_at IS NOT NULL AND summary_confirmed_at IS NOT NULL`, { tenantId, id });
      return row ? (await cipher.decryptJson(tenantId, row.findings)) || [] : null;
    },
    /**
     * A5: konfirmasi ringkasan, tutup sesi, dan buat job analisis dalam satu transaksi. Dari dua permintaan
     * bersamaan hanya satu yang mendapat baris; yang lain null.
     */
    async confirmSummary(tenantId, id, { submodule, disputed = false, note = null }) {
      const noteEnc = note ? await enc(tenantId, note) : null;
      return sequelize.transaction(async (transaction) => {
        const [[session]] = await sequelize.query(
          `UPDATE lna_interview_sessions
              SET status = 'completed', ended_at = now(), summary_confirmed_at = now(), summary_disputed = :disputed, summary_note = :note
            WHERE tenant_id = :tenantId AND id = :id AND status = 'in_progress' AND summary_at IS NOT NULL AND summary_confirmed_at IS NULL
            RETURNING id, status`, { replacements: { tenantId, id, disputed, note: noteEnc }, transaction });
        if (!session) return null;
        const [[job]] = await sequelize.query(
          `INSERT INTO lna_analysis_jobs (tenant_id, session_id, submodule) VALUES (:tenantId, :sessionId, :submodule)
           ON CONFLICT (session_id) DO UPDATE SET session_id = EXCLUDED.session_id
           RETURNING id, status`, { replacements: { tenantId, sessionId: id, submodule }, transaction });
        return { session, job };
      });
    },
    /**
     * A6: ulangi wawancara. Giliran dihapus lewat sesi (tabel giliran tidak punya tenant_id), sesi kembali
     * 'scheduled' dan persetujuan dikosongkan. null bila sesi tidak lagi berjalan atau jatah ulang habis.
     */
    async restart(tenantId, id) {
      return sequelize.transaction(async (transaction) => {
        const q = (sql) => sequelize.query(sql, { replacements: { tenantId, id, max: MAX_RESTARTS }, transaction });
        const [[locked]] = await q(`SELECT id FROM lna_interview_sessions
                                     WHERE tenant_id = :tenantId AND id = :id AND status = 'in_progress' AND restart_count < :max FOR UPDATE`);
        if (!locked) return null;
        const [deleted] = await q(`DELETE FROM lna_interview_turns t USING lna_interview_sessions s
                                    WHERE s.id = t.session_id AND s.tenant_id = :tenantId AND s.id = :id RETURNING t.id`);
        const [[row]] = await q(`UPDATE lna_interview_sessions
                                    SET status = 'scheduled', consent_at = NULL, consent_version = NULL, started_at = NULL,
                                        summary_findings = NULL, summary_at = NULL, restart_count = restart_count + 1
                                  WHERE tenant_id = :tenantId AND id = :id
                                  RETURNING id, status, restart_count AS "restartCount"`);
        return { ...row, deletedTurns: deleted.length };
      });
    },
    /** B5 (R8): sesi TNA dalam cakupan beserta gap fokusnya, terbaru lebih dulu. */
    async gapSessions(tenantId, scope) {
      const rep = { tenantId };
      const sql = `SELECT s.id, s.project_id AS "projectId", s.interviewee_id AS "intervieweeId", s.status,
                          s.invite_expires_at AS "inviteExpiresAt", s.trigger_record_ids AS "triggerRecordIds",
                          s.focus_kind AS "focusKind", s.focus_competency_id AS "focusCompetencyId", s.focus_metric_type AS "focusMetricType",
                          s.focus_metric_key AS "focusMetricKey", s.focus_period AS "focusPeriod"
                     FROM lna_interview_sessions s
                    WHERE s.tenant_id = :tenantId AND s.submodule = 'tna'${scopeSql('s.interviewee_id', scope, rep)}
                    ORDER BY s.created_at DESC, s.id`;
      return select(sql, rep);
    },
    /**
     * B5 (R10): tugaskan wawancara TNA untuk satu gap. Satu transaksi dengan kunci per (tenant, proyek) supaya dua
     * permintaan bersamaan tidak membuat sesi ganda. Satu sesi terbuka per orang per proyek; sesi terjadwal yang
     * undangannya sudah lewat digantikan (abandoned). eligible: [{ userId, jobRoleId, triggerRecordIds }].
     */
    async assign(tenantId, { projectId, assignedBy, eligible, dueAt, durationMinutes, focus, now = new Date() }) {
      return sequelize.transaction(async (transaction) => {
        const run = (sql, replacements) => sequelize.query(sql, { replacements, transaction });
        await run('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))', { key: `tna-assign:${tenantId}:${projectId}` });
        const userIds = eligible.map((e) => e.userId);
        const [existing] = userIds.length ? await run(
          `SELECT id, interviewee_id AS "intervieweeId", status, invite_expires_at AS "inviteExpiresAt"
             FROM lna_interview_sessions
            WHERE tenant_id = :tenantId AND project_id = :projectId AND submodule = 'tna'
              AND status IN ('scheduled','in_progress') AND interviewee_id IN (:userIds)`, { tenantId, projectId, userIds }) : [[]];
        const plan = planAssignments({ eligible, existing, now });
        const assigned = [];
        for (const a of plan.assign) {
          if (a.replaceSessionIds.length) {
            await run(`UPDATE lna_interview_sessions SET status = 'abandoned', ended_at = now()
                        WHERE tenant_id = :tenantId AND id IN (:ids) AND status = 'scheduled'`, { tenantId, ids: a.replaceSessionIds });
          }
          const [[row]] = await run(
            `INSERT INTO lna_interview_sessions (tenant_id, project_id, submodule, interviewee_id, job_role_id, trigger_record_ids, invite_expires_at,
                                                 assigned_by, duration_minutes, focus_kind, focus_competency_id, focus_metric_type, focus_metric_key,
                                                 focus_period, focus_label)
             VALUES (:tenantId, :projectId, 'tna', :userId, :jobRoleId, CAST(:triggers AS uuid[]), :dueAt,
                     :assignedBy, :durationMinutes, :kind, :competencyId, :metricType, :metricKey, :period, :label)
             RETURNING id, invite_expires_at AS "inviteExpiresAt"`,
            {
              tenantId, projectId, userId: a.userId, jobRoleId: a.jobRoleId ?? null, triggers: `{${(a.triggerRecordIds || []).join(',')}}`,
              dueAt, assignedBy, durationMinutes, kind: focus.kind, competencyId: focus.competencyId ?? null,
              metricType: focus.metricType ?? null, metricKey: focus.kind === 'okr' ? metricKey(focus.name) : null,
              period: focus.period ?? null, label: focus.label,
            },
          );
          assigned.push({ sessionId: row.id, employeeId: a.userId, inviteExpiresAt: row.inviteExpiresAt, durationMinutes, replaced: a.replaceSessionIds.length > 0 });
        }
        return { assigned, skipped: plan.skipped };
      });
    },
    /** B5 (R10b): batalkan penugasan yang belum dimulai. null bila sesi bukan penugasan atau sudah berjalan/selesai. */
    async cancelAssigned(tenantId, id) {
      return insert(`UPDATE lna_interview_sessions SET status = 'abandoned', ended_at = now()
                      WHERE tenant_id = :tenantId AND id = :id AND submodule = 'tna' AND status = 'scheduled' AND assigned_by IS NOT NULL
                      RETURNING id, status`, { tenantId, id });
    },
    async turns(tenantId, sessionId) {
      const rows = await select(`SELECT t.speaker, t.text, t.at FROM lna_interview_turns t
                                   JOIN lna_interview_sessions s ON s.id = t.session_id
                                  WHERE s.tenant_id = :tenantId AND t.session_id = :sessionId ORDER BY t.id`, { tenantId, sessionId });
      return open(tenantId, rows, ['text']);
    },
    /**
     * Satu pintu penyimpanan giliran.
     * opts.guard = { restartCount }: giliran hanya tersimpan bila sesi masih berjalan, belum punya ringkasan, dan
     * belum diulang sejak permintaan dimulai (B6 A4). null bila tidak tersimpan.
     */
    async addTurn(tenantId, sessionId, speaker, text, opts = {}) {
      const rep = { tenantId, sessionId, speaker, text: await enc(tenantId, text) };
      let guard = '';
      if (opts.guard) {
        guard = " AND s.status = 'in_progress' AND s.summary_at IS NULL AND s.restart_count = :restartCount";
        rep.restartCount = opts.guard.restartCount ?? 0;
      }
      const row = await insert(`INSERT INTO lna_interview_turns (session_id, speaker, text)
                                SELECT s.id, :speaker, :text FROM lna_interview_sessions s WHERE s.tenant_id = :tenantId AND s.id = :sessionId${guard}
                                RETURNING speaker, at`, rep);
      return row ? { ...row, text } : null;
    },
    /** Tutup sesi hanya bila masih berjalan; null bila sudah ditutup permintaan lain (PK-14). */
    async close(tenantId, id) {
      return insert(`UPDATE lna_interview_sessions SET status = 'completed', ended_at = now()
                      WHERE tenant_id = :tenantId AND id = :id AND status = 'in_progress' RETURNING id, status`, { tenantId, id });
    },
    async update(tenantId, id, fields) {
      const allowed = { status: 'status', consentAt: 'consent_at', consentVersion: 'consent_version', startedAt: 'started_at', endedAt: 'ended_at' };
      const sets = Object.keys(fields).filter((k) => allowed[k]).map((k) => `${allowed[k]} = :${k}`);
      if (!sets.length) return null;
      return insert(`UPDATE lna_interview_sessions SET ${sets.join(', ')} WHERE tenant_id = :tenantId AND id = :id RETURNING id, status`,
        { tenantId, id, ...fields });
    },
    /** Q38: HR memperpanjang undangan. Pengingat H-3/H-1 di-reset agar dikirim lagi untuk batas baru. */
    async extendInvite(tenantId, id, inviteExpiresAt) {
      return insert(`UPDATE lna_interview_sessions
                        SET invite_expires_at = :inviteExpiresAt, invite_extended_count = invite_extended_count + 1,
                            reminder_h3_at = NULL, reminder_h1_at = NULL
                      WHERE tenant_id = :tenantId AND id = :id
                      RETURNING id, status, invite_expires_at AS "inviteExpiresAt", invite_extended_count AS "inviteExtendedCount"`,
      { tenantId, id, inviteExpiresAt });
    },
    /**
     * Job pengingat (lintas tenant, dipanggil job sistem, bukan request): sesi terbuka yang batasnya
     * dalam `withinDays` hari dan masih ada pengingat yang belum terkirim. Keputusan akhir di dueReminder().
     */
    async reminderCandidates({ now, withinDays }) {
      return select(`SELECT s.id, s.tenant_id AS "tenantId", s.submodule, s.status, s.invite_expires_at AS "inviteExpiresAt",
                            s.reminder_h3_at AS "reminderH3At", s.reminder_h1_at AS "reminderH1At", s.duration_minutes AS "durationMinutes",
                            u.id AS "userId", u.email, u.name, t.name AS "tenantName"
                       FROM lna_interview_sessions s
                       JOIN users u ON u.id = s.interviewee_id AND u.tenant_id = s.tenant_id
                       JOIN tenants t ON t.id = s.tenant_id
                      WHERE s.status IN ('scheduled','in_progress')
                        AND s.invite_expires_at > :now
                        AND s.invite_expires_at <= CAST(:now AS timestamptz) + make_interval(days => :withinDays)
                        AND (s.reminder_h3_at IS NULL OR s.reminder_h1_at IS NULL)
                        AND u.status <> 'disabled' AND t.status = 'active'
                      ORDER BY s.invite_expires_at`, { now, withinDays });
    },
    /** Tandai pengingat terkirim; hanya berhasil sekali per jenis (aman bila job berjalan ganda). */
    async markReminded(tenantId, id, kind, at) {
      const col = kind === 'h1' ? 'reminder_h1_at' : 'reminder_h3_at';
      const row = await insert(`UPDATE lna_interview_sessions SET ${col} = :at
                                 WHERE tenant_id = :tenantId AND id = :id AND ${col} IS NULL RETURNING id`, { tenantId, id, at });
      return Boolean(row);
    },
    async clearReminded(tenantId, id, kind) {
      const col = kind === 'h1' ? 'reminder_h1_at' : 'reminder_h3_at';
      await sequelize.query(`UPDATE lna_interview_sessions SET ${col} = NULL WHERE tenant_id = :tenantId AND id = :id`, { replacements: { tenantId, id } });
    },
  };

  const tna = {
    async insertPerformance(tenantId, rows, { projectId, period, batchId }) {
      const t = await sequelize.transaction();
      try {
        for (const r of rows) {
          await sequelize.query(
            `INSERT INTO lna_performance_records (tenant_id, project_id, user_id, metric_type, name, target, actual, is_met, period, direction, unit, value_type, import_batch_id, tolerance)
             VALUES (:tenantId, :projectId, :userId, :metricType, :name, :target, :actual, :isMet, :period, :direction, :unit, COALESCE(:valueType, 'angka'), :batchId, COALESCE(:tolerance, 0))`,
            { replacements: withNulls({ tenantId, projectId, period, batchId, ...r }, ['projectId', 'period', 'unit', 'isMet', 'valueType', 'tolerance']), transaction: t },
          );
        }
        await t.commit();
      } catch (e) { await t.rollback(); throw e; }
    },
    async listPerformance(tenantId, scope, { period, projectId, userIds } = {}) {
      const rep = { tenantId };
      let sql = `SELECT r.id, r.user_id AS "userId", u.name AS "userName", r.metric_type AS "metricType", r.name,
                        r.target::float AS target, r.actual::float AS actual, r.is_met AS "isMet", r.period, r.direction, r.unit,
                        r.value_type AS "valueType", r.tolerance::float AS tolerance
                   FROM lna_performance_records r JOIN users u ON u.id = r.user_id
                  WHERE r.tenant_id = :tenantId`;
      sql += scopeSql('r.user_id', scope, rep);
      if (period) { sql += ' AND r.period = :period'; rep.period = period; }
      if (projectId) { sql += ' AND (r.project_id = :projectId OR r.project_id IS NULL)'; rep.projectId = projectId; }
      if (userIds) { sql += ' AND r.user_id IN (:userIds)'; rep.userIds = userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']; }
      return select(`${sql} ORDER BY u.name, r.name`, rep);
    },
    /** B5 (R5): periode yang punya data dalam cakupan, yang paling baru diunggah lebih dulu. Baris tanpa periode diabaikan. */
    async performancePeriods(tenantId, scope) {
      const rep = { tenantId };
      const rows = await select(`SELECT r.period FROM lna_performance_records r
                                  WHERE r.tenant_id = :tenantId AND r.period IS NOT NULL${scopeSql('r.user_id', scope, rep)}
                                  GROUP BY r.period ORDER BY max(r.created_at) DESC, r.period DESC`, rep);
      return rows.map((r) => r.period);
    },
    /**
     * B5 (R6): temuan untuk klasifikasi gap. Hanya kolom penaut dan status (tanpa judul/rincian, jadi tanpa dekripsi).
     * Semua status review dikembalikan; siapa boleh melihat apa diputuskan modules/tna/gaps.js (R7).
     */
    async findingsForGaps(tenantId, scope) {
      const rep = { tenantId };
      return select(`SELECT f.id, f.user_id AS "userId", f.session_id AS "sessionId", f.category, f.review_status AS "reviewStatus",
                            f.competency_id AS "competencyId", pr.metric_type AS "metricType", pr.name AS "metricName", pr.period AS "metricPeriod"
                       FROM lna_findings f
                       LEFT JOIN lna_performance_records pr ON pr.id = f.performance_record_id AND pr.tenant_id = f.tenant_id
                      WHERE f.tenant_id = :tenantId${scopeSql('f.user_id', scope, rep)}`, rep);
    },
    async performanceByIds(tenantId, ids) {
      if (!ids || !ids.length) return [];
      return select(`SELECT id, user_id AS "userId", metric_type AS "metricType", name, target::float AS target, actual::float AS actual,
                            is_met AS "isMet", period, direction, tolerance::float AS tolerance FROM lna_performance_records WHERE tenant_id = :tenantId AND id IN (:ids)`,
      { tenantId, ids });
    },
    /** PM-1 opsi B: aturan arah + toleransi per KPI (kunci = jenis metrik + nama dinormalkan). */
    async listKpiRules(tenantId) {
      return select(`SELECT id, metric_type AS "metricType", metric_key AS "metricKey", name, direction, tolerance::float AS tolerance,
                            updated_at AS "updatedAt"
                       FROM lna_kpi_rules WHERE tenant_id = :tenantId ORDER BY metric_type, name`, { tenantId });
    },
    async upsertKpiRules(tenantId, rules, userId) {
      const out = [];
      for (const r of rules) {
        out.push(await insert(`INSERT INTO lna_kpi_rules (tenant_id, metric_type, metric_key, name, direction, tolerance, updated_by)
                       VALUES (:tenantId, :metricType, :metricKey, :name, :direction, :tolerance, :userId)
                       ON CONFLICT (tenant_id, metric_type, metric_key) DO UPDATE
                         SET name = EXCLUDED.name, direction = EXCLUDED.direction, tolerance = EXCLUDED.tolerance,
                             updated_by = EXCLUDED.updated_by, updated_at = now()
                       RETURNING id, metric_type AS "metricType", metric_key AS "metricKey", name, direction, tolerance::float AS tolerance`,
        { tenantId, metricType: r.metricType, metricKey: r.metricKey || metricKey(r.name), name: r.name, direction: r.direction, tolerance: r.tolerance ?? 0, userId: userId ?? null }));
      }
      return out;
    },
    /**
     * C-8 / R2-11: hitung ulang status semua baris kinerja (semua periode) untuk KPI yang aturannya berubah.
     * keys: [{ metricType, metricKey }]. Return { changed, toMet, toMissed }.
     * Sesi wawancara yang sudah dijadwalkan tidak dibatalkan otomatis; HR memutuskan dari daftar target.
     */
    async recomputePerformance(tenantId, keys) {
      const rules = await tna.listKpiRules(tenantId);
      const wanted = new Map();
      for (const k of keys) {
        const rule = rules.find((r) => r.metricType === k.metricType && r.metricKey === (k.metricKey || metricKey(k.name)));
        if (rule) wanted.set(`${rule.metricType}|${rule.metricKey}`, rule);
      }
      const result = { changed: 0, toMet: 0, toMissed: 0 };
      if (!wanted.size) return result;
      const types = [...new Set([...wanted.values()].map((r) => r.metricType))];
      const rows = await select(`SELECT id, metric_type AS "metricType", name, target::float AS target, actual::float AS actual,
                                        is_met AS "isMet", direction, tolerance::float AS tolerance, value_type AS "valueType"
                                   FROM lna_performance_records WHERE tenant_id = :tenantId AND metric_type IN (:types)`, { tenantId, types });
      const t = await sequelize.transaction();
      try {
        for (const r of rows) {
          const rule = wanted.get(`${r.metricType}|${metricKey(r.name)}`);
          if (!rule) continue;
          const eff = effectiveRule(r.valueType, rule);
          const { isMet } = evaluate({ target: r.target, actual: r.actual, ...eff });
          if (isMet === r.isMet && eff.direction === r.direction && eff.tolerance === r.tolerance) continue;
          await sequelize.query(`UPDATE lna_performance_records SET is_met = :isMet, direction = :direction, tolerance = :tolerance
                                  WHERE tenant_id = :tenantId AND id = :id`,
          { replacements: { tenantId, id: r.id, isMet, ...eff }, transaction: t });
          result.changed += 1;
          if (isMet !== r.isMet) { if (isMet) result.toMet += 1; else result.toMissed += 1; }
        }
        await t.commit();
      } catch (e) { await t.rollback(); throw e; }
      return result;
    },
    async insertFinding(tenantId, f) {
      return insert(`INSERT INTO lna_findings (tenant_id, project_id, user_id, competency_id, session_id, category, title, detail,
                                                gap_score, performance_record_id, linked_finding_id, review_status)
                     VALUES (:tenantId, :projectId, :userId, :competencyId, :sessionId, :category, :title, :detail,
                             :gapScore, :performanceRecordId, :linkedFindingId, :reviewStatus)
                     RETURNING id, category`,
      withNulls({ tenantId, ...f, reviewStatus: f.reviewStatus || 'draft', title: await enc(tenantId, f.title), detail: await enc(tenantId, f.detail) },
        ['competencyId', 'sessionId', 'detail', 'gapScore', 'performanceRecordId', 'linkedFindingId']))
        .then((row) => ({ ...row, title: f.title }));
    },
    /**
     * Temuan yang boleh dipakai: hanya yang sudah disetujui atau diubah HR (PM-5 ★A). Draf dan yang ditolak
     * tidak ikut ke daftar, Pareto, dashboard, rencana, maupun ekspor data karyawan. Antrean review memakai reviewQueue.
     */
    async listFindings(tenantId, scope, { projectId, categories }) {
      const rep = { tenantId, categories, reviewed: REVIEWED };
      let sql = `SELECT f.id, f.project_id AS "projectId", f.user_id AS "userId", u.name AS "userName", f.category, f.title, f.detail,
                        f.status, f.competency_id AS "competencyId", c.name AS "competencyName", c.importance,
                        f.performance_record_id AS "performanceRecordId", pr.name AS "metricName",
                        pr.target::float AS target, pr.actual::float AS actual, pr.direction, pr.tolerance::float AS tolerance, f.created_at AS "createdAt"
                   FROM lna_findings f
                   LEFT JOIN users u ON u.id = f.user_id
                   LEFT JOIN lna_competencies c ON c.id = f.competency_id
                   LEFT JOIN lna_performance_records pr ON pr.id = f.performance_record_id
                  WHERE f.tenant_id = :tenantId AND f.category IN (:categories) AND f.review_status IN (:reviewed)`;
      sql += scopeSql('f.user_id', scope, rep);
      if (projectId) { sql += ' AND f.project_id = :projectId'; rep.projectId = projectId; }
      return open(tenantId, await select(`${sql} ORDER BY f.created_at DESC`, rep), ['title', 'detail']);
    },
    /** PM-6 B: daftar ringkas temuan non-training untuk HR (tanpa detail dan tanpa rencana aksi). */
    async listNonTrainingSummary(tenantId, { projectId, userIds } = {}) {
      const rep = { tenantId };
      let sql = `SELECT f.id, f.project_id AS "projectId", f.user_id AS "userId", u.name AS "userName", f.title,
                        pr.name AS "metricName", lf.title AS "linkedTrainingTitle", f.created_at AS "createdAt"
                   FROM lna_findings f
                   LEFT JOIN users u ON u.id = f.user_id
                   LEFT JOIN lna_performance_records pr ON pr.id = f.performance_record_id
                   LEFT JOIN lna_findings lf ON lf.id = f.linked_finding_id
                  WHERE f.tenant_id = :tenantId AND f.category = 'non_training' AND f.review_status IN ('approved', 'edited')`;
      if (userIds) sql += scopeSql('f.user_id', { userIds }, rep);
      if (projectId) { sql += ' AND f.project_id = :projectId'; rep.projectId = projectId; }
      return open(tenantId, await select(`${sql} ORDER BY f.created_at DESC`, rep), ['title', 'linkedTrainingTitle']);
    },
    // PM-6: izin atasan melihat temuan non-training timnya, diberikan dan dicabut HR
    async nonTrainingGrants(tenantId) {
      return select(`SELECT g.supervisor_id AS "supervisorId", u.name AS "supervisorName", u.email AS "supervisorEmail",
                            g.granted_at AS "grantedAt", gb.name AS "grantedByName"
                       FROM lna_non_training_grants g
                       JOIN users u ON u.id = g.supervisor_id
                       LEFT JOIN users gb ON gb.id = g.granted_by
                      WHERE g.tenant_id = :tenantId AND g.revoked_at IS NULL ORDER BY u.name NULLS LAST, u.email`, { tenantId });
    },
    async hasNonTrainingGrant(tenantId, supervisorId) {
      return Boolean(await one(`SELECT 1 AS ok FROM lna_non_training_grants
                                 WHERE tenant_id = :tenantId AND supervisor_id = :supervisorId AND revoked_at IS NULL`, { tenantId, supervisorId }));
    },
    /** Return true bila izin baru dibuat, false bila sudah aktif sebelumnya. */
    async grantNonTraining(tenantId, supervisorId, grantedBy) {
      const row = await insert(`INSERT INTO lna_non_training_grants (tenant_id, supervisor_id, granted_by)
                                VALUES (:tenantId, :supervisorId, :grantedBy)
                                ON CONFLICT (tenant_id, supervisor_id) WHERE revoked_at IS NULL DO NOTHING RETURNING id`,
      { tenantId, supervisorId, grantedBy });
      return Boolean(row);
    },
    /** Return true bila ada izin aktif yang dicabut. */
    async revokeNonTraining(tenantId, supervisorId, revokedBy) {
      const row = await insert(`UPDATE lna_non_training_grants SET revoked_at = now(), revoked_by = :revokedBy
                                 WHERE tenant_id = :tenantId AND supervisor_id = :supervisorId AND revoked_at IS NULL RETURNING id`,
      { tenantId, supervisorId, revokedBy });
      return Boolean(row);
    },
    async getFinding(tenantId, id) {
      return open(tenantId, await one(`SELECT f.id, f.user_id AS "userId", f.category, f.title, f.competency_id AS "competencyId", f.status,
                           f.review_status AS "reviewStatus"
                    FROM lna_findings f WHERE f.tenant_id = :tenantId AND f.id = :id`, { tenantId, id }), ['title']);
    },
    /** Antrean review HR (PM-3 ★A): semua kategori, termasuk non-training, dengan keyakinan dan jejak review. */
    async reviewQueue(tenantId, { projectId, statuses = ['draft'] } = {}) {
      const rep = { tenantId, statuses };
      let sql = `SELECT ${REVIEW_COLS}
                   FROM lna_findings f
                   LEFT JOIN users u ON u.id = f.user_id
                   LEFT JOIN users r ON r.id = f.reviewed_by
                   LEFT JOIN lna_competencies c ON c.id = f.competency_id
                   LEFT JOIN lna_performance_records pr ON pr.id = f.performance_record_id
                   ${REVIEW_JOIN_SESSION}
                  WHERE f.tenant_id = :tenantId AND f.review_status IN (:statuses)`;
      if (projectId) { sql += ' AND f.project_id = :projectId'; rep.projectId = projectId; }
      return (await open(tenantId, await select(`${sql} ORDER BY f.created_at, f.finding_seq`, rep), REVIEW_ENC)).map(withSummaryState);
    },
    async reviewCounts(tenantId, { projectId } = {}) {
      const rep = { tenantId };
      let sql = 'SELECT review_status AS "reviewStatus", count(*)::int AS n FROM lna_findings WHERE tenant_id = :tenantId';
      if (projectId) { sql += ' AND project_id = :projectId'; rep.projectId = projectId; }
      return byReviewStatus(await select(`${sql} GROUP BY review_status`, rep));
    },
    /**
     * B3: jumlah temuan hasil job analisis AI per status review. Yang sudah diputus hanya dihitung bila diputus
     * orang (reviewed_by terisi), supaya temuan lama yang ditandai massal oleh migrasi 20261117000400 tidak ikut.
     */
    async aiReviewCounts(tenantId) {
      const rows = await select(`SELECT review_status AS "reviewStatus", count(*)::int AS n FROM lna_findings
                                  WHERE tenant_id = :tenantId AND analysis_job_id IS NOT NULL
                                    AND (review_status = 'draft' OR reviewed_by IS NOT NULL)
                                  GROUP BY review_status`, { tenantId });
      return byReviewStatus(rows);
    },
    /**
     * B3: lama analisis per sesi TNA dalam hari (pecahan): dari wawancara selesai sampai temuan AI terakhirnya
     * diputus HR. Hanya sesi yang seluruh temuan AI-nya sudah diputus orang. Sesi yang dihapus (session_id NULL
     * pada temuan) tidak ikut.
     */
    async analysisDurations(tenantId, scope) {
      const rep = { tenantId };
      const sql = `SELECT s.id AS "sessionId", s.interviewee_id AS "userId",
                          (EXTRACT(EPOCH FROM (max(f.reviewed_at) - s.ended_at)) / 86400.0)::float AS days
                     FROM lna_interview_sessions s
                     JOIN lna_findings f ON f.session_id = s.id AND f.tenant_id = s.tenant_id
                    WHERE s.tenant_id = :tenantId AND s.submodule = 'tna' AND s.ended_at IS NOT NULL
                      AND f.analysis_job_id IS NOT NULL${scopeSql('s.interviewee_id', scope, rep)}
                    GROUP BY s.id, s.interviewee_id, s.ended_at
                   HAVING bool_and(f.review_status <> 'draft' AND f.reviewed_by IS NOT NULL)`;
      return select(sql, rep);
    },
    /**
     * Putusan review satu temuan (PD-14 ★A). Hanya temuan draf; dua pe-review bersamaan tidak saling timpa
     * (yang kedua mendapat null). 'edited' menyimpan versi asli AI untuk pemantauan akurasi (PM-2).
     */
    async reviewFinding(tenantId, id, { decision, title, detail, category, note, reviewerId }) {
      const rep = { tenantId, id, decision, reviewerId, note: note ? await enc(tenantId, note) : null };
      let sets = '';
      if (decision === 'edited') {
        sets = `, original_title = title, original_detail = detail, original_category = category,
                  title = COALESCE(:title, title), detail = COALESCE(:detail, detail), category = COALESCE(:category, category)`;
        rep.title = title != null ? await enc(tenantId, title) : null;
        rep.detail = detail != null ? await enc(tenantId, detail) : null;
        rep.category = category || null;
      }
      const row = await insert(`UPDATE lna_findings SET review_status = :decision, reviewed_by = :reviewerId, reviewed_at = now(),
                                       review_note = :note${sets}
                                 WHERE tenant_id = :tenantId AND id = :id AND review_status = 'draft'
                                 RETURNING id`, rep);
      return row ? tna.getReviewItem(tenantId, id) : null;
    },
    async getReviewItem(tenantId, id) {
      const row = await one(`SELECT ${REVIEW_COLS}
                   FROM lna_findings f
                   LEFT JOIN users u ON u.id = f.user_id
                   LEFT JOIN users r ON r.id = f.reviewed_by
                   LEFT JOIN lna_competencies c ON c.id = f.competency_id
                   LEFT JOIN lna_performance_records pr ON pr.id = f.performance_record_id
                   ${REVIEW_JOIN_SESSION}
                  WHERE f.tenant_id = :tenantId AND f.id = :id`, { tenantId, id });
      return row ? withSummaryState(await open(tenantId, row, REVIEW_ENC)) : null;
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
                               catalog_item_ref AS "catalogItemRef", catalog_item_title AS "catalogItemTitle", note,
                               (catalog_item_ref IS NULL AND origin <> 'learner_request') AS "needsModule"`,
      withNulls({ tenantId, ...p, note: await enc(tenantId, p.note) }, ['findingId', 'programTier', 'catalogSource', 'catalogItemRef', 'catalogItemTitle', 'note', 'requestedBy']))
        .then((row) => open(tenantId, row, ['note']));
    },
    async listPlanItems(tenantId, scope) {
      const rep = { tenantId };
      const sql = `SELECT ${PLAN_COLS}, f.title AS "findingTitle", ci.url AS "catalogItemUrl", cc.status AS "courseStatus"
                     FROM lna_training_plan_items p
                     JOIN users u ON u.id = p.user_id LEFT JOIN lna_findings f ON f.id = p.finding_id
                     LEFT JOIN lna_catalog_items ci ON ci.tenant_id = p.tenant_id AND ci.source = p.catalog_source AND ci.external_ref = p.catalog_item_ref
                     LEFT JOIN lna_catalog_completions cc ON cc.tenant_id = p.tenant_id AND cc.catalog_item_id = ci.id AND cc.user_id = p.user_id
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

  // PK-18: katalog course statis (impor daftar course Moodle), pemetaan ke kompetensi, dan status lulus per course.
  const ITEM_COLS = `ci.id, ci.source, ci.external_ref AS ref, ci.title, ci.url, ci.category, ci.program_tier AS "programTier", ci.active`;
  const catalog = {
    async listItems(tenantId, { source } = {}) {
      const rep = { tenantId };
      let sql = `SELECT ${ITEM_COLS},
                        COALESCE((SELECT json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
                                    FROM lna_catalog_item_competencies m JOIN lna_competencies c ON c.id = m.competency_id
                                   WHERE m.catalog_item_id = ci.id), '[]'::json) AS competencies
                   FROM lna_catalog_items ci WHERE ci.tenant_id = :tenantId`;
      if (source) { sql += ' AND ci.source = :source'; rep.source = source; }
      return select(`${sql} ORDER BY ci.title`, rep);
    },
    async itemsByRef(tenantId, refs, source = 'moodle') {
      if (!refs.length) return [];
      return select(`SELECT ${ITEM_COLS} FROM lna_catalog_items ci WHERE ci.tenant_id = :tenantId AND ci.source = :source AND ci.external_ref IN (:refs)`,
        { tenantId, source, refs });
    },
    /** Course aktif yang dipetakan ke kompetensi; course dengan program yang sama diutamakan. */
    async findForCompetency(tenantId, { source, competencyId, tier }) {
      if (!competencyId) return [];
      return select(`SELECT ci.external_ref AS ref, ci.title, ci.url, ci.program_tier AS "programTier"
                       FROM lna_catalog_items ci JOIN lna_catalog_item_competencies m ON m.catalog_item_id = ci.id
                      WHERE ci.tenant_id = :tenantId AND ci.source = :source AND ci.active AND m.competency_id = :competencyId
                      ORDER BY (ci.program_tier IS NOT DISTINCT FROM :tier) DESC, ci.title`,
      { tenantId, source, competencyId, tier: tier ?? null });
    },
    /** Upsert course berdasarkan kode; pemetaan kompetensi course yang diimpor diganti dengan isi file. */
    async upsertItems(tenantId, items, { source = 'moodle', batchId = null } = {}) {
      const t = await sequelize.transaction();
      try {
        let created = 0; let updated = 0;
        for (const it of items) {
          const [[row]] = await sequelize.query(
            `INSERT INTO lna_catalog_items (tenant_id, source, external_ref, title, url, category, program_tier, active, import_batch_id)
             VALUES (:tenantId, :source, :ref, :title, :url, :category, :programTier, :active, :batchId)
             ON CONFLICT (tenant_id, source, external_ref) DO UPDATE
               SET title = EXCLUDED.title, url = EXCLUDED.url, category = EXCLUDED.category, program_tier = EXCLUDED.program_tier,
                   active = EXCLUDED.active, import_batch_id = EXCLUDED.import_batch_id, updated_at = now()
             RETURNING id, (xmax = 0) AS inserted`,
            { replacements: withNulls({ tenantId, source, batchId, ...it }, ['url', 'category', 'programTier', 'batchId']), transaction: t },
          );
          if (row.inserted) created += 1; else updated += 1;
          await sequelize.query('DELETE FROM lna_catalog_item_competencies WHERE tenant_id = :tenantId AND catalog_item_id = :id',
            { replacements: { tenantId, id: row.id }, transaction: t });
          for (const competencyId of it.competencyIds || []) {
            await sequelize.query(
              `INSERT INTO lna_catalog_item_competencies (tenant_id, catalog_item_id, competency_id)
               SELECT :tenantId, :id, c.id FROM lna_competencies c WHERE c.tenant_id = :tenantId AND c.id = :competencyId
               ON CONFLICT DO NOTHING`,
              { replacements: { tenantId, id: row.id, competencyId }, transaction: t },
            );
          }
        }
        await t.commit();
        return { created, updated };
      } catch (e) { await t.rollback(); throw e; }
    },
    /**
     * Rencana training yang masih perlu modul (status 'new' tanpa course, K-3) dan kompetensi temuannya kini
     * punya course aktif: isi course-nya; status tetap 'new'. Return jumlah rencana yang terisi.
     */
    async rematchNeedsModule(tenantId, sources) {
      if (!sources.length) return 0;
      const [, meta] = await sequelize.query(
        `UPDATE lna_training_plan_items p
            SET catalog_source = m.source, catalog_item_ref = m.ref, catalog_item_title = m.title, updated_at = now()
           FROM (SELECT DISTINCT ON (p2.id) p2.id AS plan_id, ci.source, ci.external_ref AS ref, ci.title
                   FROM lna_training_plan_items p2
                   JOIN lna_findings f ON f.id = p2.finding_id AND f.tenant_id = p2.tenant_id
                   JOIN lna_catalog_item_competencies m2 ON m2.competency_id = f.competency_id AND m2.tenant_id = p2.tenant_id
                   JOIN lna_catalog_items ci ON ci.id = m2.catalog_item_id AND ci.active AND ci.source IN (:sources)
                  WHERE p2.tenant_id = :tenantId AND p2.status = 'new' AND p2.catalog_item_ref IS NULL AND p2.origin <> 'learner_request'
                  ORDER BY p2.id, array_position(ARRAY[:sources]::varchar[], ci.source),
                           (ci.program_tier IS NOT DISTINCT FROM p2.program_tier) DESC, ci.title) m
          WHERE p.tenant_id = :tenantId AND p.id = m.plan_id`,
        { replacements: { tenantId, sources } },
      );
      return (meta && meta.rowCount) || 0;
    },
    async upsertCompletions(tenantId, rows, { batchId = null, recordedBy = null } = {}) {
      const t = await sequelize.transaction();
      try {
        for (const c of rows) {
          await sequelize.query(
            `INSERT INTO lna_catalog_completions (tenant_id, user_id, catalog_item_id, status, completed_at, score, source, recorded_by, import_batch_id)
             VALUES (:tenantId, :userId, :catalogItemId, :status, :completedAt, :score, 'manual', :recordedBy, :batchId)
             ON CONFLICT (tenant_id, user_id, catalog_item_id) DO UPDATE
               SET status = EXCLUDED.status, completed_at = EXCLUDED.completed_at, score = EXCLUDED.score,
                   recorded_by = EXCLUDED.recorded_by, import_batch_id = EXCLUDED.import_batch_id, updated_at = now()`,
            { replacements: withNulls({ tenantId, batchId, recordedBy, ...c }, ['completedAt', 'score', 'batchId', 'recordedBy']), transaction: t },
          );
        }
        await t.commit();
      } catch (e) { await t.rollback(); throw e; }
    },
    /** Rencana training aktif yang menunjuk course yang sudah lulus -> 'completed'. Return jumlahnya. */
    async completePlansForPassed(tenantId, passed, source = 'moodle') {
      let n = 0;
      for (const { userId, ref } of passed) {
        const [, meta] = await sequelize.query(
          `UPDATE lna_training_plan_items SET status = 'completed', updated_at = now()
            WHERE tenant_id = :tenantId AND user_id = :userId AND catalog_source = :source AND catalog_item_ref = :ref
              AND status IN ('new','in_progress')`,
          { replacements: { tenantId, userId, source, ref } },
        );
        n += (meta && meta.rowCount) || 0;
      }
      return n;
    },
  };

  const projectsExtra = {
    async exists(tenantId, id) {
      return Boolean(await one('SELECT id FROM lna_projects WHERE tenant_id = :tenantId AND id = :id', { tenantId, id }));
    },
    /** Status proyek ('draft' | 'active' | 'closed') atau null bila bukan milik tenant. */
    async status(tenantId, id) {
      const row = await one('SELECT status FROM lna_projects WHERE tenant_id = :tenantId AND id = :id', { tenantId, id });
      return row ? row.status : null;
    },
  };

  const BATCH_COLS = `b.id, b.submodule, b.kind, b.filename, b.status, b.row_count AS "rowCount", b.headers, b.mapping, b.options,
    b.result, b.created_at AS "createdAt", b.committed_at AS "committedAt", b.created_by AS "createdBy", u.name AS "createdByName"`;
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
    /** kinds (opsional): batasi jenis di SQL agar batas 100 tidak memotong jenis yang diminta (B11 CD-10). */
    async list(tenantId, submodule, kinds = null) {
      const byKind = kinds ? ' AND b.kind IN (:kinds)' : '';
      if (kinds && !kinds.length) return [];
      return select(`SELECT ${BATCH_COLS} FROM import_batches b LEFT JOIN users u ON u.id = b.created_by
                      WHERE b.tenant_id = :tenantId AND b.submodule = :submodule${byKind} ORDER BY b.created_at DESC LIMIT 100`, { tenantId, submodule, kinds });
    },
    /** B11: impor yang sudah disimpan untuk jenis tertentu, terbaru dulu (ringkasan Admin Tenant; tanpa baris mentah). */
    async listCommitted(tenantId, kinds) {
      if (!kinds || !kinds.length) return [];
      return select(`SELECT ${BATCH_COLS} FROM import_batches b LEFT JOIN users u ON u.id = b.created_by
                      WHERE b.tenant_id = :tenantId AND b.status = 'committed' AND b.kind IN (:kinds)
                      ORDER BY b.committed_at DESC NULLS LAST, b.created_at DESC LIMIT 1000`, { tenantId, kinds });
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

  // PK-14 / PD-13 ★A: job analisis per sesi. Klaim bersyarat + lease; simpan hasil dan tandai selesai dalam satu transaksi.
  const JOB_COLS = `id, tenant_id AS "tenantId", session_id AS "sessionId", submodule, status, attempts, last_error AS "lastError",
    result, created_at AS "createdAt", started_at AS "startedAt", finished_at AS "finishedAt"`;
  const analysis = {
    async enqueue(tenantId, { sessionId, submodule }) {
      // ON CONFLICT: permintaan ulang untuk sesi yang sama mengembalikan job yang sudah ada
      return insert(`INSERT INTO lna_analysis_jobs (tenant_id, session_id, submodule) VALUES (:tenantId, :sessionId, :submodule)
                     ON CONFLICT (session_id) DO UPDATE SET session_id = EXCLUDED.session_id
                     RETURNING ${JOB_COLS}`, { tenantId, sessionId, submodule });
    },
    async forSession(tenantId, sessionId) {
      return one(`SELECT ${JOB_COLS} FROM lna_analysis_jobs WHERE tenant_id = :tenantId AND session_id = :sessionId`, { tenantId, sessionId });
    },
    async claim(tenantId, id, { maxAttempts, leaseSeconds }) {
      return insert(`UPDATE lna_analysis_jobs
                        SET status = 'running', attempts = attempts + 1, started_at = now(), last_error = NULL,
                            locked_until = now() + make_interval(secs => :leaseSeconds)
                      WHERE tenant_id = :tenantId AND id = :id
                        AND (status = 'queued'
                             OR (status IN ('running', 'failed') AND locked_until IS NOT NULL AND locked_until < now() AND attempts < :maxAttempts))
                      RETURNING ${JOB_COLS}`, { tenantId, id, maxAttempts, leaseSeconds });
    },
    /** Job lintas tenant yang siap dijalankan (dipakai penyapu di server dan skrip, bukan dari request). */
    async pending({ maxAttempts, limit }) {
      return select(`SELECT id, tenant_id AS "tenantId" FROM lna_analysis_jobs
                      WHERE status = 'queued'
                         OR (status IN ('running', 'failed') AND locked_until IS NOT NULL AND locked_until < now() AND attempts < :maxAttempts)
                      ORDER BY created_at LIMIT :limit`, { maxAttempts, limit });
    },
    async fail(tenantId, job, { code, retryInSeconds, final }) {
      await sequelize.query(`UPDATE lna_analysis_jobs SET status = 'failed', last_error = :code, finished_at = now(),
                                    locked_until = CASE WHEN :final THEN NULL ELSE now() + make_interval(secs => :retry) END
                              WHERE tenant_id = :tenantId AND id = :id AND status = 'running' AND attempts = :attempts`,
      { replacements: { tenantId, id: job.id, attempts: job.attempts, code, retry: retryInSeconds, final: Boolean(final) } });
    },
    async requeue(tenantId, sessionId) {
      return insert(`UPDATE lna_analysis_jobs SET status = 'queued', attempts = 0, locked_until = NULL, last_error = NULL
                      WHERE tenant_id = :tenantId AND session_id = :sessionId AND status = 'failed'
                      RETURNING ${JOB_COLS}`, { tenantId, sessionId });
    },
    /** Kunci baris job; lanjut hanya bila job masih milik percobaan ini (pekerja lain tidak mengambil alih). */
    async lockOwned(job, transaction) {
      const [row] = await sequelize.query(`SELECT status, attempts FROM lna_analysis_jobs WHERE tenant_id = :tenantId AND id = :id FOR UPDATE`,
        { replacements: { tenantId: job.tenantId, id: job.id }, type: QueryTypes.SELECT, transaction });
      return Boolean(row && row.status === 'running' && row.attempts === job.attempts);
    },
    async finish(job, result, transaction) {
      await sequelize.query(`UPDATE lna_analysis_jobs SET status = 'done', finished_at = now(), locked_until = NULL, result = CAST(:result AS jsonb)
                              WHERE tenant_id = :tenantId AND id = :id`,
      { replacements: { tenantId: job.tenantId, id: job.id, result: JSON.stringify(result) }, transaction });
    },
    /** Simpan temuan TNA sebagai draf (PD-14 ★A) dan tandai job selesai, semuanya atau tidak sama sekali. */
    async saveTna(tenantId, job, session, findings, { onlySecond = 0 } = {}) {
      const rows = [];
      for (const f of findings) {
        rows.push({ ...f, titleEnc: await enc(tenantId, f.title), detailEnc: await enc(tenantId, f.detail) });
      }
      return sequelize.transaction(async (transaction) => {
        if (!(await analysis.lockOwned(job, transaction))) return { skipped: true };
        let lastTraining = null; let seq = 0;
        for (const f of rows) {
          seq += 1;
          const [[row]] = await sequelize.query(
            `INSERT INTO lna_findings (tenant_id, project_id, user_id, competency_id, session_id, category, title, detail,
                                       performance_record_id, linked_finding_id, confidence, scoring_agreement, review_status,
                                       analysis_job_id, finding_seq)
             VALUES (:tenantId, :projectId, :userId, :competencyId, :sessionId, :category, :title, :detail,
                     :performanceRecordId, :linkedFindingId, :confidence, :agreement, 'draft', :jobId, :seq)
             RETURNING id`,
            { replacements: {
              tenantId, projectId: session.projectId, userId: session.intervieweeId, sessionId: session.id, category: f.category,
              title: f.titleEnc, detail: f.detailEnc ?? null, competencyId: f.competencyId || null, performanceRecordId: f.performanceRecordId || null,
              linkedFindingId: f.category === 'non_training' && lastTraining ? lastTraining : null,
              confidence: f.confidence ?? null, agreement: f.agreement ?? null, jobId: job.id, seq,
            }, transaction },
          );
          if (f.category === 'training') lastTraining = row.id;
        }
        const result = { findings: rows.length, agreed: rows.filter((f) => f.agreement).length, onlySecond };
        await analysis.finish(job, result, transaction);
        return result;
      });
    },
    /** DNA: skor AI disimpan dengan keyakinan dari dua kali penilaian (wawancara AI DNA di balik flag, mati di POC). */
    async saveDna(tenantId, job, session, results, { onlySecond = 0 } = {}) {
      const rows = [];
      for (const r of results) rows.push({ ...r, evidenceEnc: await enc(tenantId, r.evidence) });
      return sequelize.transaction(async (transaction) => {
        if (!(await analysis.lockOwned(job, transaction))) return { skipped: true };
        for (const r of rows) {
          await sequelize.query(
            `INSERT INTO lna_assessments (tenant_id, user_id, competency_id, session_id, score, confidence, evidence, source)
             VALUES (:tenantId, :userId, :competencyId, :sessionId, :score, :confidence, :evidence, 'ai_interview')`,
            { replacements: { tenantId, userId: session.intervieweeId, competencyId: r.competencyId, sessionId: session.id,
              score: r.score, confidence: r.confidence ?? null, evidence: r.evidenceEnc ?? null }, transaction },
          );
        }
        const result = { assessments: rows.length, agreed: rows.filter((r) => r.agreement).length, onlySecond };
        await analysis.finish(job, result, transaction);
        return result;
      });
    },
  };

  // R3-6: pemakaian AI per panggilan model (tanpa isi prompt/jawaban, jadi tidak dienkripsi).
  const aiUsage = {
    async record(tenantId, r) {
      await sequelize.query(`INSERT INTO ai_usage_logs (tenant_id, project_id, session_id, user_id, submodule, operation, provider, model,
                                                        input_tokens, output_tokens, latency_ms, cost_usd)
                             VALUES (:tenantId, :projectId, :sessionId, :userId, :submodule, :operation, :provider, :model,
                                     :inputTokens, :outputTokens, :latencyMs, :costUsd)`,
      { replacements: withNulls({ tenantId, ...r }, ['projectId', 'sessionId', 'userId', 'submodule', 'latencyMs', 'costUsd']) });
    },
    async sessionTotals(tenantId, sessionId) {
      return one(`SELECT count(*)::int AS calls, COALESCE(sum(input_tokens), 0)::int AS "inputTokens",
                         COALESCE(sum(output_tokens), 0)::int AS "outputTokens", sum(cost_usd)::float AS "costUsd"
                    FROM ai_usage_logs WHERE tenant_id = :tenantId AND session_id = :sessionId`, { tenantId, sessionId });
    },
    async listForSession(tenantId, sessionId) {
      return select(`SELECT operation, provider, model, input_tokens AS "inputTokens", output_tokens AS "outputTokens",
                            latency_ms AS "latencyMs", cost_usd::float AS "costUsd", created_at AS "createdAt"
                       FROM ai_usage_logs WHERE tenant_id = :tenantId AND session_id = :sessionId ORDER BY id`, { tenantId, sessionId });
    },
  };

  /** Nilai sel baris impor yang menunjuk karyawan ini (ID karyawan atau email, tanpa beda huruf besar/kecil). */
  const rowMentions = (row, needles) => Object.entries(row || {}).some(([k, v]) => k !== '__row' && v != null
    && needles.has(String(v).trim().toLowerCase()));

  /**
   * PK-15 butir 2: hapus baris milik karyawan dari batch impor yang belum disimpan; batch tersimpan tidak
   * menyimpan baris lagi (dikosongkan saat commit, sisa lama dikosongkan di sini). Return jumlah baris yang dibuang.
   */
  imports.scrubEmployee = async (tenantId, { employeeId, email }, { transaction } = {}) => {
    const needles = new Set([employeeId, email].filter(Boolean).map((v) => String(v).trim().toLowerCase()));
    await sequelize.query(`UPDATE import_batches SET rows = '[]'::jsonb WHERE tenant_id = :tenantId AND status = 'committed' AND rows <> '[]'::jsonb`,
      { replacements: { tenantId }, transaction });
    if (!needles.size) return 0;
    const batches = await sequelize.query(`SELECT id, rows FROM import_batches WHERE tenant_id = :tenantId AND status = 'uploaded' FOR UPDATE`,
      { replacements: { tenantId }, type: QueryTypes.SELECT, transaction });
    let removed = 0;
    for (const b of batches) {
      const rows = (await cipher.decryptJson(tenantId, b.rows)) || [];
      const kept = rows.filter((r) => !rowMentions(r, needles));
      if (kept.length === rows.length) continue;
      removed += rows.length - kept.length;
      await sequelize.query(`UPDATE import_batches SET rows = CAST(:rows AS jsonb), row_count = :n WHERE tenant_id = :tenantId AND id = :id`,
        { replacements: { tenantId, id: b.id, n: kept.length, rows: JSON.stringify(await cipher.encryptJson(tenantId, kept)) }, transaction });
    }
    return removed;
  };

  /**
   * PK-15 butir 2: job pembersihan riwayat impor (semua tenant). Batch 'uploaded' yang tidak di-commit lebih dari
   * `olderThanDays` hari dihapus; batch 'committed' yang masih menyimpan baris dikosongkan (row_count dan result tetap).
   */
  imports.cleanup = async ({ olderThanDays = 7, now = new Date() } = {}) => {
    const cutoff = new Date(now.getTime() - olderThanDays * 24 * 3600 * 1000);
    const [, delMeta] = await sequelize.query(`DELETE FROM import_batches WHERE status = 'uploaded' AND created_at < :cutoff`, { replacements: { cutoff } });
    const [, clrMeta] = await sequelize.query(`UPDATE import_batches SET rows = '[]'::jsonb WHERE status = 'committed' AND rows <> '[]'::jsonb`);
    return { deletedUploaded: (delMeta && delMeta.rowCount) || 0, clearedCommitted: (clrMeta && clrMeta.rowCount) || 0 };
  };

  return { people, settings, dna, interviews, tna, catalog, projectsExtra, imports, aiUsage, analysis, ...createLiStores(sequelize), ...createLdStores(sequelize)  };
}

module.exports = { createLnaStores, scopeSql };
