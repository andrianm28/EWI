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
  // B4: job function DACUM; diimpor sebelum kamus kompetensi, tetapi ditaruh di akhir agar nomor template tidak bergeser
  require('./job-functions'),
];
const byKey = new Map(KINDS.map((k) => [k.key, k]));
module.exports = { KINDS, getKind: (key) => byKey.get(key) || null };
