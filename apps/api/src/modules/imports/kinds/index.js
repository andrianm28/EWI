'use strict';
// Urutan = urutan impor yang disarankan ke HR.
const KINDS = [
  require('./employees'),
  require('./job-levels'),
  require('./competencies'),
  require('./completions'),
  require('./dna-results'),
  require('./performance'),
];
const byKey = new Map(KINDS.map((k) => [k.key, k]));
module.exports = { KINDS, getKind: (key) => byKey.get(key) || null };
