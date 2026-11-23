'use strict';
// Store Postgres untuk B15 Learning Impact Measurement. Setiap query memfilter tenant_id; rujukan (modul, jabatan,
// karyawan, kompetensi) dicek milik tenant yang sama. Skor per karyawan adalah data individu: audit di router.
const { QueryTypes } = require('sequelize');

const PLAN_COLS = `p.id, p.title, p.job_role_id AS "jobRoleId", jr.name AS "jobRoleName",
  to_char(p.period_from, 'YYYY-MM-DD') AS "periodFrom", to_char(p.period_until, 'YYYY-MM-DD') AS "periodUntil",
  p.business_problem AS "businessProblem", p.desired_behavior AS "desiredBehavior", p.priority_capabilities AS "priorityCapabilities",
  p.evidence_plan AS "evidencePlan", p.existing_metrics AS "existingMetrics", p.baseline_label AS "baselineLabel",
  p.after_label AS "afterLabel", p.value_estimate AS "valueEstimate", p.factors, p.status, p.created_at AS "createdAt", p.updated_at AS "updatedAt"`;
const PLAN_PATCH = {
  title: 'title', jobRoleId: 'job_role_id', periodFrom: 'period_from', periodUntil: 'period_until', businessProblem: 'business_problem',
  desiredBehavior: 'desired_behavior', priorityCapabilities: 'priority_capabilities', evidencePlan: 'evidence_plan',
  existingMetrics: 'existing_metrics', baselineLabel: 'baseline_label', afterLabel: 'after_label', valueEstimate: 'value_estimate',
  factors: 'factors', status: 'status',
};
const JSON_COLS = new Set(['valueEstimate', 'factors']);
const IND_COLS = `i.id, i.plan_id AS "planId", i.name, i.level, i.source, i.unit, i.direction, i.baseline::float8 AS baseline,
  i.current::float8 AS current, i.target::float8 AS target, i.strength, i.position`;
const IND_PATCH = { name: 'name', level: 'level', source: 'source', unit: 'unit', direction: 'direction', baseline: 'baseline', current: 'current', target: 'target', strength: 'strength', position: 'position' };
const MEAS_COLS = `m.user_id AS "userId", m.competency_id AS "competencyId", m.pre_score::float8 AS "preScore", m.pre_source AS "preSource",
  m.post_score::float8 AS "postScore", m.post_source AS "postSource", m.performance_score::float8 AS "performanceScore",
  m.performance_source AS "performanceSource", m.performance_note AS "performanceNote", m.reinterview_status AS "reinterviewStatus",
  to_char(m.reinterview_on, 'YYYY-MM-DD') AS "reinterviewOn", m.reinterview_score::float8 AS "reinterviewScore"`;
const RI_COLS = `r.id, r.plan_id AS "planId", r.user_id AS "userId", r.status, r.consent_version AS "consentVersion", r.consent_at AS "consentAt",
  r.competency_ids AS "competencyIds", r.completed_at AS "completedAt", r.created_at AS "createdAt"`;
const MEAS_FIELDS = {
  preScore: ['pre_score', 'pre_source'], postScore: ['post_score', 'post_source'], performanceScore: ['performance_score', 'performance_source'],
};

