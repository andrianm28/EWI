'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { unauthorized, badRequest, notFound, forbidden, HttpError } = require('../errors');
const { limitByIp } = require('./rate-limit');
const { finishFirstFactor } = require('./mfa');
const { FLAGS } = require('../flags');
const { viewOf } = require('../rbac/roles');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const publicUser = (u) => ({ id: u.id, tenantId: u.tenantId, email: u.email, name: u.name, role: u.role });
const DUMMY_HASH = bcrypt.hashSync('elgos-dummy-password', 10);

/**
 * Rute auth umum: metode login, login password (dev/staging saja), profil, keluar.
 * `users`: { findByEmail(tenantSlug, email), listActiveTenants? }.
 * PK-16 / PD-10 ★B: `localLogin` false di produksi; login password lalu menjawab 404.
 * `limits`: { passwordIp, passwordAccount } dari createRateLimiter.
 */
function authRoutes({ users, sessions, policy, audit, requireAuth, limits, mfa, attempts, flags, tenantPicker = false, localLogin = false }) {
  const r = express.Router();
  // B1: SSO perusahaan hanya ditawarkan bila organisasi dikenal, aktif, dan flag auth.sso menyala
  const ssoTenant = async (slug) => {
    if (!slug || !flags || !users.findTenantBySlug) return null;
    const tenant = await users.findTenantBySlug(String(slug).trim());
    return tenant && (await flags.isEnabled(tenant.id, FLAGS.AUTH_SSO)) ? tenant : null;
  };

  // Pilihan organisasi di halaman login (LOGIN_TENANT_PICKER, dev/staging saja). Mati -> 404, web memakai input teks.
  r.get('/tenants', wrap(async (_req, res) => {
    if (!tenantPicker || !users.listActiveTenants) throw notFound();
    res.json({ data: await users.listActiveTenants() });
  }));

  // Web menampilkan form password hanya bila API mengizinkan.
  r.get('/methods', wrap(async (req, res) => {
    res.json({ password: localLogin, emailLink: true, sso: !!(await ssoTenant(req.query.tenant)) });
  }));

  // B1: kerangka SSO. IdP belum ada, jadi organisasi yang flag-nya menyala mendapat 501 (tercatat di audit).
  r.post('/sso/start', limitByIp(limits.passwordIp, 'sso'), wrap(async (req) => {
    const tenant = await ssoTenant((req.body || {}).tenant);
    if (!tenant) throw Object.assign(notFound('SSO belum tersedia untuk organisasi ini. Masuk lewat link email.'), { code: 'SSO_UNAVAILABLE' });
    await attempts.record({ tenantId: tenant.id }, { method: 'sso', outcome: 'not_configured' });
    throw new HttpError(501, 'SSO_NOT_CONFIGURED', 'SSO perusahaan belum dihubungkan. Masuk lewat link email.');
  }));

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
        // Hanya akun yang dikenal yang masuk audit tenant (lihat attempts.js)
        if (user) await attempts.record(user, { method: 'password', outcome: 'failed' });
        throw unauthorized('Email atau password salah');
      }
      if (!policy.allows(user)) {
        await attempts.record(user, { method: 'password', outcome: 'blocked', reason: 'policy' });
        throw forbidden('LOGIN_NOT_ALLOWED', 'Akun ini tidak diizinkan masuk');
      }
      limits.passwordAccount.reset(accountKey);
      const done = await finishFirstFactor({ user, method: 'password', req, sessions, mfa, audit, attempts });
      res.json(done.mfaRequired ? done : { token: done.token, user: publicUser(user) });
    }));
  } else {
    r.post('/login', (_req, _res, next) => next(notFound('Login password tidak tersedia. Masuk lewat link email.')));
  }

  r.get('/me', requireAuth, (req, res) => {
    const { id, tenantId, role, email, roles, view, primaryRole } = req.user;
    res.json({ user: { id, tenantId, role, email, roles, view, primaryRole }, entitlements: req.entitlements || null });
  });

  // B2: ganti tampilan (peran aktif) pada sesi yang sama. Token lama langsung tidak berlaku.
  r.post('/switch-role', requireAuth, wrap(async (req, res) => {
    const role = String((req.body || {}).role || '');
    if (!flags || !(await flags.isEnabled(req.user.tenantId, FLAGS.AUTH_MULTI_ROLE))) {
      throw forbidden('FEATURE_DISABLED', 'Ganti tampilan peran belum diaktifkan untuk organisasi Anda');
    }
    const from = req.user.role;
    const { id, tenantId, email } = req.user;
    // Peran yang sedang aktif: tanpa perubahan, token yang sama dikembalikan, tidak dicatat audit
    if (role === from) {
      const current = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
      res.json({ token: current, user: { id, tenantId, email, role, roles: req.user.roles, view: viewOf(role), primaryRole: req.user.primaryRole } });
      return;
    }
    const switched = await sessions.switchRole(req.user, role);
    if (!switched) throw forbidden('ROLE_NOT_ASSIGNED', 'Peran itu tidak diberikan ke akun Anda');
    if (switched.conflict) throw new HttpError(409, 'ROLE_VIEW_CHANGED', 'Tampilan sudah berganti di tab lain. Muat ulang halaman.');
    await audit.record({ tenantId: req.user.tenantId, user: { ...req.user, role } }, 'update', 'auth.role_view', { from, to: role });
    res.json({ token: switched.token, user: { id, tenantId, email, role, roles: switched.roles, view: viewOf(role), primaryRole: req.user.primaryRole } });
  }));

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
