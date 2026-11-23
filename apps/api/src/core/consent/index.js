'use strict';
// PM-9 A (17 Nov): setiap persetujuan wawancara menyimpan kode versi teks yang disetujui.
// Teks v1.0 (draf, menunggu legal dan Pak Eji paling lambat 24 Nov) ada di dokumen legal & privasi POC ELGOS.
// Teks v1.0 hanya untuk wawancara TNA teks. DNA belum punya teks persetujuan sehingga persetujuan DNA ditolak
// sampai teksnya terbit (wawancara AI DNA di balik flag dna.ai_interview, mati untuk POC, C2).
// B10 tahap 2 (23 Nov, D-8): wawancara Core Competencies memakai draf cca-consent-id-v1.0 (turunan teks TNA v1.0,
// tujuan pemetaan pemahaman visi, misi, dan nilai; bukan penilaian kinerja), menunggu legal.
// B15 tahap 3 (23 Nov): wawancara ulang AI memakai draf lim-consent-id-v1.0 (turunan teks TNA v1.0, tujuan mengukur
// apakah hasil pelatihan masih terpakai untuk menilai dampak program; bukan dasar penilaian kinerja individu), menunggu legal.
// Setiap perubahan isi menaikkan versi; versi lama dihapus dari daftar bila karyawan wajib setuju ulang.
const CONSENT_VERSIONS = Object.freeze({
  tna: Object.freeze(['tna-consent-id-v1.0']),
  dna: Object.freeze([]),
  cca: Object.freeze(['cca-consent-id-v1.0']),
  lim: Object.freeze(['lim-consent-id-v1.0']),
});

const currentConsentVersion = (submodule) => {
  const list = CONSENT_VERSIONS[submodule] || [];
  return list.length ? list[list.length - 1] : null;
};

const isAcceptedConsentVersion = (submodule, version) => (CONSENT_VERSIONS[submodule] || []).includes(version);

module.exports = { CONSENT_VERSIONS, currentConsentVersion, isAcceptedConsentVersion };
