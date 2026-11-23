'use strict';
// Store Postgres untuk Core Competencies (modul cca). Setiap query memfilter tenant_id.
// Skor angka disimpan terbuka agar bisa diagregasi; ringkasan wawancara dienkripsi per tenant (R2-3).
const { QueryTypes } = require('sequelize');

const SOURCE_COLS = `s.id, s.kind, s.title, s.text, s.source_ref AS "sourceRef", s.position, s.status`;
const REQ_COLS = `r.id, r.source_id AS "sourceId", r.name, r.definition, r.target_score::float8 AS "targetScore",
  r.actual_score::float8 AS "actualScore", r.actual_source AS "actualSource", r.actual_updated_at AS "actualUpdatedAt",
  r.origin, r.status, r.validated_by AS "validatedBy", r.validated_at AS "validatedAt"`;
const PROGRAM_COLS = `p.id, p.key, p.name, p.provider, to_char(p.cutoff_date, 'YYYY-MM-DD') AS "cutoffDate", p.config, p.insight,
  p.recommendations, p.manual_report AS "manualReport", p.updated_at AS "updatedAt"`;
const ASSIGNMENT_COLS = `a.id, a.assignee_id AS "assigneeId", a.assigned_by AS "assignedBy", a.tier, a.parent_id AS "parentId",
  to_char(a.due_date, 'YYYY-MM-DD') AS "dueDate", a.duration_minutes AS "durationMinutes", a.status, a.session_id AS "sessionId",
  a.completed_at AS "completedAt", a.created_at AS "createdAt", a.consent_version AS "consentVersion", a.started_at AS "startedAt",
  a.summary_at AS "summaryAt", a.restart_count AS "restartCount", a.context_requirement_ids AS "contextRequirementIds"`;
const TURN_COLS = 't.position, t.role, t.theme, t.text, t.options';

/** Ringkasan tersimpan: JSON { themes, stances } (tahap 2) atau teks bebas (sambungan tahap 1, dibaca sebagai satu tema). */
function parseSummary(text) {
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    if (j && Array.isArray(j.themes)) return { themes: j.themes, stances: Array.isArray(j.stances) ? j.stances : [] };
  } catch { /* teks bebas */ }
  return { themes: [{ theme: null, question: null, answer: text }], stances: [] };
}

