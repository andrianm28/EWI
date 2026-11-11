'use strict';
// Core Competency Analysis (CCA). Kompetensi inti dari dokumen strategis dan wawancara pimpinan.
const express = require('express');

module.exports = {
  key: 'cca',
  title: 'Core Competency Analysis',
  router() {
    const r = express.Router();
    r.get('/', (req, res) => res.json({ module: 'cca', title: 'Core Competency Analysis', tenantId: req.tenantId, status: 'scaffold' }));
    return r;
  },
};
