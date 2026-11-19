'use strict';
// PK-16: daftar sesi sendiri dan pencabutan sesi user lain oleh HR (tenant sendiri) atau Admin ETA.
const express = require('express');
const { requireRole, ROLES } = require('../rbac');
const { canResetMfa } = require('../rbac/roles');
const { forbidden, notFound } = require('../errors');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function sessionRoutes({ sessions, audit, mfa, users }) {
  const r = express.Router();

  r.get('/mine', wrap(async (req, res) => {
    const rows = await sessions.listActiveForUser(req.tenantId, req.user.id);
    res.json({ data: rows.map((s) => ({ ...s, current: s.id === req.user.sid })) });
  }));

  // Cabut semua sesi seorang user di tenant ini (mis. laptop hilang, karyawan keluar). Tenant dari token, bukan dari body.
  r.post('/users/:userId/revoke', requireRole(ROLES.HR_ADMIN), wrap(async (req, res) => {
    const { userId } = req.params;
    const n = await sessions.revokeAllForUser(req.tenantId, userId, { revokedBy: req.user.id, reason: 'admin_revoke' });
    // Aksi audit 'delete' (daftar aksi audit_logs tetap); alasan di meta
    await audit.record(req, 'delete', 'auth.session', { reason: 'admin_revoke', employeeIds: [userId], count: n });
    res.json({ data: { revoked: n } });
  }));

  // B1: pemulihan saat autentikator hilang. Reset MFA akun lain di tenant ini, lalu cabut semua sesinya.
  r.delete('/users/:userId/mfa', requireRole(ROLES.HR_ADMIN, ROLES.TENANT_ADMIN), wrap(async (req, res) => {
    const { userId } = req.params;
    if (String(userId) === String(req.user.id)) throw forbidden('SELF_MFA_RESET', 'Minta admin lain mereset verifikasi dua langkah Anda');
    // Tenant dari token: akun tenant lain diperlakukan seperti tidak ada
    const target = await users.findById(req.tenantId, userId);
    if (!target) throw notFound('Pengguna tidak ditemukan');
    // Review egm: faktor kedua akun yang lebih tinggi tidak boleh dihapus oleh akun di bawahnya
    if (!canResetMfa(req.user.role, [target.role, ...(target.roles || [])])) throw forbidden('ROLE_PROTECTED', 'Verifikasi dua langkah akun admin hanya bisa direset oleh admin yang setingkat');
    const removed = await mfa.adminReset(req.tenantId, userId);
    const n = await sessions.revokeAllForUser(req.tenantId, userId, { revokedBy: req.user.id, reason: 'mfa_reset' });
    await audit.record(req, 'delete', 'auth.mfa', { reason: 'admin_reset', employeeIds: [userId], removed, sessionsRevoked: n });
    res.json({ data: { reset: removed, sessionsRevoked: n } });
  }));

  return r;
}

module.exports = { sessionRoutes };
