'use strict';
// B1: verifikasi dua langkah dengan kode autentikator. Spek: docs/designs/b1-login.md.
// - Flag auth.mfa hanya mengatur PENDAFTARAN. Akun yang sudah aktif selalu ditantang saat masuk,
//   supaya mematikan flag/kill switch tidak diam-diam menghapus faktor kedua.
// - Tantangan (challenge): token acak sekali pakai, 5 menit, maksimum 5 percobaan; hanya hash yang disimpan.
const crypto = require('crypto');
const express = require('express');
const totp = require('./totp');
const { HttpError, badRequest, forbidden, notFound, unauthorized } = require('../errors');
const { FLAGS } = require('../flags');
const { limitByIp } = require('./rate-limit');

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const mfaError = (code, msg) => { const e = unauthorized(msg); e.code = code; return e; };
const CODE_INVALID = () => mfaError('MFA_CODE_INVALID', 'Kode verifikasi salah');
const CHALLENGE_INVALID = () => mfaError('MFA_CHALLENGE_INVALID', 'Verifikasi kedaluwarsa. Masuk ulang.');

/**
 * store: {
 *   get(userId) -> { userId, tenantId, secretEnc, enabledAt, lastStep } | null,
 *   savePending(tenantId, userId, secretEnc), enable(userId), remove(tenantId, userId) -> bool,
 *   advanceStep(tenantId, userId, step) -> bool          (atomik: hanya bila step > last_step),
 *   createChallenge({ id, tenantId, userId, method, tokenHash, expiresAt }),
 *   attemptChallenge(tokenHash) -> { id, tenantId, userId, method } | null   (atomik: attempts+1 bila masih berlaku),
 *   useChallenge(id) -> bool                   (atomik: sekali pakai)
 * }
 * cipher: { encrypt(tenantId, text), decrypt(tenantId, text) } (kunci per tenant, R2-3).
 */
function createMfaService({ store, cipher, now = () => Date.now() }) {
  const secretOf = async (row) => cipher.decrypt(row.tenantId, row.secretEnc);
  async function checkCode(row, code) {
    const res = totp.verify(await secretOf(row), code, { now: now(), lastStep: row.lastStep });
    if (!res.ok) return false;
    return store.advanceStep(row.tenantId, row.userId, res.step);
  }
  return {
    async status(user) {
      const row = await store.get(user.tenantId, user.id);
      return { enabled: !!(row && row.enabledAt), pending: !!(row && !row.enabledAt) };
    },
    async isEnabled(user) {
      const row = await store.get(user.tenantId, user.id);
      return !!(row && row.enabledAt);
    },
    async startChallenge(user, method) {
      const token = crypto.randomBytes(32).toString('base64url');
      await store.createChallenge({
        id: crypto.randomUUID(), tenantId: user.tenantId, userId: user.id, method,
        tokenHash: sha256(token), expiresAt: new Date(now() + CHALLENGE_TTL_MS),
      });
      return token;
    },
    /** Tahap 1 penukaran: hitung percobaan. Return baris challenge atau melempar MFA_CHALLENGE_INVALID. */
    async attempt(challenge) {
      if (typeof challenge !== 'string' || challenge.length < 20 || challenge.length > 200) throw CHALLENGE_INVALID();
      const row = await store.attemptChallenge(sha256(challenge));
      if (!row) throw CHALLENGE_INVALID();
      return row;
    },
    /** Tahap 2: periksa kode lalu tandai challenge terpakai. true = boleh menerbitkan sesi. */
    async complete(challengeRow, code) {
      const row = await store.get(challengeRow.tenantId, challengeRow.userId);
      if (!row || !row.enabledAt) throw CHALLENGE_INVALID();
      if (!(await checkCode(row, code))) return false;
      if (!(await store.useChallenge(challengeRow.id))) throw CHALLENGE_INVALID();
      return true;
    },
    async setup(user, { tenantName } = {}) {
      const row = await store.get(user.tenantId, user.id);
      if (row && row.enabledAt) throw new HttpError(409, 'MFA_ALREADY_ENABLED', 'Verifikasi dua langkah sudah aktif');
      const secret = totp.generateSecret();
      await store.savePending(user.tenantId, user.id, await cipher.encrypt(user.tenantId, secret));
      return { secret, otpauthUrl: totp.otpauthUrl({ secret, account: user.email, tenantName }) };
    },
    async enable(user, code) {
      const row = await store.get(user.tenantId, user.id);
      if (!row || row.enabledAt) throw new HttpError(409, 'MFA_NOT_PENDING', 'Mulai pendaftaran verifikasi dua langkah dulu');
      if (!(await checkCode(row, code))) throw CODE_INVALID();
      await store.enable(user.tenantId, user.id);
    },
    async disable(user, code) {
      const row = await store.get(user.tenantId, user.id);
      if (!row) throw notFound('Verifikasi dua langkah belum diatur');
      if (row.enabledAt && !(await checkCode(row, code))) throw CODE_INVALID();
      await store.remove(user.tenantId, user.id);
    },
    adminReset: (tenantId, userId) => store.remove(tenantId, userId),
  };
}

