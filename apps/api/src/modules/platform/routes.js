'use strict';
// B12: /api/platform. Satu-satunya router yang membaca tenantId dari path (ADR 0002); gerbang dipasang di app.js.
const express = require('express');
const { notFound } = require('../../core/errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Pelaku tindakan platform: akun Super Admin dan tenant tempat ia login. */
const actorOf = (req) => ({ userId: req.user.id, tenantId: req.tenantId });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function platformRouter({ service }) {
  const r = express.Router();

  r.param('tenantId', (_req, _res, next, value) => {
    if (!UUID_RE.test(value)) return next(notFound('Tenant tidak ditemukan'));
    return service.tenantExists(value).then((ok) => next(ok ? undefined : notFound('Tenant tidak ditemukan')), next);
  });

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

module.exports = { platformRouter };
