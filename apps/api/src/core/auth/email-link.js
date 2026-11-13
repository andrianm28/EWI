'use strict';
// R3-2 (13 Nov): login karyawan lewat link email saja (tanpa SSO). T4: kanal = email.
// - Token acak 32 byte, sekali pakai; hanya hash SHA-256 yang disimpan.
// - Token ada di fragmen URL (#token=...) agar tidak ikut ke log server/Referer.
// - Web menukar token lewat POST setelah karyawan menekan tombol, supaya pemindai link email tidak memakainya.
const crypto = require('crypto');
const express = require('express');
const { badRequest, unauthorized } = require('../errors');
const { requireRole, ROLES } = require('../rbac');

const TTL = { login: 15 * 60 * 1000, invite: 7 * 24 * 60 * 60 * 1000 };
const RATE = { windowMs: 15 * 60 * 1000, max: 3 };
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function message({ purpose, name, tenantName, url }) {
  const org = tenantName ? ` (${tenantName})` : '';
  if (purpose === 'invite') {
    return {
      subject: `Undangan ELGOS${tenantName ? ` dari ${tenantName}` : ''}`,
      text: `Halo ${name || ''},\n\nAnda diundang memakai ELGOS${org} untuk analisis kebutuhan pengembangan dan training.\n`
        + `Klik link berikut untuk masuk. Link berlaku 7 hari dan hanya bisa dipakai sekali:\n${url}\n\n`
        + 'Setelah itu, masuk kapan saja dengan meminta link masuk baru di halaman login.\n',
    };
  }
  return {
    subject: 'Link masuk ELGOS',
    text: `Halo ${name || ''},\n\nKlik link berikut untuk masuk ke ELGOS${org}. Link berlaku 15 menit dan hanya bisa dipakai sekali:\n${url}\n\n`
      + 'Abaikan email ini bila Anda tidak meminta link masuk.\n',
  };
}

function createEmailLinkService({ stores, mailer, appBaseUrl, now = () => new Date() }) {
  return {
    async issue(user, purpose, { createdBy, tenantName } = {}) {
      const token = crypto.randomBytes(32).toString('base64url');
      await stores.loginLinks.create({
        tenantId: user.tenantId, userId: user.id, tokenHash: hash(token), purpose,
        expiresAt: new Date(now().getTime() + TTL[purpose]), createdBy,
      });
      const url = `${appBaseUrl}/masuk#token=${token}`;
      await mailer.send({ to: user.email, ...message({ purpose, name: user.name, tenantName, url }) });
    },
    async recentCount(user) {
      return stores.loginLinks.countSince(user.tenantId, user.id, new Date(now().getTime() - RATE.windowMs));
    },
    async consume(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
      return stores.loginLinks.consume(hash(token));
    },
  };
}

/** Rute publik: minta link & tukar token. */
function emailLinkRoutes({ users, links, tokens, audit }) {
  const r = express.Router();
  const GENERIC = 'Bila email terdaftar di organisasi ini, link masuk sudah dikirim. Periksa kotak masuk Anda.';

  r.post('/', wrap(async (req, res) => {
    const { tenant, email } = req.body || {};
    if (!tenant || !email) throw badRequest('Organisasi dan email wajib diisi');
    const user = await users.findByEmail(String(tenant).trim(), String(email).trim().toLowerCase());
    // Jawaban sama untuk email terdaftar atau tidak (mencegah enumerasi akun)
    if (user && (await links.recentCount(user)) < RATE.max) {
      await links.issue(user, 'login', { tenantName: users.tenantName ? await users.tenantName(user.tenantId) : null });
    }
    res.status(202).json({ message: GENERIC });
  }));

  r.post('/verify', wrap(async (req, res) => {
    const user = await links.consume((req.body || {}).token);
    if (!user) throw unauthorized('Link masuk tidak valid, sudah dipakai, atau kedaluwarsa. Minta link baru.');
    await audit.record({ tenantId: user.tenantId, user }, 'login', 'auth.email_link', { purpose: user.purpose });
    const pub = { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, role: user.role };
    res.json({ token: tokens.sign(user), user: pub });
  }));

  return r;
}

/** Rute HR (terautentikasi): kirim undangan ke karyawan. */
function invitationRoutes({ users, links, audit }) {
  const r = express.Router();
  r.post('/', requireRole(ROLES.HR_ADMIN), wrap(async (req, res) => {
    const { userIds } = req.body || {};
    if (userIds !== undefined && (!Array.isArray(userIds) || userIds.length > 5000)) throw badRequest('userIds harus berupa daftar');
    const invitees = await users.listInvitees(req.tenantId, userIds ? { userIds } : { pendingOnly: true });
    const tenantName = users.tenantName ? await users.tenantName(req.tenantId) : null;
    for (const u of invitees) await links.issue(u, 'invite', { createdBy: req.user.id, tenantName });
    await audit.record(req, 'create', 'invitation', { count: invitees.length, employeeIds: invitees.map((u) => u.id) });
    res.status(201).json({ data: { sent: invitees.length } });
  }));
  return r;
}

module.exports = { createEmailLinkService, emailLinkRoutes, invitationRoutes, TTL, RATE };