/**
 * Selesaikan login setelah faktor pertama lolos: terbitkan sesi, atau minta langkah kedua bila akun memakai MFA.
 * Dipakai login sandi dan link email supaya percabangan dan auditnya sama.
 */
async function finishFirstFactor({ user, method, req, sessions, mfa, audit, attempts, auditMeta = {} }) {
  if (mfa && (await mfa.isEnabled(user))) {
    const challenge = await mfa.startChallenge(user, method);
    await attempts.record(user, { method, outcome: 'mfa_required' });
    return { mfaRequired: true, challenge };
  }
  const { token } = await sessions.issue(user, { method, ip: req.ip, userAgent: req.get('user-agent') });
  await audit.record({ tenantId: user.tenantId, user }, 'login', `auth.${method}`, { mfa: false, ...auditMeta });
  return { token };
}

/** Rute publik langkah kedua: POST /api/auth/mfa/verify. */
function mfaPublicRoutes({ mfa, users, sessions, policy, audit, attempts, limits, publicUser }) {
  const r = express.Router();
  r.post('/verify', limitByIp(limits.mfaIp, 'mfa'), wrap(async (req, res) => {
    const { challenge, code } = req.body || {};
    const row = await mfa.attempt(challenge);
    const who = { id: row.userId, tenantId: row.tenantId };
    const accountKey = `mfa:akun:${row.userId}`;
    limits.mfaAccount.check(accountKey);
    if (!(await mfa.complete(row, code))) {
      limits.mfaAccount.record(accountKey);
      await attempts.record(who, { method: 'mfa', outcome: 'failed' });
      throw CODE_INVALID();
    }
    // Cek ulang sebelum sesi terbit: akun dan tenant masih aktif, kebijakan login masih mengizinkan
    const user = await users.findById(row.tenantId, row.userId);
    if (!user || !policy.allows(user)) throw CHALLENGE_INVALID();
    const { token } = await sessions.issue(user, { method: row.method, mfa: true, ip: req.ip, userAgent: req.get('user-agent') });
    await audit.record({ tenantId: user.tenantId, user }, 'login', `auth.${row.method}`, { mfa: true });
    res.json({ token, user: publicUser(user) });
  }));
  return r;
}

