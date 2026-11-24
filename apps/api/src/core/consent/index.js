'use strict';
// PM-9 A (17 Nov): setiap persetujuan wawancara menyimpan kode versi teks yang disetujui.
// Teks v1.0 (draf, menunggu legal dan Pak Eji paling lambat 24 Nov) ada di dokumen legal & privasi POC ELGOS.
// Teks v1.0 hanya untuk wawancara TNA teks. DNA belum punya teks persetujuan sehingga persetujuan DNA ditolak
// sampai teksnya terbit (wawancara AI DNA di balik flag dna.ai_interview, mati untuk POC, C2).
// B10 tahap 2 (23 Nov, D-8): wawancara Core Competencies memakai draf cca-consent-id-v1.0 (turunan teks TNA v1.0,
// tujuan pemetaan pemahaman visi, misi, dan nilai; bukan penilaian kinerja), menunggu legal.
// B15 tahap 3 (23 Nov): wawancara ulang AI memakai draf lim-consent-id-v1.0 (turunan teks TNA v1.0, tujuan mengukur
// apakah hasil pelatihan masih terpakai untuk menilai dampak program; bukan dasar penilaian kinerja individu), menunggu legal.
// B9 (audit 23 Nov): verifikasi tindakan perbaikan oleh AI memakai draf ina-verifikasi-v1.0 (versi yang sudah dikirim web
// di apps/web/src/api/ina.ts), menunggu legal. Sebelumnya versi apa pun diterima tanpa dicek.
// Setiap perubahan isi menaikkan versi; versi lama dihapus dari daftar bila karyawan wajib setuju ulang.
const CONSENT_VERSIONS = Object.freeze({
  tna: Object.freeze(['tna-consent-id-v1.0']),
  dna: Object.freeze([]),
  cca: Object.freeze(['cca-consent-id-v1.0']),
  lim: Object.freeze(['lim-consent-id-v1.0']),
  ina: Object.freeze(['ina-verifikasi-v1.0']),
});

// B19 (7.1): persetujuan suara terpisah dari persetujuan utama. v0.1 hanya untuk demo dan tenant uji; flag voice.realtime
// tetap mati untuk tenant sungguhan sampai teks v1.0 terbit dari legal (Fasha).
const VOICE_CONSENT_VERSIONS = Object.freeze({
  tna: Object.freeze(['tna-voice-consent-id-v0.1']),
});

const latest = (list) => (list && list.length ? list[list.length - 1] : null);
const currentVoiceConsentVersion = (submodule) => latest(VOICE_CONSENT_VERSIONS[submodule]);
const isAcceptedVoiceConsentVersion = (submodule, version) => (VOICE_CONSENT_VERSIONS[submodule] || []).includes(version);

const currentConsentVersion = (submodule) => {
  const list = CONSENT_VERSIONS[submodule] || [];
  return list.length ? list[list.length - 1] : null;
};

const isAcceptedConsentVersion = (submodule, version) => (CONSENT_VERSIONS[submodule] || []).includes(version);

module.exports = { CONSENT_VERSIONS, VOICE_CONSENT_VERSIONS, currentConsentVersion, isAcceptedConsentVersion, currentVoiceConsentVersion, isAcceptedVoiceConsentVersion };
