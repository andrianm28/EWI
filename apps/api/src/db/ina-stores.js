'use strict';
// B9 Improvement Needs: tindakan perbaikan dan verifikasi AI. Setiap query memfilter tenant_id; id dari klien
// selalu dicari ulang dalam tenant. Teks bebas dienkripsi per tenant (R2-3).
const { QueryTypes } = require('sequelize');

const NO_ID = '00000000-0000-0000-0000-000000000000';
const isUnique = (e) => e && (e.name === 'SequelizeUniqueConstraintError' || (e.original && e.original.code === '23505'));

const ACTION_COLS = `a.id, a.title, a.detail, a.category, a.sub_label AS "subLabel", a.owner_user_id AS "ownerUserId",
  o.name AS "ownerName", jr.name AS "ownerJobRoleName", a.finding_id AS "findingId", a.source_ref AS "sourceRef",
  a.competency_id AS "competencyId", a.performance_record_id AS "performanceRecordId",
  to_char(a.due_date, 'YYYY-MM-DD') AS "dueDate", a.status, a.involves_individual AS "involvesIndividual",
  a.created_at AS "createdAt", a.updated_at AS "updatedAt", a.completed_at AS "completedAt",
  v.id AS "verificationId", v.status AS "verificationStatus", v.reported_status AS "verificationReportedStatus",
  v.ended_at AS "verificationEndedAt"`;
// verifikasi terakhir yang masih bermakna (yang dibatalkan atau ditarik tidak ditampilkan)
const ACTION_FROM = `FROM ina_actions a
  LEFT JOIN users o ON o.id = a.owner_user_id AND o.tenant_id = a.tenant_id
  LEFT JOIN lna_job_roles jr ON jr.id = o.job_role_id AND jr.tenant_id = a.tenant_id
  LEFT JOIN LATERAL (SELECT x.id, x.status, x.reported_status, x.ended_at FROM ina_verifications x
                      WHERE x.action_id = a.id AND x.tenant_id = a.tenant_id AND x.status NOT IN ('cancelled','withdrawn')
                      ORDER BY x.created_at DESC LIMIT 1) v ON true`;
const ACTION_ENC = ['title', 'detail'];
// field API -> kolom
const ACTION_FIELDS = Object.freeze({
  title: 'title', detail: 'detail', category: 'category', subLabel: 'sub_label', ownerUserId: 'owner_user_id',
  sourceRef: 'source_ref', competencyId: 'competency_id', performanceRecordId: 'performance_record_id',
  dueDate: 'due_date', status: 'status', involvesIndividual: 'involves_individual',
});

const VERIF_COLS = `v.id, v.action_id AS "actionId", a.title AS "actionTitle", to_char(a.due_date, 'YYYY-MM-DD') AS "actionDueDate",
  a.status AS "actionStatus", a.category AS "actionCategory", v.owner_user_id AS "ownerUserId", o.name AS "ownerName", v.status,
  to_char(v.due_date, 'YYYY-MM-DD') AS "dueDate", v.consent_at AS "consentAt", v.consent_version AS "consentVersion",
  v.started_at AS "startedAt", v.ended_at AS "endedAt", v.reported_status AS "reportedStatus", v.summary,
  v.ai_provider AS "aiProvider", v.created_at AS "assignedAt"`;
const VERIF_FROM = `FROM ina_verifications v
  JOIN ina_actions a ON a.id = v.action_id AND a.tenant_id = v.tenant_id
  LEFT JOIN users o ON o.id = v.owner_user_id AND o.tenant_id = v.tenant_id`;
const VERIF_ENC = ['actionTitle', 'summary'];