function createLimStores(sequelize, { cipher } = {}) {
  const select = (sql, replacements = {}, transaction) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
  const one = async (sql, replacements, transaction) => (await select(sql, replacements, transaction))[0] || null;
  const write = async (sql, replacements, transaction) => (await sequelize.query(sql, { replacements, transaction }))[0];
  const tx = async (fn) => {
    const t = await sequelize.transaction();
    try { const out = await fn(t); await t.commit(); return out; } catch (e) { await t.rollback(); throw e; }
  };
  /** Pelatihan rencana: modul rencana, tidak batal, tanggal mulai efektif di dalam periode (bila diisi). */
  const PLAN_TRAININGS = `
    SELECT t.* FROM ld_trainings t
      JOIN lim_plan_modules pm ON pm.module_id = t.module_id AND pm.tenant_id = t.tenant_id
      JOIN lim_plans p ON p.id = pm.plan_id AND p.tenant_id = t.tenant_id
     WHERE t.tenant_id = :tenantId AND p.id = :planId AND t.status <> 'cancelled'
       AND (p.period_from IS NULL OR COALESCE(t.starts_on, t.created_at::date) >= p.period_from)
       AND (p.period_until IS NULL OR COALESCE(t.starts_on, t.created_at::date) <= p.period_until)`;
  /** Karyawan aktif yang lolos saringan jabatan rencana. */
  /** Tidak ada wawancara ulang berjalan untuk (rencana, karyawan) ini: jadwalnya dikunci sampai selesai (triase 12.7 #2). */
  const NO_OPEN_REINTERVIEW = `NOT EXISTS (SELECT 1 FROM lim_reinterviews r WHERE r.tenant_id = :tenantId AND r.plan_id = :planId
    AND r.user_id = :userId AND r.status = 'in_progress')`;
  const ROLE_OK = '(p.job_role_id IS NULL OR u.job_role_id = p.job_role_id)';

  const lim = {
    async listPlans(tenantId, { archived = false } = {}) {
      return select(`SELECT ${PLAN_COLS}, (SELECT count(*)::int FROM lim_plan_modules pm WHERE pm.plan_id = p.id AND pm.tenant_id = p.tenant_id) AS "moduleCount"
        FROM lim_plans p LEFT JOIN lna_job_roles jr ON jr.id = p.job_role_id AND jr.tenant_id = p.tenant_id
        WHERE p.tenant_id = :tenantId ${archived ? '' : "AND p.status = 'active'"} ORDER BY p.created_at DESC`, { tenantId });
    },
    async getPlan(tenantId, id) {
      const plan = await one(`SELECT ${PLAN_COLS} FROM lim_plans p LEFT JOIN lna_job_roles jr ON jr.id = p.job_role_id AND jr.tenant_id = p.tenant_id
        WHERE p.tenant_id = :tenantId AND p.id = :id`, { tenantId, id });
      if (!plan) return null;
      plan.modules = await select(`SELECT m.id, m.name AS title, m.code FROM lim_plan_modules pm JOIN li_modules m ON m.id = pm.module_id AND m.tenant_id = pm.tenant_id
        WHERE pm.tenant_id = :tenantId AND pm.plan_id = :id ORDER BY m.code`, { tenantId, id });
      return plan;
    },
    async countModules(tenantId, ids) {
      if (!ids.length) return 0;
      return (await one('SELECT count(*)::int AS n FROM li_modules WHERE tenant_id = :tenantId AND id IN (:ids)', { tenantId, ids })).n;
    },
    async options(tenantId) {
      const [modules, jobRoles] = await Promise.all([
        select('SELECT id, code, name FROM li_modules WHERE tenant_id = :tenantId ORDER BY code', { tenantId }),
        select('SELECT id, name FROM lna_job_roles WHERE tenant_id = :tenantId ORDER BY name', { tenantId }),
      ]);
      return { modules, jobRoles };
    },
    async jobRoleExists(tenantId, id) {
      return !!(await one('SELECT 1 AS x FROM lna_job_roles WHERE tenant_id = :tenantId AND id = :id', { tenantId, id }));
    },
    async createPlan(tenantId, v, userId) {
      return tx(async (t) => {
        const [row] = await write(`INSERT INTO lim_plans (tenant_id, title, job_role_id, period_from, period_until, business_problem, desired_behavior,
            priority_capabilities, evidence_plan, existing_metrics, baseline_label, after_label, created_by, updated_by)
          VALUES (:tenantId, :title, :jobRoleId, :periodFrom, :periodUntil, :businessProblem, :desiredBehavior, :priorityCapabilities, :evidencePlan,
            :existingMetrics, :baselineLabel, :afterLabel, :userId, :userId) RETURNING id`, { tenantId, userId, ...v }, t);
        await lim.setModules(tenantId, row.id, v.moduleIds, t);
        return row.id;
      });
    },
    async setModules(tenantId, planId, moduleIds, t) {
      await write('DELETE FROM lim_plan_modules WHERE tenant_id = :tenantId AND plan_id = :planId', { tenantId, planId }, t);
      for (const moduleId of moduleIds) {
        await write(`INSERT INTO lim_plan_modules (tenant_id, plan_id, module_id)
          SELECT :tenantId, :planId, m.id FROM li_modules m WHERE m.tenant_id = :tenantId AND m.id = :moduleId`, { tenantId, planId, moduleId }, t);
      }
    },
    async updatePlan(tenantId, id, patch, userId) {
      return tx(async (t) => {
        const sets = []; const rep = { tenantId, id, userId };
        for (const [k, col] of Object.entries(PLAN_PATCH)) {
          if (patch[k] === undefined) continue;
          sets.push(JSON_COLS.has(k) ? `${col} = CAST(:${k} AS jsonb)` : `${col} = :${k}`);
          rep[k] = JSON_COLS.has(k) ? JSON.stringify(patch[k]) : patch[k];
        }
        const rows = await write(`UPDATE lim_plans SET ${[...sets, 'updated_by = :userId', 'updated_at = now()'].join(', ')}
          WHERE tenant_id = :tenantId AND id = :id RETURNING id`, rep, t);
        if (!rows.length) return false;
        if (patch.moduleIds) await lim.setModules(tenantId, id, patch.moduleIds, t);
        return true;
      });
    },

    /** Kompetensi rencana dan jumlah kompetensi per modul (untuk tanda postShared). */
    async planCompetencies(tenantId, planId) {
      return select(`SELECT DISTINCT c.id, c.name FROM lim_plan_modules pm
          JOIN li_module_competencies mc ON mc.module_id = pm.module_id AND mc.tenant_id = pm.tenant_id
          JOIN lna_competencies c ON c.id = mc.competency_id AND c.tenant_id = pm.tenant_id
        WHERE pm.tenant_id = :tenantId AND pm.plan_id = :planId`, { tenantId, planId });
    },
    /**
     * Keikutsertaan pelatihan rencana oleh karyawan aktif yang lolos saringan jabatan, satu baris per
     * (keikutsertaan, kompetensi modul). Tanggal selesai efektif = COALESCE(completed_at WIB, ends_on, starts_on).
     */
    async participations(tenantId, planId) {
      return select(`WITH pt AS (${PLAN_TRAININGS})
        SELECT lp.id, lp.user_id AS "userId", u.name, u.supervisor_id AS "supervisorId", pt.id AS "trainingId", pt.mode, lp.status, lp.attendance,
               lp.score::float8 AS score, lp.score_source AS "scoreSource", lp.created_at AS "createdAt",
               to_char(COALESCE((lp.completed_at AT TIME ZONE 'Asia/Jakarta')::date, pt.ends_on, pt.starts_on), 'YYYY-MM-DD') AS "completedOn",
               to_char(COALESCE(pt.starts_on, pt.created_at::date), 'YYYY-MM-DD') AS "startedOn",
               mc.competency_id AS "competencyId",
               (SELECT count(*)::int FROM li_module_competencies x WHERE x.module_id = pt.module_id AND x.tenant_id = pt.tenant_id) AS "moduleCompetencies"
          FROM pt
          JOIN lim_plans p ON p.id = :planId AND p.tenant_id = :tenantId
          JOIN ld_participants lp ON lp.training_id = pt.id AND lp.tenant_id = pt.tenant_id
          JOIN users u ON u.id = lp.user_id AND u.tenant_id = lp.tenant_id AND u.status = 'active' AND ${ROLE_OK}
          LEFT JOIN li_module_competencies mc ON mc.module_id = pt.module_id AND mc.tenant_id = pt.tenant_id
         ORDER BY lp.id`, { tenantId, planId });
    },
    /** Baris skor tersimpan rencana (karyawan aktif yang lolos saringan jabatan). */
    async measurements(tenantId, planId) {
      return select(`SELECT ${MEAS_COLS}, u.name, u.supervisor_id AS "supervisorId", jr.name AS "jobRoleName"
          FROM lim_measurements m
          JOIN lim_plans p ON p.id = m.plan_id AND p.tenant_id = m.tenant_id
          JOIN users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id AND u.status = 'active' AND ${ROLE_OK}
          LEFT JOIN lna_job_roles jr ON jr.id = u.job_role_id AND jr.tenant_id = u.tenant_id
         WHERE m.tenant_id = :tenantId AND m.plan_id = :planId`, { tenantId, planId });
    },
    async users(tenantId, ids) {
      if (!ids.length) return [];
      return select(`SELECT u.id, u.name, jr.name AS "jobRoleName" FROM users u LEFT JOIN lna_job_roles jr ON jr.id = u.job_role_id AND jr.tenant_id = u.tenant_id
        WHERE u.tenant_id = :tenantId AND u.id IN (:ids)`, { tenantId, ids });
    },
    /**
     * Simpan isian satu pasangan. patch: { preScore?, postScore?, performanceScore?, performanceNote? } (undefined = tetap,
     * null = kosongkan). source: 'manual' | 'import' | 'dna' (dna hanya untuk pre).
     */
    async upsertMeasurement(tenantId, planId, userId, competencyId, patch, { source = 'manual', by = null, onlyEmptyPre = false } = {}) {
      const cols = []; const rep = { tenantId, planId, userId, competencyId, by };
      for (const [f, [col, srcCol]] of Object.entries(MEAS_FIELDS)) {
        if (patch[f] === undefined) continue;
        rep[f] = patch[f]; rep[`${f}Src`] = patch[f] === null ? null : source;
        cols.push([col, `:${f}`], [srcCol, `:${f}Src`]);
      }
      if (patch.performanceNote !== undefined) { rep.note = patch.performanceNote; cols.push(['performance_note', ':note']); }
      if (!cols.length) return false;
      const rows = await write(`INSERT INTO lim_measurements (tenant_id, plan_id, user_id, competency_id, ${cols.map((c) => c[0]).join(', ')}, updated_by)
          VALUES (:tenantId, :planId, :userId, :competencyId, ${cols.map((c) => c[1]).join(', ')}, :by)
        ON CONFLICT (plan_id, user_id, competency_id) DO UPDATE SET ${cols.map((c) => `${c[0]} = EXCLUDED.${c[0]}`).join(', ')}, updated_by = :by, updated_at = now()
        ${onlyEmptyPre ? 'WHERE lim_measurements.pre_score IS NULL' : ''} RETURNING id`, rep);
      return rows.length > 0;
    },
    /** Asesmen DNA karyawan untuk kompetensi tertentu, dengan tanggal efektif. */
    async dnaAssessments(tenantId, userIds, competencyIds) {
      if (!userIds.length || !competencyIds.length) return [];
      return select(`SELECT a.user_id AS "userId", a.competency_id AS "competencyId", a.score::int AS score,
          to_char((COALESCE(a.assessed_at, a.created_at) AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS "assessedOn"
        FROM lna_assessments a WHERE a.tenant_id = :tenantId AND a.user_id IN (:userIds) AND a.competency_id IN (:competencyIds)`, { tenantId, userIds, competencyIds });
    },
    /** Jadwalkan (date) atau batalkan (date null) wawancara ulang untuk pasangan yang belum done. */
    async schedule(tenantId, planId, userId, competencyIds, date, by) {
      // pasangan milik wawancara ulang yang sedang berjalan tidak diubah (triase 12.7 #2); router melewatinya lebih dulu
      if (date === null) {
        await write(`UPDATE lim_measurements SET reinterview_status = 'none', reinterview_on = NULL, updated_by = :by, updated_at = now()
          WHERE tenant_id = :tenantId AND plan_id = :planId AND user_id = :userId AND reinterview_status = 'scheduled' AND ${NO_OPEN_REINTERVIEW}`, { tenantId, planId, userId, by });
        return;
      }
      // satu karyawan = satu wawancara: semua kompetensinya terjadwal bersama atau tidak sama sekali
      await tx(async (t) => {
        for (const competencyId of competencyIds) {
          await write(`INSERT INTO lim_measurements (tenant_id, plan_id, user_id, competency_id, reinterview_status, reinterview_on, updated_by)
              VALUES (:tenantId, :planId, :userId, :competencyId, 'scheduled', :date, :by)
            ON CONFLICT (plan_id, user_id, competency_id) DO UPDATE SET reinterview_status = 'scheduled', reinterview_on = :date, updated_by = :by, updated_at = now()
            WHERE lim_measurements.reinterview_status <> 'done' AND ${NO_OPEN_REINTERVIEW}`, { tenantId, planId, userId, competencyId, date, by }, t);
        }
      });
    },
    /** Sambungan mesin wawancara (tahap 3): catat hasil wawancara ulang satu pasangan. */
    async recordReinterview(tenantId, planId, userId, competencyId, { score, sessionId = null }) {
      await write(`INSERT INTO lim_measurements (tenant_id, plan_id, user_id, competency_id, reinterview_status, reinterview_score, reinterview_session_id)
          SELECT :tenantId, p.id, :userId, :competencyId, 'done', :score, :sessionId FROM lim_plans p WHERE p.tenant_id = :tenantId AND p.id = :planId
            AND EXISTS (SELECT 1 FROM users u WHERE u.id = :userId AND u.tenant_id = :tenantId)
            AND EXISTS (SELECT 1 FROM lna_competencies c WHERE c.id = :competencyId AND c.tenant_id = :tenantId)
        ON CONFLICT (plan_id, user_id, competency_id) DO UPDATE SET reinterview_status = 'done', reinterview_score = :score,
          reinterview_session_id = :sessionId, updated_at = now()`, { tenantId, planId, userId, competencyId, score, sessionId });
    },

    // --- B15 tahap 3: wawancara ulang AI (spek bagian 12) ---
    /** Pasangan scheduled karyawan di rencana aktif, dengan data kompetensi untuk prompt. */
    async scheduledPairs(tenantId, planId, userId) {
      return select(`SELECT m.competency_id AS "competencyId", c.name, c.definition, c.indicators, to_char(m.reinterview_on, 'YYYY-MM-DD') AS "reinterviewOn"
          FROM lim_measurements m JOIN lim_plans p ON p.id = m.plan_id AND p.tenant_id = m.tenant_id AND p.status = 'active'
          JOIN lna_competencies c ON c.id = m.competency_id AND c.tenant_id = m.tenant_id
         WHERE m.tenant_id = :tenantId AND m.plan_id = :planId AND m.user_id = :userId AND m.reinterview_status = 'scheduled'
         ORDER BY c.name`, { tenantId, planId, userId });
    },
    /** Kompetensi potret (urutan potret dipertahankan). */
    async competenciesByIds(tenantId, ids) {
      if (!ids.length) return [];
      const rows = await select('SELECT id, name, definition, indicators FROM lna_competencies WHERE tenant_id = :tenantId AND id IN (:ids)', { tenantId, ids });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id)).filter(Boolean);
    },
    /** Rencana aktif tempat karyawan punya pasangan scheduled atau wawancara ulang. */
    async myReinterviewPlans(tenantId, userId) {
      return select(`SELECT p.id AS "planId", p.title AS "planTitle",
            (SELECT to_char(min(m.reinterview_on), 'YYYY-MM-DD') FROM lim_measurements m WHERE m.plan_id = p.id AND m.tenant_id = p.tenant_id AND m.user_id = :userId AND m.reinterview_status = 'scheduled') AS "scheduledOn",
            ARRAY(SELECT c.name FROM lim_measurements m JOIN lna_competencies c ON c.id = m.competency_id AND c.tenant_id = m.tenant_id
                   WHERE m.plan_id = p.id AND m.tenant_id = p.tenant_id AND m.user_id = :userId AND m.reinterview_status = 'scheduled' ORDER BY c.name) AS scheduled,
            (SELECT r.status FROM lim_reinterviews r WHERE r.plan_id = p.id AND r.tenant_id = p.tenant_id AND r.user_id = :userId
              ORDER BY (r.status = 'in_progress') DESC, r.created_at DESC LIMIT 1) AS "lastStatus"
          FROM lim_plans p
         WHERE p.tenant_id = :tenantId AND p.status = 'active'
           AND (EXISTS (SELECT 1 FROM lim_measurements m WHERE m.plan_id = p.id AND m.tenant_id = p.tenant_id AND m.user_id = :userId AND m.reinterview_status = 'scheduled')
             OR EXISTS (SELECT 1 FROM lim_reinterviews r WHERE r.plan_id = p.id AND r.tenant_id = p.tenant_id AND r.user_id = :userId))
         ORDER BY p.title`, { tenantId, userId });
    },
    /** Wawancara yang berjalan, atau yang selesai terbaru. */
    async currentReinterview(tenantId, planId, userId) {
      return one(`SELECT ${RI_COLS} FROM lim_reinterviews r WHERE r.tenant_id = :tenantId AND r.plan_id = :planId AND r.user_id = :userId
        ORDER BY (r.status = 'in_progress') DESC, r.created_at DESC LIMIT 1`, { tenantId, planId, userId });
    },
    /** Karyawan rencana yang punya wawancara berjalan, dan wawancara selesai terbaru per karyawan. */
    async reinterviewIndex(tenantId, planId) {
      const rows = await select(`SELECT DISTINCT ON (r.user_id, r.status) r.user_id AS "userId", r.id, r.status FROM lim_reinterviews r
        WHERE r.tenant_id = :tenantId AND r.plan_id = :planId ORDER BY r.user_id, r.status, r.created_at DESC`, { tenantId, planId });
      return {
        inProgress: new Set(rows.filter((r) => r.status === 'in_progress').map((r) => r.userId)),
        latestCompleted: new Map(rows.filter((r) => r.status === 'completed').map((r) => [r.userId, r.id])),
      };
    },
    /** Buat wawancara (persetujuan). Return baris, atau null bila sudah ada yang berjalan. */
    async startReinterview(tenantId, { planId, userId, consentVersion, competencyIds }) {
      const rows = await write(`INSERT INTO lim_reinterviews (tenant_id, plan_id, user_id, consent_version, competency_ids)
          VALUES (:tenantId, :planId, :userId, :consentVersion, CAST(:ids AS uuid[]))
        ON CONFLICT (plan_id, user_id) WHERE status = 'in_progress' DO NOTHING RETURNING id`,
      { tenantId, planId, userId, consentVersion, ids: `{${competencyIds.join(',')}}` });
      return rows.length ? one(`SELECT ${RI_COLS} FROM lim_reinterviews r WHERE r.tenant_id = :tenantId AND r.id = :id`, { tenantId, id: rows[0].id }) : null;
    },
    async listReinterviewTurns(tenantId, reinterviewId) {
      const rows = await select(`SELECT t.position, t.role, t.kind, t.competency_id AS "competencyId", t.text, t.options FROM lim_reinterview_turns t
        WHERE t.tenant_id = :tenantId AND t.reinterview_id = :reinterviewId ORDER BY t.position`, { tenantId, reinterviewId });
      await cipher.open(tenantId, rows, ['text', 'options']);
      return rows.map((r) => ({ ...r, options: r.options ? JSON.parse(r.options) : null }));
    },
    /** Sisipkan giliran di bawah kunci baris wawancara (pola B10): hanya bila masih berjalan dan giliran = position - 1. */
    async insertReinterviewTurn(tenantId, reinterviewId, { position, role, kind, competencyId, text: body, options }) {
      return tx(async (t) => {
        const locked = await one(`SELECT r.id FROM lim_reinterviews r WHERE r.tenant_id = :tenantId AND r.id = :reinterviewId AND r.status = 'in_progress' FOR UPDATE`,
          { tenantId, reinterviewId }, t);
        if (!locked) return null;
        const { n } = await one('SELECT count(*)::int AS n FROM lim_reinterview_turns WHERE tenant_id = :tenantId AND reinterview_id = :reinterviewId', { tenantId, reinterviewId }, t);
        if (n !== position - 1) return null;
        await write(`INSERT INTO lim_reinterview_turns (tenant_id, reinterview_id, position, role, kind, competency_id, text, options)
          VALUES (:tenantId, :reinterviewId, :position, :role, :kind, :competencyId, :text, :options)`, {
          tenantId, reinterviewId, position, role, kind, competencyId,
          text: await cipher.encrypt(tenantId, body), options: options ? await cipher.encrypt(tenantId, JSON.stringify(options)) : null,
        }, t);
        return { position };
      });
    },
    /**
     * Tutup wawancara (T-5) dalam satu transaksi: kunci baris, syarat masih in_progress, tulis skor ke pasangan potret yang
     * belum done (termasuk yang jadwalnya dibatalkan HR bersamaan dengan persetujuan; wawancaranya tetap terjadi), simpan
     * ringkasan terenkripsi. Return true bila menutup, false bila sudah ditutup kiriman lain.
     */
    async completeReinterview(tenantId, id, { scores, summary }) {
      const enc = await cipher.encrypt(tenantId, JSON.stringify(summary));
      return tx(async (t) => {
        const r = await one(`SELECT r.plan_id AS "planId", r.user_id AS "userId" FROM lim_reinterviews r
          WHERE r.tenant_id = :tenantId AND r.id = :id AND r.status = 'in_progress' FOR UPDATE`, { tenantId, id }, t);
        if (!r) return false;
        for (const s of scores) {
          await write(`UPDATE lim_measurements SET reinterview_status = 'done', reinterview_score = :score, reinterview_session_id = :id, updated_at = now()
            WHERE tenant_id = :tenantId AND plan_id = :planId AND user_id = :userId AND competency_id = :competencyId AND reinterview_status <> 'done'`,
          { tenantId, id, planId: r.planId, userId: r.userId, competencyId: s.competencyId, score: s.score }, t);
        }
        await write(`UPDATE lim_reinterviews SET status = 'completed', summary = :enc, completed_at = now(), updated_at = now()
          WHERE tenant_id = :tenantId AND id = :id`, { tenantId, id, enc }, t);
        return true;
      });
    },
    /** Wawancara selesai karyawan di satu rencana (atau semua rencana bila planId null), terbaru dulu, ringkasan dibuka. */
    async completedReinterviews(tenantId, userId, { planId = null } = {}) {
      const rows = await select(`SELECT ${RI_COLS}, r.summary, p.title AS "planTitle" FROM lim_reinterviews r
          JOIN lim_plans p ON p.id = r.plan_id AND p.tenant_id = r.tenant_id
         WHERE r.tenant_id = :tenantId AND r.user_id = :userId AND r.status = 'completed' ${planId ? 'AND r.plan_id = :planId' : ''}
         ORDER BY r.completed_at DESC`, { tenantId, userId, planId });
      await cipher.open(tenantId, rows, ['summary']);
      return rows.map((r) => ({ ...r, summary: r.summary ? JSON.parse(r.summary) : null }));
    },
    /** Ekspor PK-15: semua wawancara ulang karyawan. self: alasan dan transkrip ikut. */
    async reinterviewsForExport(tenantId, userId, { self = false } = {}) {
      const rows = await select(`SELECT ${RI_COLS}, r.summary, p.title AS "planTitle" FROM lim_reinterviews r
          JOIN lim_plans p ON p.id = r.plan_id AND p.tenant_id = r.tenant_id
         WHERE r.tenant_id = :tenantId AND r.user_id = :userId ORDER BY r.created_at`, { tenantId, userId });
      await cipher.open(tenantId, rows, ['summary']);
      const names = new Map((await lim.competenciesByIds(tenantId, [...new Set(rows.flatMap((r) => r.competencyIds))])).map((c) => [c.id, c.name]));
      const out = [];
      for (const r of rows) {
        const scores = r.summary ? JSON.parse(r.summary).competencies : [];
        out.push({
          planId: r.planId, planTitle: r.planTitle, status: r.status, consentVersion: r.consentVersion, consentAt: r.consentAt, completedAt: r.completedAt,
          competencies: scores.map((s) => ({ competencyId: s.competencyId, name: names.get(s.competencyId) || null, score: s.score, ...(self ? { reason: s.reason } : {}) })),
          ...(self ? { turns: (await lim.listReinterviewTurns(tenantId, r.id)).map(({ position, role, kind, text, options }) => ({ position, role, kind, text, options })) } : {}),
        });
      }
      return out;
    },

    async listIndicators(tenantId, planId) {
      return select(`SELECT ${IND_COLS} FROM lim_indicators i WHERE i.tenant_id = :tenantId AND i.plan_id = :planId ORDER BY i.position, i.created_at`, { tenantId, planId });
    },
    async getIndicator(tenantId, id) {
      return one(`SELECT ${IND_COLS} FROM lim_indicators i WHERE i.tenant_id = :tenantId AND i.id = :id`, { tenantId, id });
    },
    async countIndicators(tenantId, planId) {
      return (await one('SELECT count(*)::int AS n FROM lim_indicators WHERE tenant_id = :tenantId AND plan_id = :planId', { tenantId, planId })).n;
    },
    async createIndicator(tenantId, planId, v) {
      const [row] = await write(`INSERT INTO lim_indicators (tenant_id, plan_id, name, level, source, unit, direction, baseline, current, target, strength, position)
        VALUES (:tenantId, :planId, :name, :level, :source, :unit, :direction, :baseline, :current, :target, :strength,
          (SELECT COALESCE(max(position) + 1, 0) FROM lim_indicators WHERE tenant_id = :tenantId AND plan_id = :planId)) RETURNING id`,
      { tenantId, planId, source: null, unit: null, baseline: null, current: null, target: null, strength: null, ...v });
      return lim.getIndicator(tenantId, row.id);
    },
    async updateIndicator(tenantId, id, patch) {
      const sets = []; const rep = { tenantId, id };
      for (const [k, col] of Object.entries(IND_PATCH)) {
        if (patch[k] === undefined) continue;
        sets.push(`${col} = :${k}`); rep[k] = patch[k];
      }
      if (sets.length) await write(`UPDATE lim_indicators SET ${sets.join(', ')}, updated_at = now() WHERE tenant_id = :tenantId AND id = :id`, rep);
      return lim.getIndicator(tenantId, id);
    },
    async deleteIndicator(tenantId, id) {
      return (await write('DELETE FROM lim_indicators WHERE tenant_id = :tenantId AND id = :id RETURNING id', { tenantId, id })).length > 0;
    },

    /** Ekspor PK-15: semua baris skor karyawan ini di semua rencana tenant. */
    async exportForUser(tenantId, userId) {
      return select(`SELECT m.plan_id AS "planId", p.title AS "planTitle", ${MEAS_COLS}, c.name AS "competencyName"
          FROM lim_measurements m JOIN lim_plans p ON p.id = m.plan_id AND p.tenant_id = m.tenant_id
          JOIN lna_competencies c ON c.id = m.competency_id AND c.tenant_id = m.tenant_id
         WHERE m.tenant_id = :tenantId AND m.user_id = :userId ORDER BY p.title, c.name`, { tenantId, userId });
    },
  };
  return { lim };
}

module.exports = { createLimStores };
