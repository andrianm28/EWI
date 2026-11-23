'use strict';
// B12: /api/platform. Satu-satunya router yang membaca tenantId dari path (ADR 0002); gerbang dipasang di app.js.
const express = require('express');
const { notFound, badRequest } = require('../../core/errors');
const { csvCell } = require('../imports/template');

/** Bilangan bulat query dalam rentang; kosong = bawaan; selain itu 400. */
function intParam(req, name, min, max, fallback) {
  const raw = req.query[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (typeof raw !== 'string' || !/^\d+$/.test(raw) || n < min || n > max) throw badRequest(`${name} harus bilangan bulat ${min}–${max}`);
  return n;
}

/** Sel CSV aman: kutip bila perlu, dan awalan ' untuk sel yang bisa dibaca sebagai formula. */
const safeCell = (x) => csvCell(/^[=+\-@]/.test(String(x ?? '')) ? `'${x}` : x);
const COST_HEADER = 'minggu,tenant,sesi,panggilan,token_masuk,token_keluar,biaya_usd,biaya_belum_tercatat';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Pelaku tindakan platform: akun Super Admin dan tenant tempat ia login. */
const actorOf = (req) => ({ userId: req.user.id, tenantId: req.tenantId });

/** Slug dari nama perusahaan: tanpa diakritik, huruf kecil, selain a-z0-9 jadi '-', dipotong 64, lalu '-' di ujung dibuang. */
function slugify(name) {
  return String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-+/, '').slice(0, 64).replace(/-+$/, '');
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function platformRouter({ service, settings, platformLog, limits = {} }) {
  const r = express.Router();

  r.param('tenantId', (_req, _res, next, value) => {
    if (!UUID_RE.test(value)) return next(notFound('Tenant tidak ditemukan'));
    return service.tenantExists(value).then((ok) => next(ok ? undefined : notFound('Tenant tidak ditemukan')), next);
  });

  r.post('/tenants', wrap(async (req, res) => {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const slug = slugify(name);
    if (!slug) throw badRequest('Nama perusahaan harus memuat huruf atau angka');
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
    const out = await service.createTenant(actorOf(req), {
      name, slug, adminEmail: typeof body.adminEmail === 'string' ? body.adminEmail : '',
      adminName: typeof body.adminName === 'string' ? body.adminName : undefined,
      id: typeof body.id === 'string' && body.id ? body.id : undefined,
    }, { dryRun });
    res.status(dryRun ? 200 : 201).json({ data: out });
  }));
  r.get('/tenants', wrap(async (_req, res) => res.json({ data: await service.listTenants() })));
  r.post('/tenants/:tenantId/invite', wrap(async (req, res) => {
    // batas per tenant, terpisah dari batas link per akun; undangan saat tenant dibuat tidak dihitung
    if (limits.platformReinvite) limits.platformReinvite.consume(`platform:reinvite:${req.params.tenantId}`);
    res.json({ data: await service.reinvite(actorOf(req), req.params.tenantId) });
  }));
  r.get('/tenants/:tenantId/modules', wrap(async (req, res) => res.json({ data: await service.listModules(req.params.tenantId) })));
  r.put('/tenants/:tenantId/modules/:moduleKey', wrap(async (req, res) => {
    const row = await service.setModule(actorOf(req), req.params.tenantId, req.params.moduleKey, (req.body || {}).enabled);
    res.json({ data: row });
  }));

  r.get('/ai-quality', wrap(async (req, res) => res.json({ data: await service.aiQuality({ days: intParam(req, 'days', 1, 90, 30) }) })));
  r.get('/ai-cost', wrap(async (req, res) => {
    const weeks = intParam(req, 'weeks', 1, 26, 8);
    const format = req.query.format;
    if (format !== undefined && format !== 'csv' && format !== 'json') throw badRequest('format harus csv atau json');
    const rows = await service.aiCost({ weeks });
    if (format !== 'csv') return res.json({ data: rows });
    const lines = rows.map((r) => [r.week, r.name, r.sessions, r.calls, r.tokensIn, r.tokensOut, r.costUsd, r.costMissing ? 'ya' : 'tidak']
      .map(safeCell).join(','));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="biaya-ai-mingguan.csv"');
    return res.send(`${[COST_HEADER, ...lines].join('\r\n')}\r\n`);
  }));
  r.get('/log', wrap(async (req, res) => res.json({ data: await platformLog.recent(intParam(req, 'limit', 1, 200, 50)) })));
  r.get('/attempts', wrap(async (req, res) => res.json({ data: await platformLog.attemptsByDay(intParam(req, 'days', 1, 31, 7)) })));
  r.get('/settings', wrap(async (_req, res) => res.json({ data: await settings.view() })));
  r.put('/settings', wrap(async (req, res) => {
    await settings.update(actorOf(req), req.body);
    res.json({ data: await settings.view() });
  }));

  // Path platform yang tidak dikenal berhenti di sini, tidak jatuh ke router /api (auth dua kali)
  r.use((_req, _res, next) => next(notFound()));
  return r;
}

module.exports = { platformRouter, slugify };