function createCcaStores(sequelize, { cipher } = {}) {
  if (!cipher) throw new Error('createCcaStores butuh cipher (R2-3)');
  const select = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  const one = async (sql, replacements) => (await select(sql, replacements))[0] || null;
  const returning = async (sql, replacements) => {
    const [rows] = await sequelize.query(sql, { replacements });
    return rows[0] || null;
  };
  /** SET dinamis dari daftar kolom yang diizinkan; nilai undefined dilewati. */
  const sets = (patch, allowed, rep) => Object.keys(allowed).filter((k) => patch[k] !== undefined).map((k) => {
    rep[k] = patch[k];
    return `${allowed[k]} = :${k}`;
  });

  const cca = {
    // --- Sumber strategis dan persyaratan ---
    async listSources(tenantId, { includeArchived = false } = {}) {
      const sources = await select(
        `SELECT ${SOURCE_COLS} FROM cca_sources s WHERE s.tenant_id = :tenantId ${includeArchived ? '' : "AND s.status = 'active'"}
          ORDER BY CASE s.kind WHEN 'vision' THEN 0 WHEN 'mission' THEN 1 ELSE 2 END, s.position, s.created_at`, { tenantId });
      const reqs = await select(
        `SELECT ${REQ_COLS} FROM cca_requirements r WHERE r.tenant_id = :tenantId ORDER BY r.created_at, r.name`, { tenantId });
      return sources.map((s) => ({ ...s, requirements: reqs.filter((r) => r.sourceId === s.id) }));
    },
    async getSource(tenantId, id) {
      return one(`SELECT ${SOURCE_COLS} FROM cca_sources s WHERE s.tenant_id = :tenantId AND s.id = :id`, { tenantId, id });
    },
    async createSource(tenantId, s) {
      return returning(
        `INSERT INTO cca_sources AS s (tenant_id, kind, title, text, source_ref, position, created_by)
         VALUES (:tenantId, :kind, :title, :text, :sourceRef, :position, :createdBy) RETURNING ${SOURCE_COLS}`,
        { tenantId, kind: s.kind, title: s.title, text: s.text ?? null, sourceRef: s.sourceRef ?? null, position: s.position ?? 0, createdBy: s.createdBy ?? null });
    },
    async updateSource(tenantId, id, patch) {
      const rep = { tenantId, id };
      const set = sets(patch, { title: 'title', text: 'text', sourceRef: 'source_ref', position: 'position', status: 'status' }, rep);
      if (!set.length) return cca.getSource(tenantId, id);
      return returning(`UPDATE cca_sources AS s SET ${set.join(', ')}, updated_at = now() WHERE s.tenant_id = :tenantId AND s.id = :id RETURNING ${SOURCE_COLS}`, rep);
    },
    async getRequirement(tenantId, id) {
      return one(`SELECT ${REQ_COLS} FROM cca_requirements r WHERE r.tenant_id = :tenantId AND r.id = :id`, { tenantId, id });
    },
    async createRequirement(tenantId, r) {
      const hasActual = r.actualScore !== null && r.actualScore !== undefined;
      return returning(
        `INSERT INTO cca_requirements AS r (tenant_id, source_id, name, definition, target_score, actual_score, actual_source, actual_updated_at, origin)
         SELECT :tenantId, s.id, :name, :definition, :targetScore, :actualScore, :actualSource, :actualAt, :origin
           FROM cca_sources s WHERE s.tenant_id = :tenantId AND s.id = :sourceId
         RETURNING ${REQ_COLS}`,
        {
          tenantId, sourceId: r.sourceId, name: r.name, definition: r.definition ?? null, targetScore: r.targetScore,
          actualScore: hasActual ? r.actualScore : null, actualSource: hasActual ? (r.actualSource || 'manual') : null,
          actualAt: hasActual ? new Date() : null, origin: r.origin || 'hr',
        });
    },
    /** patch: name, definition, targetScore, actualScore (+ actualSource), status (+ validatedBy). */
    async updateRequirement(tenantId, id, patch) {
      const rep = { tenantId, id };
      const set = sets(patch, { name: 'name', definition: 'definition', targetScore: 'target_score', status: 'status' }, rep);
      if (patch.actualScore !== undefined) {
        rep.actualScore = patch.actualScore;
        rep.actualSource = patch.actualScore === null ? null : (patch.actualSource || 'manual');
        set.push('actual_score = :actualScore', 'actual_source = :actualSource', 'actual_updated_at = now()');
      }
      if (patch.status !== undefined) {
        rep.validatedBy = patch.status === 'validated' ? (patch.validatedBy ?? null) : null;
        set.push('validated_by = :validatedBy', `validated_at = ${patch.status === 'validated' ? 'now()' : 'NULL'}`);
      }
      if (!set.length) return cca.getRequirement(tenantId, id);
      return returning(`UPDATE cca_requirements AS r SET ${set.join(', ')}, updated_at = now() WHERE r.tenant_id = :tenantId AND r.id = :id RETURNING ${REQ_COLS}`, rep);
    },

    // --- Program nilai korporasi ---
    async listPrograms(tenantId) {
      return select(`SELECT ${PROGRAM_COLS}, (SELECT count(*)::int FROM cca_program_results x WHERE x.tenant_id = p.tenant_id AND x.program_id = p.id) AS participants
                       FROM cca_programs p WHERE p.tenant_id = :tenantId ORDER BY p.name`, { tenantId });
    },
    async getProgram(tenantId, key) {
      return one(`SELECT ${PROGRAM_COLS} FROM cca_programs p WHERE p.tenant_id = :tenantId AND p.key = :key`, { tenantId, key });
    },
    async upsertProgram(tenantId, p) {
      return returning(
        `INSERT INTO cca_programs AS p (tenant_id, key, name, provider, cutoff_date, config, insight, recommendations, updated_by)
         VALUES (:tenantId, :key, :name, :provider, :cutoffDate, CAST(:config AS jsonb), :insight, CAST(:recommendations AS jsonb), :updatedBy)
         ON CONFLICT (tenant_id, key) DO UPDATE SET name = EXCLUDED.name, provider = EXCLUDED.provider, cutoff_date = EXCLUDED.cutoff_date,
           config = EXCLUDED.config, insight = EXCLUDED.insight, recommendations = EXCLUDED.recommendations,
           updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING ${PROGRAM_COLS}`,
        {
          tenantId, key: p.key, name: p.name, provider: p.provider ?? null, cutoffDate: p.cutoffDate ?? null, config: JSON.stringify(p.config),
          insight: p.insight ?? null, recommendations: JSON.stringify(p.recommendations || []), updatedBy: p.updatedBy ?? null,
        });
    },
    async setProgramManualReport(tenantId, key, report, userId) {
      return returning(
        `UPDATE cca_programs AS p SET manual_report = CAST(:report AS jsonb), updated_by = :userId, updated_at = now()
          WHERE p.tenant_id = :tenantId AND p.key = :key RETURNING ${PROGRAM_COLS}`,
        { tenantId, key, report: report === null ? null : JSON.stringify(report), userId: userId ?? null });
    },
    async countProgramResults(tenantId, programId) {
      const row = await one('SELECT count(*)::int AS n FROM cca_program_results WHERE tenant_id = :tenantId AND program_id = :programId', { tenantId, programId });
      return row.n;
    },
    async listProgramResults(tenantId, programId) {
      return select(
        `SELECT x.user_id AS "userId", x.division, x.activities_done AS "activitiesDone", x.final_score::float8 AS "finalScore",
                x.value_scores AS "valueScores", x.component_scores AS "componentScores"
           FROM cca_program_results x JOIN users u ON u.id = x.user_id AND u.tenant_id = x.tenant_id
          WHERE x.tenant_id = :tenantId AND x.program_id = :programId`, { tenantId, programId });
    },
    /**
     * Ganti seluruh hasil satu program dengan isi berkas (potret per cut off), dalam satu transaksi.
     * Return { removed } = karyawan yang ada di hasil lama tetapi tidak ada di berkas baru.
     */
    async replaceProgramResults(tenantId, programId, rows, { batchId, cutoffDate } = {}) {
      const t = await sequelize.transaction();
      try {
        for (const r of rows) {
          await sequelize.query(
            `INSERT INTO cca_program_results (tenant_id, program_id, user_id, division, activities_done, final_score, value_scores, component_scores, import_batch_id)
             SELECT :tenantId, p.id, u.id, :division, :activitiesDone, :finalScore, CAST(:valueScores AS jsonb), CAST(:componentScores AS jsonb), :batchId
               FROM cca_programs p, users u
              WHERE p.tenant_id = :tenantId AND p.id = :programId AND u.tenant_id = :tenantId AND u.id = :userId
             ON CONFLICT (tenant_id, program_id, user_id) DO UPDATE SET division = EXCLUDED.division, activities_done = EXCLUDED.activities_done,
               final_score = EXCLUDED.final_score, value_scores = EXCLUDED.value_scores, component_scores = EXCLUDED.component_scores,
               import_batch_id = EXCLUDED.import_batch_id, updated_at = now()`,
            {
              replacements: {
                tenantId, programId, userId: r.userId, division: r.division ?? null, activitiesDone: r.activitiesDone,
                finalScore: r.finalScore ?? null, valueScores: JSON.stringify(r.valueScores || []), componentScores: JSON.stringify(r.componentScores || []),
                batchId: batchId ?? null,
              },
              transaction: t,
            });
        }
        const [, meta] = await sequelize.query(
          `DELETE FROM cca_program_results WHERE tenant_id = :tenantId AND program_id = :programId AND NOT (user_id = ANY(CAST(:userIds AS uuid[])))`,
          { replacements: { tenantId, programId, userIds: `{${rows.map((r) => r.userId).join(',')}}` }, transaction: t });
        if (cutoffDate) {
          await sequelize.query('UPDATE cca_programs SET cutoff_date = :cutoffDate, updated_at = now() WHERE tenant_id = :tenantId AND id = :programId',
            { replacements: { tenantId, programId, cutoffDate }, transaction: t });
        }
        await t.commit();
        return { removed: (meta && meta.rowCount) || 0 };
      } catch (e) { await t.rollback(); throw e; }
    },

    // --- Penugasan wawancara berjenjang ---
    /** Pengguna yang bisa ditugaskan HR sebagai pimpinan, dengan ukuran timnya (bawahan langsung yang tidak nonaktif). */
    async listEligibleLeaders(tenantId, roles) {
      return select(
        `SELECT u.id, u.name, u.role, jr.name AS "jobRoleName", jr.division,
                (SELECT count(*)::int FROM users m WHERE m.tenant_id = u.tenant_id AND m.supervisor_id = u.id AND m.status <> 'disabled') AS "teamSize"
           FROM users u LEFT JOIN lna_job_roles jr ON jr.id = u.job_role_id AND jr.tenant_id = u.tenant_id
          WHERE u.tenant_id = :tenantId AND u.role IN (:roles) AND u.status <> 'disabled'
          ORDER BY u.name NULLS LAST, u.email`, { tenantId, roles });
    },
    /**
     * Penugasan terbaru per orang per tier (yang batal diabaikan). Filter opsional: assigneeIds, tier.
     * Putaran lama yang sudah selesai tertutup oleh putaran yang lebih baru.
     */
    async listAssignments(tenantId, { assigneeIds, tier } = {}) {
      const rep = { tenantId };
      let sql = `SELECT DISTINCT ON (a.assignee_id, a.tier) ${ASSIGNMENT_COLS}, u.name AS "assigneeName"
                   FROM cca_assignments a JOIN users u ON u.id = a.assignee_id AND u.tenant_id = a.tenant_id
                  WHERE a.tenant_id = :tenantId AND a.status <> 'cancelled'`;
      if (assigneeIds) { sql += ' AND a.assignee_id IN (:assigneeIds)'; rep.assigneeIds = assigneeIds.length ? assigneeIds : ['00000000-0000-0000-0000-000000000000']; }
      if (tier) { sql += ' AND a.tier = :tier'; rep.tier = tier; }
      return select(`${sql} ORDER BY a.assignee_id, a.tier, a.created_at DESC`, rep);
    },
    async getAssignment(tenantId, id) {
      return one(`SELECT ${ASSIGNMENT_COLS} FROM cca_assignments a WHERE a.tenant_id = :tenantId AND a.id = :id`, { tenantId, id });
    },
    /** Return baris baru, atau null bila orang itu masih punya penugasan berjalan di tier yang sama (indeks unik parsial). */
    async createAssignment(tenantId, a) {
      return returning(
        `INSERT INTO cca_assignments AS a (tenant_id, assignee_id, assigned_by, tier, parent_id, due_date, duration_minutes)
         SELECT :tenantId, u.id, :assignedBy, :tier, :parentId, :dueDate, :durationMinutes
           FROM users u WHERE u.tenant_id = :tenantId AND u.id = :assigneeId AND u.status <> 'disabled'
         ON CONFLICT (tenant_id, assignee_id, tier) WHERE status IN ('assigned','in_progress') DO NOTHING
         RETURNING ${ASSIGNMENT_COLS}`,
        { tenantId, assigneeId: a.assigneeId, assignedBy: a.assignedBy, tier: a.tier, parentId: a.parentId ?? null, dueDate: a.dueDate, durationMinutes: a.durationMinutes });
    },
    /** Batalkan hanya dari status assigned; return baris atau null bila status sudah berubah. */
    async cancelAssignment(tenantId, id) {
      return returning(
        `UPDATE cca_assignments AS a SET status = 'cancelled', updated_at = now()
          WHERE a.tenant_id = :tenantId AND a.id = :id AND a.status = 'assigned' RETURNING ${ASSIGNMENT_COLS}`, { tenantId, id });
    },
    /**
     * Sambungan untuk mesin wawancara (tahap 2): tandai selesai dan simpan ringkasan terenkripsi.
     * Return baris, atau null bila penugasan tidak aktif.
     */
    async completeAssignment(tenantId, id, { sessionId, summary } = {}) {
      return returning(
        `UPDATE cca_assignments AS a SET status = 'completed', completed_at = now(), updated_at = now(), session_id = :sessionId, summary = :summary
          WHERE a.tenant_id = :tenantId AND a.id = :id AND a.status IN ('assigned','in_progress') RETURNING ${ASSIGNMENT_COLS}`,
        { tenantId, id, sessionId: sessionId ?? null, summary: summary ? await cipher.encrypt(tenantId, summary) : null });
    },
    /**
     * PK-15: data Core Competencies milik satu karyawan untuk ekspor. Ringkasan wawancara hanya ikut bila
     * withSummary (karyawan mengekspor datanya sendiri).
     */
    async exportFor(tenantId, userId, { withSummary = false } = {}) {
      const results = await select(
        `SELECT p.key AS "programKey", p.name AS "programName", p.config, x.division, x.activities_done AS "activitiesDone",
                x.final_score::float8 AS "finalScore", x.value_scores AS "valueScores", x.component_scores AS "componentScores"
           FROM cca_program_results x JOIN cca_programs p ON p.id = x.program_id AND p.tenant_id = x.tenant_id
          WHERE x.tenant_id = :tenantId AND x.user_id = :userId ORDER BY p.name`, { tenantId, userId });
      const assignments = await select(
        `SELECT ${ASSIGNMENT_COLS}, a.summary FROM cca_assignments a
          WHERE a.tenant_id = :tenantId AND a.assignee_id = :userId ORDER BY a.created_at`, { tenantId, userId });
      if (withSummary) await cipher.open(tenantId, assignments, ['summary']);
      const withThemes = (a) => {
        const parsed = parseSummary(a.summary);
        return parsed ? { themes: parsed.themes, stances: parsed.stances } : null;
      };
      const named = (list, scores) => list.map((x, i) => ({ name: x.name, score: (scores || [])[i] ?? null }));
      return {
        programResults: results.map(({ config, valueScores, componentScores, ...r }) => ({
          ...r, totalActivities: config.totalActivities, values: named(config.values, valueScores), components: named(config.components, componentScores),
        })),
        interviewAssignments: assignments.map((a) => ({
          id: a.id, tier: a.tier, status: a.status, dueDate: a.dueDate, durationMinutes: a.durationMinutes, createdAt: a.createdAt, completedAt: a.completedAt,
          ...(withSummary ? { summary: withThemes(a) } : {}),
        })),
      };
    },
    /** Ringkasan terdekripsi { themes, stances } atau null. */
    async getAssignmentSummary(tenantId, id) {
      const row = await one('SELECT a.summary FROM cca_assignments a WHERE a.tenant_id = :tenantId AND a.id = :id', { tenantId, id });
      if (!row || !row.summary) return null;
      const [opened] = await cipher.open(tenantId, [row], ['summary']);
      return parseSummary(opened.summary);
    },

    // --- Percakapan wawancara (tahap 2) ---
    /** Sumber aktif untuk konteks pertanyaan: visi dan misi pertama menurut urutan, nama semua nilai. */
    async interviewSources(tenantId) {
      const rows = await select(
        `SELECT s.kind, s.title, s.text FROM cca_sources s WHERE s.tenant_id = :tenantId AND s.status = 'active'
          ORDER BY s.position, s.created_at`, { tenantId });
      const first = (kind) => {
        const r = rows.find((x) => x.kind === kind);
        return r ? { title: r.title, text: r.text } : null;
      };
      return { vision: first('vision'), mission: first('mission'), values: rows.filter((x) => x.kind === 'value').map((x) => x.title) };
    },
    /** Persyaratan tervalidasi dari sumber aktif, urut sumber lalu nama. ids: batasi ke daftar ini (urutan dipertahankan). */
    async validatedRequirements(tenantId, { ids, limit } = {}) {
      const rep = { tenantId };
      let sql = `SELECT r.id, r.name, r.actual_score::float8 AS "actualScore", r.actual_source AS "actualSource",
                        s.kind AS "sourceKind", s.title AS "sourceTitle"
                   FROM cca_requirements r JOIN cca_sources s ON s.id = r.source_id AND s.tenant_id = r.tenant_id
                  WHERE r.tenant_id = :tenantId AND r.status = 'validated' AND s.status = 'active'`;
      if (ids) {
        if (!ids.length) return [];
        sql += ' AND r.id IN (:ids)'; rep.ids = ids;
      }
      sql += ' ORDER BY s.position, s.created_at, r.name, r.id';
      if (limit) { sql += ' LIMIT :limit'; rep.limit = limit; }
      const rows = await select(sql, rep);
      if (!ids) return rows;
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id)).filter(Boolean);
    },
    /** Persetujuan: assigned -> in_progress, potret persyaratan. Return baris, atau null bila status sudah berubah. */
    async startInterview(tenantId, id, { consentVersion, requirementIds }) {
      return returning(
        `UPDATE cca_assignments AS a SET status = 'in_progress', consent_version = :consentVersion, consent_at = now(), started_at = now(),
                context_requirement_ids = CAST(:ids AS uuid[]), updated_at = now()
          WHERE a.tenant_id = :tenantId AND a.id = :id AND a.status = 'assigned' RETURNING ${ASSIGNMENT_COLS}`,
        { tenantId, id, consentVersion, ids: `{${requirementIds.join(',')}}` });
    },
    async listTurns(tenantId, assignmentId) {
      const rows = await select(`SELECT ${TURN_COLS} FROM cca_interview_turns t
                                  WHERE t.tenant_id = :tenantId AND t.assignment_id = :assignmentId ORDER BY t.position`, { tenantId, assignmentId });
      return cipher.open(tenantId, rows, ['text']);
    },
    /**
     * Sisipkan giliran secara atomik: hanya bila penugasan masih berjalan, belum diringkas, dan putarannya sama
     * (restartCount). Posisi bentrok (kiriman paralel) atau keadaan berubah -> null.
     */
    async insertTurn(tenantId, assignmentId, { position, role, theme, text, options, restartCount }) {
      const [rows] = await sequelize.query(
        `INSERT INTO cca_interview_turns (tenant_id, assignment_id, position, role, theme, text, options)
         SELECT a.tenant_id, a.id, :position, :role, :theme, :text, CAST(:options AS jsonb) FROM cca_assignments a
          WHERE a.tenant_id = :tenantId AND a.id = :assignmentId AND a.status = 'in_progress' AND a.summary_at IS NULL AND a.restart_count = :restartCount
         ON CONFLICT (assignment_id, position) DO NOTHING RETURNING position`,
        { replacements: { tenantId, assignmentId, position, role, theme, text: await cipher.encrypt(tenantId, text), options: options ? JSON.stringify(options) : null, restartCount } });
      return rows[0] || null;
    },
    /** Simpan ringkasan bila belum ada dan putarannya sama. Return true bila tersimpan. */
    async saveInterviewSummary(tenantId, id, { summary, restartCount }) {
      const row = await returning(
        `UPDATE cca_assignments AS a SET summary = :summary, summary_at = now(), updated_at = now()
          WHERE a.tenant_id = :tenantId AND a.id = :id AND a.status = 'in_progress' AND a.summary_at IS NULL AND a.restart_count = :restartCount
          RETURNING a.id`, { tenantId, id, restartCount, summary: await cipher.encrypt(tenantId, JSON.stringify(summary)) });
      return !!row;
    },
    /** Konfirmasi peserta: completed + salin sikap (selain not_covered). Return baris, atau null bila keadaan berubah. */
    async confirmInterview(tenantId, id) {
      const t = await sequelize.transaction();
      try {
        const [rows] = await sequelize.query(
          `UPDATE cca_assignments AS a SET status = 'completed', completed_at = now(), updated_at = now()
            WHERE a.tenant_id = :tenantId AND a.id = :id AND a.status = 'in_progress' AND a.summary_at IS NOT NULL
            RETURNING ${ASSIGNMENT_COLS}, a.summary`, { replacements: { tenantId, id }, transaction: t });
        if (!rows[0]) { await t.rollback(); return null; }
        const [opened] = await cipher.open(tenantId, [rows[0]], ['summary']);
        const { summary, ...row } = opened;
        const stances = (parseSummary(summary).stances || []).filter((x) => x.stance !== 'not_covered');
        for (const x of stances) {
          await sequelize.query(
            `INSERT INTO cca_interview_stances (tenant_id, assignment_id, requirement_id, tier, stance)
             SELECT :tenantId, :id, r.id, :tier, :stance FROM cca_requirements r WHERE r.tenant_id = :tenantId AND r.id = :requirementId
             ON CONFLICT DO NOTHING`, { replacements: { tenantId, id, tier: row.tier, stance: x.stance, requirementId: x.requirementId }, transaction: t });
        }
        await t.commit();
        return row;
      } catch (e) { await t.rollback(); throw e; }
    },
    /** Ulangi sekali: hapus giliran dan ringkasan. Return baris, atau null bila batas habis atau keadaan berubah. */
    async restartInterview(tenantId, id, { maxRestarts }) {
      const t = await sequelize.transaction();
      try {
        const [rows] = await sequelize.query(
          `UPDATE cca_assignments AS a SET restart_count = a.restart_count + 1, summary = NULL, summary_at = NULL, updated_at = now()
            WHERE a.tenant_id = :tenantId AND a.id = :id AND a.status = 'in_progress' AND a.restart_count < :maxRestarts
            RETURNING ${ASSIGNMENT_COLS}`, { replacements: { tenantId, id, maxRestarts }, transaction: t });
        if (!rows[0]) { await t.rollback(); return null; }
        await sequelize.query('DELETE FROM cca_interview_turns WHERE tenant_id = :tenantId AND assignment_id = :id', { replacements: { tenantId, id }, transaction: t });
        await t.commit();
        return rows[0];
      } catch (e) { await t.rollback(); throw e; }
    },
    /** Masukan sintesis: sikap dari penugasan completed (semua putaran; sintesis memilih yang terbaru per orang per tier). */
    async synthesisResponses(tenantId) {
      const rows = await select(
        `SELECT a.id, a.assignee_id AS "assigneeId", a.tier, a.completed_at AS "completedAt", x.requirement_id AS "requirementId", x.stance
           FROM cca_assignments a LEFT JOIN cca_interview_stances x ON x.assignment_id = a.id AND x.tenant_id = a.tenant_id
          WHERE a.tenant_id = :tenantId AND a.status = 'completed' AND a.completed_at IS NOT NULL`, { tenantId });
      const byAssignment = new Map();
      for (const r of rows) {
        if (!byAssignment.has(r.id)) byAssignment.set(r.id, { assigneeId: r.assigneeId, tier: r.tier, completedAt: r.completedAt, stances: {} });
        if (r.requirementId) byAssignment.get(r.id).stances[r.requirementId] = r.stance;
      }
      return [...byAssignment.values()];
    },
    /** Isi nilai aktual dari sintesis. items: [{ id, score }]. Return [{ requirementId, previous: { actualScore, actualSource } }]. */
    async applySynthesis(tenantId, items) {
      const t = await sequelize.transaction();
      try {
        const out = [];
        for (const { id, score } of items) {
          const [prev] = await sequelize.query(
            `SELECT r.actual_score::float8 AS "actualScore", r.actual_source AS "actualSource" FROM cca_requirements r
              WHERE r.tenant_id = :tenantId AND r.id = :id FOR UPDATE`, { replacements: { tenantId, id }, transaction: t, type: QueryTypes.SELECT });
          if (!prev) continue;
          await sequelize.query(
            `UPDATE cca_requirements SET actual_score = :score, actual_source = 'synthesis', actual_updated_at = now(), updated_at = now()
              WHERE tenant_id = :tenantId AND id = :id`, { replacements: { tenantId, id, score }, transaction: t });
          out.push({ requirementId: id, previous: prev });
        }
        await t.commit();
        return out;
      } catch (e) { await t.rollback(); throw e; }
    },
  };

  return { cca };
}

module.exports = { createCcaStores };
