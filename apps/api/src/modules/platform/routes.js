'use strict';
// B12: /api/platform. Satu-satunya router yang membaca tenantId dari path (ADR 0002); gerbang dipasang di app.js.
const express = require('express');
const { notFound, badRequest } = require('../../core/errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Pelaku tindakan platform: akun Super Admin dan tenant tempat ia login. */
const actorOf = (req) => ({ userId: req.user.id, tenantId: req.tenantId });

/** Slug dari nama perusahaan: tanpa diakritik, huruf kecil, selain a-z0-9 jadi '-', dipotong 64, lalu '-' di ujung dibuang. */
function slugify(name) {
  return String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-+/, '').slice(0, 64).replace(/-+$/, '');
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function platformRouter({ service }) {
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
  r.get('/tenants/:tenantId/modules', wrap(async (req, res) => res.json({ data: await service.listModules(req.params.tenantId) })));
  r.put('/tenants/:tenantId/modules/:moduleKey', wrap(async (req, res) => {
    const row = await service.setModule(actorOf(req), req.params.tenantId, req.params.moduleKey, (req.body || {}).enabled);
    res.json({ data: row });
  }));

  // Path platform yang tidak dikenal berhenti di sini, tidak jatuh ke router /api (auth dua kali)
  r.use((_req, _res, next) => next(notFound()));
  return r;
}

module.exports = { platformRouter, slugify };
