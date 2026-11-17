'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { unauthorized, badRequest, notFound } = require('../errors');

/**
 * Login email + password per tenant. Undangan dan OTP email menyusul (Sprint N1).
 * `users` adalah repository: { findByEmail(tenantSlug, email) }.
 */
function authRoutes({ users, tokens, requireAuth, audit, tenantPicker = false }) {
  const r = express.Router();

  // Pilihan organisasi di halaman login (LOGIN_TENANT_PICKER, dev/staging saja). Mati -> 404, web memakai input teks.
  r.get('/tenants', async (_req, res, next) => {
    try {
      if (!tenantPicker || !users.listActiveTenants) throw notFound();
      res.json({ data: await users.listActiveTenants() });
    } catch (e) { next(e); }
  });

  r.post('/login', async (req, res, next) => {
    try {
      const { tenant, email, password } = req.body || {};
      if (!tenant || !email || !password) throw badRequest('tenant, email, dan password wajib diisi');
      const user = await users.findByEmail(tenant, String(email).toLowerCase());
      if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
        throw unauthorized('Email atau password salah');
      }
      // PK-15: login berhasil dicatat (login lewat link email dicatat di email-link.js)
      if (audit) await audit.record({ tenantId: user.tenantId, user }, 'login', 'auth.password', {});
      res.json({ token: tokens.sign(user), user: publicUser(user) });
    } catch (e) { next(e); }
  });

  r.get('/me', requireAuth, (req, res) => res.json({ user: req.user, entitlements: req.entitlements || null }));

  return r;
}

const publicUser = (u) => ({ id: u.id, tenantId: u.tenantId, email: u.email, name: u.name, role: u.role });

module.exports = { authRoutes };
