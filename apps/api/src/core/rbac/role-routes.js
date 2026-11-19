'use strict';
// B2: peran per akun (kontrak untuk layar "Pengguna & peran" milik B11). Inti platform, bukan submodul:
// dipasang di balik peran, tidak lewat requireSubmodule. Spek: docs/designs/b2-peran.md.
const express = require('express');
const { requireRole } = require('./index');
const { ROLES, ASSIGNABLE_ROLES, describeRoles, switchableRoles } = require('./roles');
const { HttpError, badRequest, forbidden, notFound } = require('../errors');
const { FLAGS } = require('../flags');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const shape = (r) => ({ primary: r.primary, roles: r.roles, views: describeRoles(switchableRoles(r.roles)) });

/** userRoles: { get(tenantId, userId), replace(tenantId, userId, { roles, primary, grantedBy }) } */
function roleRoutes({ userRoles, audit, flags }) {
  const r = express.Router();
  // Aturan 3 CLAUDE.md: fitur baru di balik flag (default mati). Peran tambahan ikut flag auth.multi_role.
  r.use(wrap(async (req, res, next) => {
    if (!flags || !(await flags.isEnabled(req.tenantId, FLAGS.AUTH_MULTI_ROLE))) {
      throw forbidden('FEATURE_DISABLED', 'Pengaturan peran belum diaktifkan untuk organisasi Anda');
    }
    next();
  }));

  r.get('/:id/roles', requireRole(ROLES.HR_ADMIN, ROLES.TENANT_ADMIN), wrap(async (req, res) => {
    const row = await userRoles.get(req.tenantId, req.params.id);
    if (!row) throw notFound('Pengguna tidak ditemukan');
    res.json({ data: shape(row) });
  }));

  r.put('/:id/roles', requireRole(ROLES.TENANT_ADMIN), wrap(async (req, res) => {
    const { roles, primary } = req.body || {};
    if (!Array.isArray(roles) || roles.length < 1 || roles.length > 4 || new Set(roles).size !== roles.length) {
      throw badRequest('roles harus berisi 1 sampai 4 peran yang berbeda');
    }
    if (roles.includes(ROLES.ETA_ADMIN)) throw badRequest('Peran Super Admin tidak bisa diberikan dari sini');
    if (roles.some((x) => !ASSIGNABLE_ROLES.includes(x))) throw badRequest('Ada peran yang tidak dikenal');
    if (!roles.includes(primary)) throw badRequest('primary harus salah satu dari roles');
    // Orang kedua wajib: admin tidak bisa memberi dirinya sendiri akses data HR
    if (String(req.params.id) === String(req.user.id)) throw forbidden('SELF_ROLE_CHANGE', 'Peran Anda sendiri harus diubah oleh admin lain');

    const out = await userRoles.replace(req.tenantId, req.params.id, { roles, primary, grantedBy: req.user.id });
    if (out.status === 'not_found') throw notFound('Pengguna tidak ditemukan');
    if (out.status === 'protected') throw forbidden('ROLE_PROTECTED', 'Akun Super Admin tidak bisa diubah dari sini');
    if (out.status === 'last_admin') throw new HttpError(409, 'LAST_TENANT_ADMIN', 'Organisasi harus punya minimal satu Admin Tenant');
    await audit.record(req, 'update', 'user.roles', {
      employeeIds: [req.params.id],
      from: { primary: out.from.primary, roles: out.from.roles }, to: { primary: out.to.primary, roles: out.to.roles },
    });
    res.json({ data: shape(out.to) });
  }));

  return r;
}

module.exports = { roleRoutes };
