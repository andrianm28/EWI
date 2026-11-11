'use strict';
// Improvement Needs Analysis (INA). Masalah non-training (SOP, tools). RG-4: tidak ikut POC Desember, dashboard di balik flag ina.dashboard.
const express = require('express');

module.exports = {
  key: 'ina',
  title: 'Improvement Needs Analysis',
  router() {
    const r = express.Router();
    r.get('/', (req, res) => res.json({ module: 'ina', title: 'Improvement Needs Analysis', tenantId: req.tenantId, status: 'scaffold' }));
    return r;
  },
};
