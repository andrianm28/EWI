'use strict';
// Training Needs Analysis (TNA). RG-2: dipicu target OKR/KPI/SLA yang tidak tercapai; hasil training-related menjadi training plan.
const express = require('express');

module.exports = {
  key: 'tna',
  title: 'Training Needs Analysis',
  router() {
    const r = express.Router();
    r.get('/', (req, res) => res.json({ module: 'tna', title: 'Training Needs Analysis', tenantId: req.tenantId, status: 'scaffold' }));
    return r;
  },
};
