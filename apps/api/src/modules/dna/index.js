'use strict';
// Development Need Analysis (DNA). RG-1: gap individu terhadap kompetensi jabatan + jenjang karier (probation, junior, senior, leader).
const express = require('express');

module.exports = {
  key: 'dna',
  title: 'Development Need Analysis',
  router() {
    const r = express.Router();
    r.get('/', (req, res) => res.json({ module: 'dna', title: 'Development Need Analysis', tenantId: req.tenantId, status: 'scaffold' }));
    return r;
  },
};
