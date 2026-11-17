'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { unauthorized, badRequest, notFound, forbidden } = require('../errors');
const { limitByIp } = require('./rate-limit');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const publicUser = (u) => ({ id: u.id, tenantId: u.tenantId, email: u.email, name: u.name, role: u.role });
const DUMMY_HASH = bcrypt.hashSync('elgos-dummy-password', 10);

/**
 * Rute auth umum: metode login, login password (dev/staging saja), profil, keluar.
 * `users`: { findByEmail(tenantSlug, email), listActiveTenants? }.
 * PK-16 / PD-10 ★B: `localLogin` false di produksi; login password lalu menjawab 404.
 * `limits`: { passwordIp, passwordAccount } dari createRateLimiter.
 */
function authRoutes({ users, sessions, policy, audit, requireAuth, limits, tenantPicker = false, localLogin = false }) {
  const r = express.Router();

  // Pilihan organisasi di halaman login (LOGIN_TENANT_PICKER, dev/staging saja). Mati -> 404, web memakai input teks.
  r.get('/tenants', wrap(async (_req, res) => {
    if (!tenantPicker || !users.listActiveTenants) throw notFound();
    res.json({ data: await users.listActiveTenants() });
  }));

  // Web menampilkan form password hanya bila API mengizinkan.
  r.get('/methods', (_req, res) => res.json({ password: localLogin, emailLink: true }));

  if (localLogin) {
    r.post('/login', limitByIp(limits.passwordIp, 'password'), wrap(async (req, res) => {
      const { tenant, email, password } = req.body || {};
      if (!tenant || !email || !password) throw badRequest('tenant, email, dan password wajib diisi');
      const slug = String(tenant).trim();
      const mail = String(email).trim().toLowerCase();
      // Batas kegagalan per akun: dicek sebelum bcrypt supaya tebakan beruntun tidak diproses
      const accountKey = `password:akun:${slug}:${mail}`;
      limits.passwordAccount.check(accountKey);
      const user = await users.findByEmail(slug, mail);
      // bcrypt tetap dijalankan untuk akun tak dikenal agar waktu respons tidak membocorkan keberadaan akun
      const ok = await bcrypt.compare(String(password), (user && user.passwordHash) || DUMMY_HASH);
      if (!user || !user.passwordHash || !ok) {
        limits.passwordAccount.record(accountKey);
        throw unauthorized('Email atau password salah');
      }
      if (!policy.allows(user)) throw forbidden('LOGIN_NOT_ALLOWED', 'Akun ini tidak diizinkan masuk');
      limits.passwordAccount.reset(accountKey);
      const { token } = await sessions.issue(user, { method: 'password', ip: req.ip, userAgent: req.get('user-agent') });
      await audit.record({ tenantId: user.tenantId, user }, 'login', 'auth.password', {});
      res.json({ token, user: publicUser(user) });
    }));
  } else {
    r.post('/login', (_req, _res, next) => next(notFound('Login password tidak tersedia. Masuk lewat link email.')));
  }

  r.get('/me', requireAuth, (req, res) => {
    const { id, tenantId, role, email } = req.user;
    res.json({ user: { id, tenantId, role, email }, entitlements: req.entitlements || null });
  });

  // Keluar: cabut sesi ini saja
  r.post('/logout', requireAuth, wrap(async (req, res) => {
    await sessions.revoke(req.user.sid, { revokedBy: req.user.id, reason: 'logout' });
    await audit.record({ tenantId: req.user.tenantId, user: req.user }, 'delete', 'auth.session', { reason: 'logout' });
    res.status(204).end();
  }));

  // Keluar dari semua perangkat: cabut semua sesi user ini, termasuk sesi yang sedang dipakai
  r.post('/logout-all', requireAuth, wrap(async (req, res) => {
    const n = await sessions.revokeAllForUser(req.user.tenantId, req.user.id, { revokedBy: req.user.id, reason: 'logout_all' });
    await audit.record({ tenantId: req.user.tenantId, user: req.user }, 'delete', 'auth.session', { reason: 'logout_all', count: n });
    res.json({ data: { revoked: n } });
  }));

  return r;
}

module.exports = { authRoutes, publicUser };
