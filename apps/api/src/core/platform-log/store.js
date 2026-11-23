'use strict';
// B12: store Postgres log audit platform (append-only) dan hitungan percobaan masuk tanpa tenant.
const { QueryTypes } = require('sequelize');

const COLUMNS = '(actor_user_id, actor_tenant_id, action, resource, target_tenant_id, meta)';
const values = (e) => [e.actor.userId || null, e.actor.tenantId || null, e.action, e.resource, e.targetTenantId || null, JSON.stringify(e.meta || {})];

/** SQL berparameter $n untuk ditulis di transaksi pg.Client milik onboarding (kait beforeCommit). */
function insertSql(entry) {
  return { text: `INSERT INTO platform_audit_logs ${COLUMNS} VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, values: values(entry) };
}

function createPlatformLogStore(db) {
  return {
    async insert(entry, { transaction } = {}) {
      const { text, values: bind } = insertSql(entry);
      await db.query(text, { bind, type: QueryTypes.INSERT, transaction });
    },
    async recent(limit) {
      return db.query(
        `SELECT l.id::text AS id, l.at, u.email AS "actorEmail", l.action, l.resource, t.name AS "targetTenantName", l.meta
           FROM platform_audit_logs l
           LEFT JOIN users u ON u.id = l.actor_user_id
           LEFT JOIN tenants t ON t.id = l.target_tenant_id
          ORDER BY l.at DESC, l.id DESC LIMIT :limit`, { replacements: { limit }, type: QueryTypes.SELECT });
    },
    async countAttempt(outcome) {
      await db.query(
        `INSERT INTO platform_attempt_counters (hour, outcome, count) VALUES (date_trunc('hour', now()), :outcome, 1)
         ON CONFLICT (hour, outcome) DO UPDATE SET count = platform_attempt_counters.count + 1`,
        { replacements: { outcome }, type: QueryTypes.INSERT });
    },
    async attemptsByDay(days) {
      return db.query(
        `SELECT to_char((hour AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS day, outcome, sum(count)::int AS count
           FROM platform_attempt_counters
          WHERE hour >= now() - make_interval(days => :days)
          GROUP BY 1, 2 ORDER BY 1 DESC, 2`, { replacements: { days }, type: QueryTypes.SELECT });
    },
  };
}

module.exports = { createPlatformLogStore, insertSql };
