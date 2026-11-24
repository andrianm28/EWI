'use strict';
// EM-LTI: ELGOS sebagai LTI 1.3 Platform untuk EliteMentor (ADR 0003). Spek: docs/designs/em-lti-platform.md.
// - createLtiService: peluncuran (tiket + cookie pengikat), dipakai rute /api/my/elitementor/launch.
// - ltiPublicRouter: JWKS, authorize (OIDC), token (client_credentials + JWT assertion), AGS scores. Tanpa sesi Bearer:
//   tenant hanya dari tiket atau token AGS di server (pengecualian aturan 2, ADR 0003).
// - ltiAssignmentAdapter: "Tugaskan di EliteMentor" mode LTI = membuat resource link.
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { FLAGS } = require('../../core/flags');
const { submoduleActive } = require('../../core/entitlement/guard');
const { HttpError, badRequest, forbidden, notFound } = require('../../core/errors');
const {
  AGS_SCOPES, newSub, contextKeyOf, resolveUrl, loginUrl, validateAuthRequest, buildIdToken, parseScope, toSyncEvent,
} = require('./domain');

const TICKET_TTL_MS = 5 * 60 * 1000;
const AGS_AUDIENCE = 'elgos-lti-ags';
const AGS_TOKEN_TTL = 3600;
const COOKIE = 'elgos_lti';
const COOKIE_PATH = '/api/lti/authorize';
const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = (v) => crypto.createHash('sha256').update(String(v), 'utf8').digest('hex');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const notConfigured = () => new HttpError(503, 'LTI_NOT_CONFIGURED', 'Integrasi EliteMentor (LTI) belum dikonfigurasi di server ini');
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cookieValue(req, name) {
  for (const part of String(req.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function createLtiService({ stores, flags, key, config, secret }) {
  const base = config.appBaseUrl;
  const issuer = config.lti.issuer;
  const enabled = (tenantId) => flags.isEnabled(tenantId, FLAGS.ELITEMENTOR_LTI);

  return {
    enabled,
    /** Tenant ini bisa memakai EliteMentor lewat LTI: flag menyala, kunci ada, tool aktif. */
    async available(tenantId) {
      if (!key || !(await enabled(tenantId))) return null;
      return stores.lti.activeToolForTenant(tenantId);
    },
    /** Mulai peluncuran untuk karyawan req.user. Return { url, cookie } (cookie dipasang router). */
    async startLaunch({ tenantId, userId, linkId }) {
      if (!key) throw notConfigured();
      if (!(await enabled(tenantId))) throw forbidden('FEATURE_DISABLED', 'EliteMentor lewat LTI belum diaktifkan untuk organisasi Anda');
      if (typeof linkId !== 'string' || !UUID.test(linkId)) throw badRequest('linkId tidak valid');
      const link = await stores.lti.getLink(tenantId, linkId);
      if (!link || !(await stores.lti.userMayUse(tenantId, link, userId))) throw notFound('Modul EliteMentor tidak ditemukan');
      const tool = await stores.lti.toolById(link.toolId);
      if (!tool || tool.status !== 'active' || tool.tenantId !== tenantId) throw new HttpError(409, 'TOOL_UNAVAILABLE', 'EliteMentor sedang tidak tersedia untuk organisasi Anda');
      const sub = await stores.lti.subFor(tenantId, userId, newSub);
      const ticket = crypto.randomBytes(32).toString('base64url');
      const binder = crypto.randomBytes(32).toString('base64url');
      await stores.lti.createTicket({
        tenantId, userId, linkId: link.id, toolId: tool.id, ticketHash: sha256(ticket), binderHash: sha256(binder), expiresAt: new Date(Date.now() + TICKET_TTL_MS),
      });
      return { url: loginUrl({ tool, issuer, sub, ticket, base }), binder, link };
    },
    /** authorize: validasi + konsumsi tiket, bangun id_token. Return { redirectUri, idToken, state } atau melempar { userError }. */
    async authorize(params, binder) {
      if (!key) throw notConfigured();
      const { value, error } = validateAuthRequest(params);
      if (error) return { error };
      const t = await stores.lti.consumeTicket(sha256(value.lti_message_hint));
      if (!t) return { error: 'tiket tidak ada, sudah dipakai, atau kedaluwarsa' };
      const binderOk = binder && crypto.timingSafeEqual(Buffer.from(sha256(binder)), Buffer.from(t.binderHash));
      if (!binderOk) return { error: 'cookie pengikat tidak cocok' };
      const tool = await stores.lti.toolById(t.toolId);
      if (!tool || tool.status !== 'active' || tool.clientId !== value.client_id) return { error: 'client_id tidak cocok' };
      const allowed = (tool.redirectUris || []).map((u) => resolveUrl(u, base));
      if (!allowed.includes(value.redirect_uri)) return { error: 'redirect_uri tidak terdaftar' };
      if (!(await enabled(t.tenantId))) return { error: 'flag mati' };
      const sub = await stores.lti.subFor(t.tenantId, t.userId, newSub);
      if (sub !== value.login_hint) return { error: 'login_hint tidak cocok' };
      const [link, user] = await Promise.all([stores.lti.getLink(t.tenantId, t.linkId), stores.lti.launchUser(t.tenantId, t.userId)]);
      if (!link || !user) return { error: 'link atau karyawan tidak ada' };
      const payload = buildIdToken({ issuer, tool, link, user, sub, nonce: value.nonce, base, contextKey: contextKeyOf(secret, t.tenantId) });
      return { redirectUri: value.redirect_uri, state: value.state, idToken: key.sign(payload), tenantId: t.tenantId, userId: t.userId, linkId: link.id };
    },
  };
}

function launchPage({ redirectUri, idToken, state, nonce }) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Membuka EliteMentor…</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem">
<main><h1 style="font-size:1.25rem">Membuka EliteMentor…</h1>
<form id="lti" method="post" action="${escapeHtml(redirectUri)}">
<input type="hidden" name="id_token" value="${escapeHtml(idToken)}"><input type="hidden" name="state" value="${escapeHtml(state)}">
<p>Bila halaman tidak berpindah otomatis, tekan tombol ini.</p><button type="submit">Lanjutkan ke EliteMentor</button></form></main>
<script nonce="${nonce}">document.getElementById('lti').submit();</script></body></html>`;
}

function errorPage(base) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tautan EliteMentor tidak berlaku</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem">
<main><h1 style="font-size:1.25rem">Tautan EliteMentor sudah tidak berlaku</h1>
<p>Kembali ke ELGOS dan tekan tombol EliteMentor di Rencana belajar sekali lagi.</p>
<p><a href="${escapeHtml(`${base}/li`)}">Kembali ke ELGOS</a></p></main></body></html>`;
}

/** Router publik /api/lti. jwksClient: createJwksClient (kunci tool untuk JWT assertion). */
function ltiPublicRouter({ service, stores, flags, entitlements, key, jwksClient, config, audit }) {
  const r = express.Router();
  const base = config.appBaseUrl;
  const issuer = config.lti.issuer;
  const tokenAudiences = [`${issuer}/api/lti/token`, `${base}/api/lti/token`, issuer];
  const form = express.urlencoded({ extended: false, limit: '16kb' });
  const requireKey = (_req, _res, next) => (key ? next() : next(notConfigured()));
  const oauthError = (res, status, error, description) => res.status(status).json({ error, error_description: description });

  r.get('/jwks', requireKey, (_req, res) => { res.set('Cache-Control', 'public, max-age=300'); res.json(key.jwks()); });

  const authorize = wrap(async (req, res) => {
    const params = req.method === 'POST' ? (req.body || {}) : req.query;
    const out = await service.authorize(params, cookieValue(req, COOKIE));
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.append('Set-Cookie', `${COOKIE}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax${base.startsWith('https') ? '; Secure' : ''}`);
    if (out.error) {
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
      return res.status(400).type('html').send(errorPage(base));
    }
    const nonce = crypto.randomBytes(16).toString('base64');
    res.set('Content-Security-Policy',
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; form-action ${new URL(out.redirectUri).origin}; base-uri 'none'; frame-ancestors 'none'`);
    await audit.record({ tenantId: out.tenantId, user: { id: out.userId, role: 'learner' } }, 'create', 'lti.launch',
      { employeeIds: [out.userId], objectType: 'lti_resource_link', objectIds: [out.linkId], self: true });
    return res.status(200).type('html').send(launchPage({ ...out, nonce }));
  });
  r.get('/authorize', requireKey, authorize);
  r.post('/authorize', requireKey, form, authorize);

  r.post('/token', requireKey, form, wrap(async (req, res) => {
    const b = req.body || {};
    if (b.grant_type !== 'client_credentials') return oauthError(res, 400, 'unsupported_grant_type', 'grant_type harus client_credentials');
    if (b.client_assertion_type !== ASSERTION_TYPE || typeof b.client_assertion !== 'string') return oauthError(res, 400, 'invalid_request', 'client_assertion wajib');
    const scopes = parseScope(b.scope);
    if (!scopes.length) return oauthError(res, 400, 'invalid_scope', 'scope AGS tidak dikenal');
    const decoded = jwt.decode(b.client_assertion, { complete: true });
    const cid = decoded && decoded.payload && decoded.payload.iss;
    const tool = typeof cid === 'string' ? await stores.lti.toolByClientId(cid) : null;
    if (!tool || tool.status !== 'active' || !decoded.header.kid) return oauthError(res, 401, 'invalid_client', 'Tool tidak dikenal');
    let claims;
    try {
      const pub = await jwksClient.getKey(resolveUrl(tool.jwksUrl, base), decoded.header.kid);
      claims = jwt.verify(b.client_assertion, pub, { algorithms: ['RS256'], issuer: tool.clientId, subject: tool.clientId, audience: tokenAudiences, maxAge: '5m' });
    } catch {
      return oauthError(res, 401, 'invalid_client', 'client_assertion tidak valid');
    }
    if (!claims.jti || !claims.exp || !claims.iat || claims.exp - Math.floor(Date.now() / 1000) > 300) return oauthError(res, 401, 'invalid_client', 'client_assertion tidak lengkap');
    if (!(await stores.lti.useJti(tool.id, claims.jti, new Date(claims.exp * 1000)))) return oauthError(res, 401, 'invalid_client', 'client_assertion sudah dipakai');
    if (!(await flags.isEnabled(tool.tenantId, FLAGS.ELITEMENTOR_LTI))) return oauthError(res, 401, 'invalid_client', 'Integrasi belum diaktifkan');
    const scope = scopes.join(' ');
    const accessToken = key.sign({ sub: tool.id, tid: tool.tenantId, scope }, { audience: AGS_AUDIENCE, issuer, expiresIn: AGS_TOKEN_TTL });
    res.set('Cache-Control', 'no-store');
    return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: AGS_TOKEN_TTL, scope });
  }));

  /** Token AGS: audience sendiri, tool masih aktif, scope cukup. Return { tool, tenantId } atau melempar. */
  async function agsAuth(req, needScope) {
    const [scheme, token] = String(req.get('authorization') || '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'UNAUTHORIZED', 'Token AGS wajib');
    let claims;
    try { claims = key.verify(token, { audience: AGS_AUDIENCE, issuer }); } catch { throw new HttpError(401, 'UNAUTHORIZED', 'Token AGS tidak valid'); }
    const tool = await stores.lti.toolById(claims.sub);
    if (!tool || tool.status !== 'active' || tool.tenantId !== claims.tid) throw new HttpError(401, 'UNAUTHORIZED', 'Tool tidak aktif');
    if (!String(claims.scope || '').split(' ').includes(needScope)) throw forbidden('INSUFFICIENT_SCOPE', 'Scope token tidak cukup');
    if (!(await flags.isEnabled(tool.tenantId, FLAGS.ELITEMENTOR_LTI))) throw forbidden('FEATURE_DISABLED', 'Integrasi belum diaktifkan');
    return { tool, tenantId: tool.tenantId };
  }

  const scoreBody = express.json({ type: ['application/json', 'application/vnd.ims.lis.v1.score+json'], limit: '16kb' });
  r.post('/ags/links/:id/lineitem/scores', requireKey, scoreBody, wrap(async (req, res) => {
    const { tool, tenantId } = await agsAuth(req, AGS_SCOPES.score);
    const link = UUID.test(req.params.id) ? await stores.lti.getLink(tenantId, req.params.id) : null;
    if (!link || link.toolId !== tool.id) throw notFound('Lineitem tidak ditemukan');
    const s = req.body || {};
    const user = typeof s.userId === 'string' ? await stores.lti.userBySub(tenantId, s.userId) : null;
    if (!user || !(await stores.lti.userMayUse(tenantId, link, user.id))) throw forbidden('USER_NOT_IN_LINK', 'userId tidak terdaftar pada lineitem ini');
    const out = toSyncEvent({ link, score: s, user });
    if (out.error) throw badRequest(out.error);
    const ldOpen = await submoduleActive({ entitlements, flags }, tenantId, 'ld');
    let result = { kind: out.kind };
    if (out.kind === 'progress') {
      if (ldOpen) result.ld = await stores.ld.applySyncEvent(tenantId, out.event);
      // rencana belajar milik submodul TNA (aturan 3): tanpa TNA aktif, skor hanya ke Learning Delivery.
      // Dengan LD aktif, efek rencana hanya bila B14 menerapkan event (bukan duplikat/usang).
      const tnaOpen = await submoduleActive({ entitlements, flags }, tenantId, 'tna');
      if (tnaOpen && (!result.ld || result.ld.applied)) {
        await stores.lti.advancePlan(tenantId, link.planItemId, out.planStatus);
        if (out.completion) await stores.lti.recordCompletion(tenantId, { userId: user.id, courseRef: link.courseRef, status: out.completion, score: out.event.score, at: out.event.occurredAt });
      }
    } else if (out.kind === 'assessment' && ldOpen) {
      await stores.lti.markAttendance(tenantId, link.trainingId, user.id);
      // pelatihan dari link, bukan dicari ulang lewat assessment_ref (kode bisa dipakai ulang atau diubah HR)
      result.ld = await stores.ld.applySyncEvent(tenantId, { ...out.event, trainingId: link.trainingId });
    } else if (out.kind === 'attendance' && ldOpen) {
      result.attended = await stores.lti.markAttendance(tenantId, link.trainingId, user.id);
    }
    await audit.record({ tenantId, user: null }, 'update', 'lti.score',
      { employeeIds: [user.id], objectType: 'lti_resource_link', objectIds: [link.id], kind: out.kind, activityProgress: s.activityProgress, applied: result.ld ? result.ld.applied ?? null : null, reason: result.ld ? result.ld.reason ?? null : null });
    return res.status(204).end();
  }));

  return r;
}

/** Adapter penugasan mode LTI dengan antarmuka assign() yang sama dengan adapter REST (review-workspace). */
function ltiAssignmentAdapter({ stores, service }) {
  return {
    available: (tenantId) => service.available(tenantId),
    async assign({ tenantId, tool, plan, actorId }) {
      const link = await stores.lti.ensurePlanItemLink(tenantId, {
        toolId: tool.id, planItemId: plan.id, userId: plan.userId, courseRef: plan.catalogItemRef, title: plan.catalogItemTitle, createdBy: actorId,
      });
      if (!link) throw new Error('Resource link gagal dibuat');
      return { ref: link.id };
    },
  };
}

/** Header Set-Cookie pengikat peluncuran (HttpOnly, hanya dikirim ke authorize). */
function binderCookie(binder, base) {
  return `${COOKIE}=${encodeURIComponent(binder)}; Path=${COOKIE_PATH}; Max-Age=${TICKET_TTL_MS / 1000}; HttpOnly; SameSite=Lax${String(base).startsWith('https') ? '; Secure' : ''}`;
}

module.exports = { createLtiService, ltiPublicRouter, ltiAssignmentAdapter, binderCookie, AGS_AUDIENCE };
