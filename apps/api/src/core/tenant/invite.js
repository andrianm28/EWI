'use strict';
// B12: undangan akun pengelola tenant (7 hari, sekali pakai), dipakai skrip onboarding dan konsol Super Admin.
// Link disimpan lebih dulu (satu audit `create invitation`), email dikirim sesudahnya. Gagal kirim tidak
// membatalkan apa pun: link tetap tersimpan dan kedaluwarsa sendiri; pemanggil menerima failed > 0.

/**
 * query(sql, params) -> { rows } dengan parameter $n. links = layanan email-link (prepare).
 * actor = { userId, label, via } untuk baris audit. Return { sent, failed, userIds }.
 */
async function inviteAdmins({ query, links, tenantId, tenantName, emails, actor }) {
  const { rows } = await query(
    `SELECT id, tenant_id AS "tenantId", email, name FROM users
      WHERE tenant_id = $1 AND email = ANY($2) AND status <> 'disabled' AND last_login_at IS NULL ORDER BY email`,
    [tenantId, emails]);
  if (!rows.length) return { sent: 0, failed: 0, userIds: [] };
  const pending = [];
  for (const u of rows) pending.push(await links.prepare(u, 'invite', { createdBy: actor.userId, tenantName }));
  await query(`INSERT INTO audit_logs (tenant_id, action, resource, meta) VALUES ($1, 'create', 'invitation', $2::jsonb)`,
    [tenantId, JSON.stringify({ ...(actor.label ? { actor: actor.label, actorUserId: actor.userId } : {}),
      via: actor.via, count: rows.length, userIds: rows.map((u) => u.id) })]);
  let sent = 0; let failed = 0;
  for (const p of pending) {
    try { await p.send(); sent += 1; } catch { failed += 1; }
  }
  return { sent, failed, userIds: rows.map((u) => u.id) };
}

module.exports = { inviteAdmins };
