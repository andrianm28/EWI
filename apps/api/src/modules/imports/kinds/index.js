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
  // B13: library modul KSA (DACUM Tool 2), nomor template 9
  require('./li-modules'),
  // B10: hasil program Core Competencies, nomor template 10
  require('./cca-program-results'),
  // B15: skor pre/post/kinerja per karyawan per kompetensi rencana Impact Measurement, nomor template 11
  require('./lim-measurements'),
];
const byKey = new Map(KINDS.map((k) => [k.key, k]));
module.exports = { KINDS, getKind: (key) => byKey.get(key) || null };
