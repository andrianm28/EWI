'use strict';
// PK-16: daftar sesi sendiri dan pencabutan sesi user lain oleh HR (tenant sendiri) atau Admin ETA.
const express = require('express');
const { requireRole, ROLES } = require('../rbac');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function sessionRoutes({ sessions, audit }) {
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


  return r;
}

module.exports = { sessionRoutes };