function createInaStores(sequelize, { cipher } = {}) {
  if (!cipher) throw new Error('createInaStores butuh cipher (R2-3)');
  const enc = (tenantId, v) => (v === null || v === undefined ? null : cipher.encrypt(tenantId, v));
  const open = (tenantId, rows, fields) => cipher.open(tenantId, rows, fields);
  const select = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  const one = async (sql, replacements) => (await select(sql, replacements))[0] || null;
  const write = async (sql, replacements) => (await sequelize.query(sql, { replacements }))[0];

  const ina = {
    /**
     * scope: { all: true } | { userIds } terhadap pemilik tindakan. hidden: false = hanya yang bukan temuan
     * individu (bawaan); true = hanya yang bertanda individu (khusus HR).
     */
    async listActions(tenantId, { scope, hidden = false } = {}) {
      const rep = { tenantId, hidden };
      let sql = `SELECT ${ACTION_COLS} ${ACTION_FROM} WHERE a.tenant_id = :tenantId AND a.involves_individual = :hidden`;
      if (scope && !scope.all) {
        rep.scopeIds = scope.userIds && scope.userIds.length ? scope.userIds : [NO_ID];
        sql += ' AND a.owner_user_id IN (:scopeIds)';
      }
      return open(tenantId, await select(`${sql} ORDER BY a.due_date NULLS LAST, a.created_at DESC LIMIT 2000`, rep), ACTION_ENC);
    },
    async countHidden(tenantId) {
      return (await one('SELECT count(*)::int AS n FROM ina_actions WHERE tenant_id = :tenantId AND involves_individual', { tenantId })).n;
    },
    async getAction(tenantId, id) {
      return open(tenantId, await one(`SELECT ${ACTION_COLS} ${ACTION_FROM} WHERE a.tenant_id = :tenantId AND a.id = :id`, { tenantId, id }), ACTION_ENC);
    },
    async actionIdByFinding(tenantId, findingId) {
      const row = await one('SELECT id FROM ina_actions WHERE tenant_id = :tenantId AND finding_id = :findingId', { tenantId, findingId });
      return row ? row.id : null;
    },
    /** Return tindakan baru, atau null bila temuan itu sudah punya tindakan (balapan dua request). */
    async createAction(tenantId, a, createdBy) {
      try {
        const rows = await write(
          `INSERT INTO ina_actions (tenant_id, finding_id, title, detail, category, sub_label, owner_user_id, source_ref, competency_id,
                                    performance_record_id, due_date, involves_individual, created_by)
           VALUES (:tenantId, :findingId, :title, :detail, :category, :subLabel, :ownerUserId, :sourceRef, :competencyId,
                   :performanceRecordId, :dueDate, :involvesIndividual, :createdBy) RETURNING id`,
          {
            tenantId, createdBy, findingId: a.findingId ?? null, title: await enc(tenantId, a.title), detail: await enc(tenantId, a.detail),
            category: a.category, subLabel: a.subLabel ?? null, ownerUserId: a.ownerUserId ?? null, sourceRef: a.sourceRef ?? null,
            competencyId: a.competencyId ?? null, performanceRecordId: a.performanceRecordId ?? null, dueDate: a.dueDate ?? null,
            involvesIndividual: a.involvesIndividual === true,
          },
        );
        return ina.getAction(tenantId, rows[0].id);
      } catch (e) { if (isUnique(e)) return null; throw e; }
    },
    async updateAction(tenantId, id, patch) {
      const sets = []; const rep = { tenantId, id };
      for (const [k, col] of Object.entries(ACTION_FIELDS)) {
        if (patch[k] === undefined) continue;
        sets.push(`${col} = :${k}`);
        rep[k] = ACTION_ENC.includes(k) ? await enc(tenantId, patch[k]) : patch[k];
      }
      if (patch.status !== undefined) sets.push(`completed_at = ${patch.status === 'done' ? 'now()' : 'NULL'}`);
      if (sets.length) await write(`UPDATE ina_actions SET ${sets.join(', ')}, updated_at = now() WHERE tenant_id = :tenantId AND id = :id`, rep);
      return ina.getAction(tenantId, id);
    },

    // ----- rujukan dalam tenant -----
    /** Temuan untuk dijadikan tindakan: harus milik tenant ini. */
    async finding(tenantId, id) {
      return one(`SELECT f.id, f.category, f.user_id AS "userId", f.competency_id AS "competencyId",
                         f.performance_record_id AS "performanceRecordId", f.review_status AS "reviewStatus", f.status
                    FROM lna_findings f WHERE f.tenant_id = :tenantId AND f.id = :id`, { tenantId, id });
    },
    async setFindingStatus(tenantId, id, status) {
      await write('UPDATE lna_findings SET status = :status WHERE tenant_id = :tenantId AND id = :id', { tenantId, id, status });
    },
    async competencyName(tenantId, id) {
      const row = await one('SELECT name FROM lna_competencies WHERE tenant_id = :tenantId AND id = :id', { tenantId, id });
      return row ? row.name : null;
    },
    async metricName(tenantId, id) {
      const row = await one('SELECT name FROM lna_performance_records WHERE tenant_id = :tenantId AND id = :id', { tenantId, id });
      return row ? row.name : null;
    },
    async activeUser(tenantId, id) {
      return one(`SELECT id, name, role FROM users WHERE tenant_id = :tenantId AND id = :id AND status <> 'disabled'`, { tenantId, id });
    },

    // ----- verifikasi AI -----
    /** Return verifikasi baru, atau null bila tindakan itu masih punya verifikasi terbuka. */
    async createVerification(tenantId, { actionId, ownerUserId, dueDate, assignedBy }) {
      try {
        const rows = await write(
          `INSERT INTO ina_verifications (tenant_id, action_id, owner_user_id, due_date, assigned_by)
           VALUES (:tenantId, :actionId, :ownerUserId, :dueDate, :assignedBy) RETURNING id`,
          { tenantId, actionId, ownerUserId, dueDate: dueDate ?? null, assignedBy });
        return ina.getVerification(tenantId, rows[0].id);
      } catch (e) { if (isUnique(e)) return null; throw e; }
    },
    async getVerification(tenantId, id) {
      return open(tenantId, await one(`SELECT ${VERIF_COLS} ${VERIF_FROM} WHERE v.tenant_id = :tenantId AND v.id = :id`, { tenantId, id }), VERIF_ENC);
    },
    async listVerifications(tenantId, { ownerUserId } = {}) {
      const rep = { tenantId };
      let sql = `SELECT ${VERIF_COLS} ${VERIF_FROM} WHERE v.tenant_id = :tenantId`;
      if (ownerUserId) { sql += ' AND v.owner_user_id = :ownerUserId'; rep.ownerUserId = ownerUserId; }
      return open(tenantId, await select(`${sql} ORDER BY v.created_at DESC LIMIT 500`, rep), VERIF_ENC);
    },
    async countPending(tenantId, ownerUserId) {
      return (await one(`SELECT count(*)::int AS n FROM ina_verifications
                          WHERE tenant_id = :tenantId AND owner_user_id = :ownerUserId AND status IN ('assigned','in_progress')`, { tenantId, ownerUserId })).n;
    },
    /** Pindah status hanya dari salah satu status `from`. Return true bila ada baris yang berubah. */
    async moveVerification(tenantId, id, from, to, extra = {}) {
      const sets = ['status = :to']; const rep = { tenantId, id, from, to };
      if (extra.consentVersion !== undefined) { sets.push('consent_at = now()', 'consent_version = :consentVersion', 'started_at = now()'); rep.consentVersion = extra.consentVersion; }
      if (extra.summary !== undefined) { sets.push('summary = :summary', 'reported_status = :reportedStatus', 'ai_provider = :aiProvider'); rep.summary = await enc(tenantId, extra.summary); rep.reportedStatus = extra.reportedStatus; rep.aiProvider = extra.aiProvider; }
      if (['completed', 'cancelled', 'withdrawn'].includes(to)) sets.push('ended_at = now()');
      const rows = await write(`UPDATE ina_verifications SET ${sets.join(', ')} WHERE tenant_id = :tenantId AND id = :id AND status IN (:from) RETURNING id`, rep);
      return rows.length > 0;
    },
    /** Batalkan verifikasi terbuka sebuah tindakan (pemilik diganti, tindakan ditutup atau disembunyikan). Return id-nya. */
    async cancelOpenVerifications(tenantId, actionId) {
      const rows = await write(`UPDATE ina_verifications SET status = 'cancelled', ended_at = now()
                                 WHERE tenant_id = :tenantId AND action_id = :actionId AND status IN ('assigned','in_progress') RETURNING id`, { tenantId, actionId });
      return rows.map((r) => r.id);
    },
    async addTurn(tenantId, verificationId, speaker, text) {
      await write(`INSERT INTO ina_verification_turns (verification_id, speaker, text)
                   SELECT v.id, :speaker, :text FROM ina_verifications v WHERE v.tenant_id = :tenantId AND v.id = :verificationId`,
      { tenantId, verificationId, speaker, text: await enc(tenantId, text) });
    },
    async turns(tenantId, verificationId) {
      return open(tenantId, await select(
        `SELECT t.speaker, t.text, t.at FROM ina_verification_turns t
           JOIN ina_verifications v ON v.id = t.verification_id AND v.tenant_id = :tenantId
          WHERE t.verification_id = :verificationId ORDER BY t.id`, { tenantId, verificationId }), ['text']);
    },
    async deleteTurns(tenantId, verificationId) {
      await write(`DELETE FROM ina_verification_turns t USING ina_verifications v
                    WHERE v.id = t.verification_id AND v.tenant_id = :tenantId AND t.verification_id = :verificationId`, { tenantId, verificationId });
    },
  };

  return { ina };
}

module.exports = { createInaStores };
