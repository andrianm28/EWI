'use strict';
// FR-PRJ: proyek analisis, dasar semua submodul. Tidak butuh entitlement submodul.
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');

module.exports = {
  key: 'projects',
  router({ projects }) {
    const r = express.Router();
    r.get('/', async (req, res, next) => {
      try { res.json({ data: await projects.list(req.tenantId) }); } catch (e) { next(e); }
    });
    r.post('/', requireRole(ROLES.HR_ADMIN), async (req, res, next) => {
      try {
        const { name, periodStart, periodEnd, division } = req.body || {};
        if (!name) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name wajib diisi' } });
        const row = await projects.create(req.tenantId, { name, periodStart, periodEnd, division, createdBy: req.user.id });
        res.status(201).json({ data: row });
      } catch (e) { next(e); }
    });
    return r;
  },
};
