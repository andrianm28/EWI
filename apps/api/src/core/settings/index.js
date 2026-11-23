'use strict';
// Konfigurasi per tenant (RG-1g ★ masih terbuka: kekhususan klien sebagai konfigurasi, ELGOS = konfigurasi pertama).
// Disimpan di tenants.settings (jsonb). Nilai `null` = keputusan bisnis belum diambil: endpoint yang
// membutuhkannya meminta pilihan eksplisit dari HR, bukan memakai default diam-diam.
const DEFAULTS = Object.freeze({
  tna: {
    // BT-29 diputuskan lewat cadence 11 Nov (C3, ditetapkan user 12 Nov): TNA reaktif, hanya mewawancarai
    // karyawan yang targetnya merah. 'all_members' tetap tersedia sebagai konfigurasi klien lain.
    interviewScope: 'red_only',
    // BT-29 final (12 Nov): cakupan diatur per klien. Untuk 'all_members', job role default yang diwawancarai
    // (mis. ELGOS: semua anggota Service Delivery L1, BT-19). HR tetap bisa memilih lain saat menjadwalkan.
    interviewJobRoleId: null,
    // BT-30 terbuka: komponen skor Pareto yang dipakai
    pareto: { useMiss: true, useImportance: true },
    // PM-3 A: target tinjauan hasil AI oleh HR, dalam hari kerja (1-30)
    reviewTargetDays: 2,
  },
  dna: {
    // B16 (mockup final 19 Nov): HR dan atasan melihat modul promosi; atasan hanya bawahan langsungnya.
    // Tenant yang mengisi ['hr_admin'] menutup modul ini untuk atasan (RG-1e lama).
    promotionVisibleTo: ['hr_admin', 'supervisor'],
    // B16 C2: ambang pencapaian OKR (persen) dan jenis metrik yang dihitung sebagai OKR
    promotion: { okrMin: 80, metricTypes: ['okr'] },
  },
  lms: {
    // K-1 terbuka: EliteMentor jalur default (adapter masih kosong). PK-18: katalog statis 'moodle' (hasil impor
    // HR) ikut dicari; tenant tanpa katalog impor tidak terpengaruh karena hasilnya kosong.
    targets: ['elitementor', 'moodle'],
    // K4 (B7/B8): tempat karyawan belajar. 'elitementor' = penugasan lewat API EliteMentor; 'lms_export' = klien
    // memakai LMS sendiri dan gap diekspor. Berbeda dari `targets` (urutan katalog saat mencocokkan course).
    delivery: 'elitementor',
    lmsName: 'LMS perusahaan',
    // Id organisasi tenant di EliteMentor; kosong = penugasan langsung belum bisa dipakai
    elitementorOrganizationId: null,
  },
  assistant: {
    // B17: lama log Asisten ELGOS disimpan, dalam hari (1-365). [⏳ DITERIMA] 90 belum diputuskan pemilik produk
    retentionDays: 90,
  },
  li: {
    // K4: vendor modul per tenant (bukan hardcode). ELGOS hanya mencatat permintaan; tidak mengirim apa pun ke vendor.
    vendorName: 'Mahaka Institute',
    // Rumpun yang spesifik proses perusahaan: disarankan dikembangkan sendiri, bukan diminta ke vendor (usulan awal).
    devStreams: ['Specific Technical'],
  },
});

const INTERVIEW_SCOPES = Object.freeze(['all_members', 'red_only']);

function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function merge(base, override) {
  if (!isPlainObject(override)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = isPlainObject(base[k]) && isPlainObject(v) ? merge(base[k], v) : v;
  }
  return out;
}

const DELIVERIES = Object.freeze(['elitementor', 'lms_export']);

/** Nilai setting yang tidak valid jatuh ke default, supaya salah isi di tenants.settings tidak mematahkan endpoint. */
function normalize(raw) {
  // tenants.settings bisa berisi bentuk yang salah (mis. "lms": null); bagian itu memakai default seutuhnya
  const conf = { ...raw };
  for (const key of ['tna', 'lms', 'assistant']) if (!isPlainObject(conf[key])) conf[key] = DEFAULTS[key];
  const days = conf.tna.reviewTargetDays;
  const name = typeof conf.lms.lmsName === 'string' ? conf.lms.lmsName.trim() : '';
  const org = conf.lms.elitementorOrganizationId;
  const retention = conf.assistant.retentionDays;
  return {
    ...conf,
    tna: { ...conf.tna, reviewTargetDays: Number.isInteger(days) && days >= 1 && days <= 30 ? days : DEFAULTS.tna.reviewTargetDays },
    lms: {
      ...conf.lms,
      delivery: DELIVERIES.includes(conf.lms.delivery) ? conf.lms.delivery : DEFAULTS.lms.delivery,
      lmsName: name || DEFAULTS.lms.lmsName,
      elitementorOrganizationId: org == null || String(org).trim() === '' ? null : String(org).trim(),
    },
    assistant: { ...conf.assistant, retentionDays: Number.isInteger(retention) && retention >= 1 && retention <= 365 ? retention : DEFAULTS.assistant.retentionDays },
  };
}

/**
 * Tempat belajar untuk satu rencana (K4). Sumber course rencana menang; rencana tanpa course mengikuti
 * setting tenant. Dipakai B7 (label solusi) dan B8 (kartu rencana belajar).
 */
function deliveryFor(conf, catalogSource) {
  const em = { target: 'elitementor', label: 'EliteMentor' };
  const lms = { target: 'lms', label: conf.lms.lmsName };
  if (catalogSource) return catalogSource === 'elitementor' ? em : lms;
  return conf.lms.delivery === 'elitementor' ? em : lms;
}

/** store: { getTenantSettings(tenantId) -> Promise<object> } */
function createSettingsService(store) {
  return {
    async get(tenantId) {
      const raw = store && store.getTenantSettings ? await store.getTenantSettings(tenantId) : {};
      return normalize(merge(DEFAULTS, raw || {}));
    },
  };
}

module.exports = { DEFAULTS, INTERVIEW_SCOPES, DELIVERIES, merge, normalize, deliveryFor, createSettingsService };
