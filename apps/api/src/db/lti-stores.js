'use strict';
// EM-LTI: store Postgres untuk ELGOS sebagai LTI 1.3 Platform (spek docs/designs/em-lti-platform.md §4).
// Setiap query data bisnis memfilter tenant_id. Rute LTI publik mendapat tenant dari tiket/token di server (ADR 0003).
const { QueryTypes } = require('sequelize');
const { planFrozen } = require('./frozen-sql');

const TOOL_COLS = `id, tenant_id AS "tenantId", name, client_id AS "clientId", deployment_id AS "deploymentId", login_url AS "loginUrl",
  launch_url AS "launchUrl", redirect_uris AS "redirectUris", jwks_url AS "jwksUrl", status`;
const LINK_COLS = `l.id, l.tenant_id AS "tenantId", l.tool_id AS "toolId", l.kind, l.plan_item_id AS "planItemId", l.training_id AS "trainingId",
  l.user_id AS "userId", l.course_ref AS "courseRef", l.title`;
const OPEN_TRAINING = `t.status NOT IN ('cancelled', 'done')`;

function createLtiStores(sequelize) {
  const select = (sql, replacements = {}, transaction) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
  const one = async (sql, replacements, transaction) => (await select(sql, replacements, transaction))[0] || null;
  const write = async (sql, replacements, transaction) => (await sequelize.query(sql, { replacements, transaction }))[0];

  const lti = {
    async activeToolForTenant(tenantId) {
      return one(`SELECT ${TOOL_COLS} FROM lti_tools WHERE tenant_id = :tenantId AND status = 'active' ORDER BY created_at LIMIT 1`, { tenantId });
    },
    async toolByClientId(clientId) {
      return one(`SELECT ${TOOL_COLS} FROM lti_tools WHERE client_id = :clientId`, { clientId });
    },
    async toolById(id) {
      return one(`SELECT ${TOOL_COLS} FROM lti_tools WHERE id = :id`, { id });
    },
    async getLink(tenantId, id) {
      return one(`SELECT ${LINK_COLS} FROM lti_resource_links l WHERE l.tenant_id = :tenantId AND l.id = :id`, { tenantId, id });
    },
    /** Resource link untuk rencana belajar (penugasan HR mode LTI). Idempoten per rencana. */
    async ensurePlanItemLink(tenantId, { toolId, planItemId, userId, courseRef, title, createdBy }) {
      await write(`INSERT INTO lti_resource_links (tenant_id, tool_id, kind, plan_item_id, user_id, course_ref, title, created_by)
                   SELECT :tenantId, :toolId, 'plan_item', p.id, p.user_id, :courseRef, :title, :createdBy
                     FROM lna_training_plan_items p WHERE p.tenant_id = :tenantId AND p.id = :planItemId AND p.user_id = :userId
                   ON CONFLICT (tenant_id, plan_item_id) WHERE plan_item_id IS NOT NULL DO NOTHING`,
      { tenantId, toolId, planItemId, userId, courseRef: String(courseRef).slice(0, 128), title: String(title || courseRef).slice(0, 255), createdBy });
      return one(`SELECT ${LINK_COLS} FROM lti_resource_links l WHERE l.tenant_id = :tenantId AND l.plan_item_id = :planItemId`, { tenantId, planItemId });
    },
    /** Resource link untuk pelatihan offline dengan asesmen EliteMentor. course_ref = assessment_ref (dicocokkan B14). */
    async ensureTrainingLink(tenantId, { trainingId, createdBy = null }) {
      await write(`INSERT INTO lti_resource_links (tenant_id, tool_id, kind, training_id, course_ref, title, created_by)
                   SELECT t.tenant_id, tool.id, 'offline_training', t.id, t.assessment_ref, t.title, :createdBy
                     FROM ld_trainings t
                     JOIN LATERAL (SELECT id FROM lti_tools WHERE tenant_id = t.tenant_id AND status = 'active' ORDER BY created_at LIMIT 1) tool ON true
                    WHERE t.tenant_id = :tenantId AND t.id = :trainingId AND t.mode = 'offline' AND t.assessment_mode = 'elitementor'
                      AND t.assessment_ref IS NOT NULL
                   ON CONFLICT (tenant_id, training_id) WHERE training_id IS NOT NULL DO NOTHING`, { tenantId, trainingId, createdBy });
      return one(`SELECT ${LINK_COLS} FROM lti_resource_links l WHERE l.tenant_id = :tenantId AND l.training_id = :trainingId`, { tenantId, trainingId });
    },
    /** Apakah karyawan berhak atas link: pemilik rencana (online) atau peserta pelatihan offline yang masih berjalan. */
    async userMayUse(tenantId, link, userId) {
      if (link.kind === 'plan_item') {
        if (link.userId !== userId) return false;
        // rencana yang temuannya dibekukan (persetujuan ditarik) atau ditolak tidak diluncurkan dan tidak menerima skor
        const plan = await one(`SELECT 1 AS ok FROM lna_training_plan_items p WHERE p.tenant_id = :tenantId AND p.id = :id
                                   AND p.status NOT IN ('rejected', 'requested') AND NOT ${planFrozen('p')}`, { tenantId, id: link.planItemId });
        return Boolean(plan);
      }
      const row = await one(`SELECT 1 AS ok FROM ld_participants lp JOIN ld_trainings t ON t.id = lp.training_id AND t.tenant_id = lp.tenant_id
                              WHERE lp.tenant_id = :tenantId AND lp.training_id = :trainingId AND lp.user_id = :userId AND ${OPEN_TRAINING}`,
      { tenantId, trainingId: link.trainingId, userId });
      return Boolean(row);
    },
    /** Link rencana belajar milik karyawan (map planItemId -> link) dan kartu pelatihan offline yang ia ikuti. */
    async linksForUser(tenantId, userId) {
      const plans = await select(`SELECT ${LINK_COLS} FROM lti_resource_links l WHERE l.tenant_id = :tenantId AND l.kind = 'plan_item' AND l.user_id = :userId`,
        { tenantId, userId });
      const offline = await select(`SELECT ${LINK_COLS}, t.program_tier AS "programTier", t.vendor_name AS "vendorName", t.venue,
                                           to_char(t.starts_on, 'YYYY-MM-DD') AS "startsOn"
                                      FROM lti_resource_links l
                                      JOIN ld_trainings t ON t.id = l.training_id AND t.tenant_id = l.tenant_id
                                      JOIN ld_participants lp ON lp.training_id = t.id AND lp.tenant_id = t.tenant_id AND lp.user_id = :userId
                                     WHERE l.tenant_id = :tenantId AND l.kind = 'offline_training' AND t.assessment_mode = 'elitementor' AND ${OPEN_TRAINING}
                                     ORDER BY t.starts_on NULLS LAST, t.title`, { tenantId, userId });
      return { byPlanItem: new Map(plans.map((l) => [l.planItemId, l])), offline };
    },
    /** sub LTI karyawan; dibuat sekali (acak) lalu tetap. */
    async subFor(tenantId, userId, makeSub) {
      await write(`INSERT INTO lti_user_subs (tenant_id, user_id, sub) VALUES (:tenantId, :userId, :sub) ON CONFLICT (tenant_id, user_id) DO NOTHING`,
        { tenantId, userId, sub: makeSub() });
      return (await one('SELECT sub FROM lti_user_subs WHERE tenant_id = :tenantId AND user_id = :userId', { tenantId, userId })).sub;
    },
    async userBySub(tenantId, sub) {
      return one(`SELECT u.id, u.name, u.email FROM lti_user_subs s JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
                   WHERE s.tenant_id = :tenantId AND s.sub = :sub AND u.status <> 'disabled'`, { tenantId, sub });
    },
    async launchUser(tenantId, userId) {
      return one(`SELECT id, name, email FROM users WHERE tenant_id = :tenantId AND id = :userId AND status <> 'disabled'`, { tenantId, userId });
    },
    async createTicket({ tenantId, userId, linkId, toolId, ticketHash, binderHash, expiresAt }) {
      await write("DELETE FROM lti_launch_tickets WHERE expires_at < now() - interval '1 day'");
      await write(`INSERT INTO lti_launch_tickets (tenant_id, user_id, link_id, tool_id, ticket_hash, binder_hash, expires_at)
                   VALUES (:tenantId, :userId, :linkId, :toolId, :ticketHash, :binderHash, :expiresAt)`,
      { tenantId, userId, linkId, toolId, ticketHash, binderHash, expiresAt });
    },
    /** Tandai tiket terpakai secara atomik. Return baris tiket atau null (tidak ada, sudah dipakai, kedaluwarsa). */
    async consumeTicket(ticketHash) {
      const rows = await write(`UPDATE lti_launch_tickets SET used_at = now()
                                 WHERE ticket_hash = :ticketHash AND used_at IS NULL AND expires_at > now()
                                RETURNING tenant_id AS "tenantId", user_id AS "userId", link_id AS "linkId", tool_id AS "toolId", binder_hash AS "binderHash"`,
      { ticketHash });
      return rows[0] || null;
    },
    /** jti assertion tool sekali pakai. Return true bila baru. */
    async useJti(toolId, jti, expiresAt) {
      await write('DELETE FROM lti_used_jti WHERE expires_at < now()');
      const rows = await write(`INSERT INTO lti_used_jti (tool_id, jti, expires_at) VALUES (:toolId, :jti, :expiresAt)
                                ON CONFLICT DO NOTHING RETURNING jti`, { toolId, jti: String(jti).slice(0, 255), expiresAt });
      return rows.length > 0;
    },
    /** Status rencana belajar dari skor online. Hanya maju (new -> in_progress -> completed), tidak pernah mundur. */
    async advancePlan(tenantId, planItemId, status) {
      const from = status === 'completed' ? ['new', 'in_progress'] : ['new'];
      await write(`UPDATE lna_training_plan_items SET status = :status, updated_at = now()
                    WHERE tenant_id = :tenantId AND id = :planItemId AND status IN (:from)`, { tenantId, planItemId, status, from });
    },
    /** Hasil course untuk kartu Rencana belajar (lna_catalog_completions), bila item katalog EliteMentor ada. */
    async recordCompletion(tenantId, { userId, courseRef, status, score, at }) {
      await write(`INSERT INTO lna_catalog_completions (tenant_id, user_id, catalog_item_id, status, completed_at, score, source)
                   SELECT ci.tenant_id, :userId, ci.id, :status, :at, :score, 'elitementor' FROM lna_catalog_items ci
                    WHERE ci.tenant_id = :tenantId AND ci.source = 'elitementor' AND ci.external_ref = :courseRef
                   ON CONFLICT (tenant_id, user_id, catalog_item_id) DO UPDATE
                     SET status = EXCLUDED.status, score = EXCLUDED.score, completed_at = EXCLUDED.completed_at, source = EXCLUDED.source, updated_at = now()
                   -- hanya hasil yang lebih baru, dan lulus tidak pernah diturunkan menjadi gagal
                   WHERE (lna_catalog_completions.completed_at IS NULL OR lna_catalog_completions.completed_at <= EXCLUDED.completed_at)
                     AND NOT (lna_catalog_completions.status = 'passed' AND EXCLUDED.status <> 'passed')`,
      { tenantId, userId, courseRef, status, score, at });
    },
    /** Check-in offline lewat EliteMentor: peserta hadir. */
    async markAttendance(tenantId, trainingId, userId) {
      const rows = await write(`UPDATE ld_participants SET attendance = true, attendance_at = COALESCE(attendance_at, now()), updated_at = now()
                                 WHERE tenant_id = :tenantId AND training_id = :trainingId AND user_id = :userId RETURNING id`, { tenantId, trainingId, userId });
      return rows.length > 0;
    },
  };
  return { lti };
}

module.exports = { createLtiStores };
