'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { unauthorized, badRequest } = require('../errors');

/**
 * Login email + password per tenant. Undangan dan OTP email menyusul (Sprint N1).
 * `users` adalah repository: { findByEmail(tenantSlug, email) }.
 */
function authRoutes({ users, tokens, requireAuth }) {
  const r = express.Router();

  r.post('/login', async (req, res, next) => {
    try {
      const { tenant, email, password } = req.body || {};
      if (!tenant || !email || !password) throw badRequest('tenant, email, dan password wajib diisi');
      const user = await users.findByEmail(tenant, String(email).toLowerCase());
      if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
        throw unauthorized('Email atau password salah');
      }
      res.json({ token: tokens.sign(user), user: publicUser(user) });
    } catch (e) { next(e); }
  });

  r.get('/me', requireAuth, (req, res) => res.json({ user: req.user, entitlements: req.entitlements || null }));

  return r;
}

const publicUser = (u) => ({ id: u.id, tenantId: u.tenantId, email: u.email, name: u.name, role: u.role });

module.exports = { authRoutes };