/** Rute bersesi: status, pendaftaran, dan mematikan MFA milik sendiri (di bawah requireAuth). */
function mfaAccountRoutes({ mfa, flags, audit, users, limits, attempts, sessions }) {
  const r = express.Router();
  const ctx = (req) => ({ tenantId: req.user.tenantId, user: req.user });
  const needFlag = async (req) => {
    if (!(await flags.isEnabled(req.user.tenantId, FLAGS.AUTH_MFA))) {
      throw forbidden('FEATURE_DISABLED', 'Verifikasi dua langkah belum diaktifkan untuk organisasi Anda');
    }
  };
  const codeOf = (req) => {
    const code = (req.body || {}).code;
    if (typeof code !== 'string' || !code.trim()) throw badRequest('Kode verifikasi wajib diisi');
    return code.trim();
  };

  // Review egm: kode TOTP pada enable/disable dibatasi per akun seperti /verify, dan kegagalannya dicatat
  async function withCodeLimit(req, method, fn) {
    const key = `mfa:akun:${req.user.id}`;
    if (limits && limits.mfaAccount) limits.mfaAccount.check(key);
    try {
      return await fn();
    } catch (e) {
      if (e && e.code === 'MFA_CODE_INVALID') {
        if (limits && limits.mfaAccount) limits.mfaAccount.record(key);
        if (attempts) await attempts.record(req.user, { method, outcome: 'failed' });
      }
      throw e;
    }
  }

  r.get('/', wrap(async (req, res) => {
    res.json({ data: { available: await flags.isEnabled(req.user.tenantId, FLAGS.AUTH_MFA), ...(await mfa.status(req.user)) } });
  }));
  r.post('/setup', wrap(async (req, res) => {
    await needFlag(req);
    const tenantName = users.tenantName ? await users.tenantName(req.user.tenantId) : null;
    res.json({ data: await mfa.setup(req.user, { tenantName }) });
  }));
  r.post('/enable', wrap(async (req, res) => {
    await needFlag(req);
    const code = codeOf(req);
    await withCodeLimit(req, 'mfa_enable', () => mfa.enable(req.user, code));
    // Akun yang baru mengaktifkan MFA bisa jadi sedang dibobol: sesi lain dicabut, sesi ini tetap
    const revoked = sessions ? await sessions.revokeAllForUser(req.user.tenantId, req.user.id, { revokedBy: req.user.id, reason: 'mfa_enabled', exceptId: req.user.sid }) : 0;
    await audit.record(ctx(req), 'update', 'auth.mfa', { enabled: true, sessionsRevoked: revoked });
    res.json({ data: { enabled: true } });
  }));
  r.delete('/', wrap(async (req, res) => {
    const { enabled } = await mfa.status(req.user);
    const code = enabled ? codeOf(req) : '';
    await withCodeLimit(req, 'mfa_disable', () => mfa.disable(req.user, code));
    await audit.record(ctx(req), 'update', 'auth.mfa', { enabled: false });
    res.json({ data: { enabled: false } });
  }));
  return r;
}

/** Store MFA in-memory (test tanpa database). */
function memoryMfaStore({ now = () => Date.now() } = {}) {
  const rows = new Map();
  const challenges = new Map();
  return {
    rows,
    challenges,
    async get(tenantId, userId) { const r = rows.get(userId); return r && r.tenantId === tenantId ? r : null; },
    async savePending(tenantId, userId, secretEnc) { rows.set(userId, { userId, tenantId, secretEnc, enabledAt: null, lastStep: null }); },
    async enable(tenantId, userId) { const r = rows.get(userId); if (r && r.tenantId === tenantId) r.enabledAt = new Date(now()); },
    async remove(tenantId, userId) {
      const r = rows.get(userId);
      if (!r || r.tenantId !== tenantId) return false;
      rows.delete(userId);
      return true;
    },
    async advanceStep(tenantId, userId, step) {
      const r = rows.get(userId);
      if (!r || r.tenantId !== tenantId || (r.lastStep !== null && r.lastStep >= step)) return false;
      r.lastStep = step;
      return true;
    },
    async createChallenge(c) { challenges.set(c.tokenHash, { ...c, attempts: 0, usedAt: null }); },
    async attemptChallenge(tokenHash) {
      const c = challenges.get(tokenHash);
      if (!c || c.usedAt || c.expiresAt.getTime() <= now() || c.attempts >= MAX_ATTEMPTS) return null;
      c.attempts += 1;
      return { id: c.id, tenantId: c.tenantId, userId: c.userId, method: c.method };
    },
    async useChallenge(id) {
      const c = [...challenges.values()].find((x) => x.id === id);
      if (!c || c.usedAt) return false;
      c.usedAt = new Date(now());
      return true;
    },
  };
}

/** Cipher tanpa enkripsi untuk test tanpa database (store Postgres selalu memakai cipher tenant). */
const plainCipher = { encrypt: async (_t, v) => v, decrypt: async (_t, v) => v };

module.exports = {
  createMfaService, finishFirstFactor, mfaPublicRoutes, mfaAccountRoutes, memoryMfaStore, plainCipher,
  CHALLENGE_TTL_MS, MAX_ATTEMPTS,
};
