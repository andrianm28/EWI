'use strict';
// Urutan = urutan impor yang disarankan ke HR (job role dulu agar posisi karyawan dikenali).
const KINDS = [
  require('./job-levels'),
  require('./employees'),
  require('./competencies'),
  require('./completions'),
  require('./dna-results'),
  require('./performance'),
  require('./cca-program-results'),
];
const byKey = new Map(KINDS.map((k) => [k.key, k]));
module.exports = { KINDS, getKind: (key) => byKey.get(key) || null };
