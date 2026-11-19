'use strict';
// Urutan = urutan impor yang disarankan ke HR (job role dulu agar posisi karyawan dikenali; kamus kompetensi
// sebelum katalog course).
const KINDS = [
  require('./job-levels'),
  require('./employees'),
  require('./competencies'),
  require('./completions'),
  require('./dna-results'),
  require('./performance'),
  // PK-18: ditambahkan di akhir agar nomor template 1-6 yang sudah dibagikan ke HR tidak bergeser
  require('./catalog-courses'),
  require('./catalog-completions'),
  require('./cca-program-results'),
];
const byKey = new Map(KINDS.map((k) => [k.key, k]));
module.exports = { KINDS, getKind: (key) => byKey.get(key) || null };
