'use strict';
// R2-1 (13 Nov): feature flag hanya diubah Admin ETA. HR dan peran lain tidak punya akses (termasuk baca rincian).
// - Flag per tenant: berlaku untuk tenant tempat Admin ETA login (req.tenantId).
// - Kill switch: saklar darurat global per fitur, tanpa deploy; mematikan fitur di semua tenant.
// Setiap perubahan masuk audit log.
const express = require('express');
const { ROLES } = require('../rbac/roles');
const { badRequest, forbidden, notFound } = require('../errors');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function onlyEtaAdmin(req, _res, next) {
  if (req.user && req.user.role === ROLES.ETA_ADMIN) return next();
  return next(forbidden('ROLE_FORBIDDEN', 'Pengaturan fitur hanya bisa diubah Admin ETA'));
}

function flagAdminRouter({ flags, audit }) {
  const r = express.Router();
  r.use(onlyEtaAdmin);

  const keyOf = (req) => {
    const key = req.params.key;
    if (!flags.isKnown(key)) throw notFound(`Flag tidak dikenal: ${key}`);
    return key;
  };
  const boolField = (body, name) => {
    const v = (body || {})[name];
    if (typeof v !== 'boolean') throw badRequest(`${name} wajib bernilai true atau false`);
    return v;
  };

  r.get('/flags', wrap(async (req, res) => {
    res.json({ data: await flags.detail(req.tenantId) });
  }));

  r.put('/flags/:key', wrap(async (req, res) => {
    const key = keyOf(req);
    const enabled = boolField(req.body, 'enabled');
    const previous = await flags.setTenantFlag(req.tenantId, key, enabled, req.user.id);
    await audit.record(req, 'update', 'feature_flag', { key, from: previous, to: enabled });
    const row = (await flags.detail(req.tenantId)).find((f) => f.key === key);
    res.json({ data: row });
  }));

  r.put('/kill-switches/:key', wrap(async (req, res) => {
    const key = keyOf(req);
    const active = boolField(req.body, 'active');
    const reason = String((req.body || {}).reason || '').trim();
    if (active && !reason) throw badRequest('Alasan wajib diisi saat menyalakan kill switch');
    const previous = await flags.setKillSwitch(key, active, reason || null, req.user.id);
    await audit.record(req, 'update', 'kill_switch', { key, from: previous, to: active, reason: reason || null, global: true });
    res.json({ data: { key, active, reason: reason || null } });
  }));

  return r;
}

module.exports = { flagAdminRouter };
