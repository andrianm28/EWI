'use strict';
// Konfigurasi per tenant (RG-1g ★ masih terbuka: kekhususan klien sebagai konfigurasi, ELGOS = konfigurasi pertama).
// Disimpan di tenants.settings (jsonb). Nilai `null` = keputusan bisnis belum diambil: endpoint yang
// membutuhkannya meminta pilihan eksplisit dari HR, bukan memakai default diam-diam.
const DEFAULTS = Object.freeze({
  tna: {
    // BT-29 terbuka: 'all_members' (semua anggota tim) | 'red_only' (hanya yang targetnya merah)
    interviewScope: null,
    // BT-30 terbuka: komponen skor Pareto yang dipakai
    pareto: { useMiss: true, useImportance: true },
  },
  dna: {
    // RG-1e terbuka untuk atasan; default paling sempit: hanya HR yang melihat saran kandidat promosi
    promotionVisibleTo: ['hr_admin'],
  },
  lms: {
    // K-1 terbuka: EliteMentor jalur default; LMS klien (mis. 'moodle') ditambah lewat konfigurasi
    targets: ['elitementor'],
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

/** store: { getTenantSettings(tenantId) -> Promise<object> } */
function createSettingsService(store) {
  return {
    async get(tenantId) {
      const raw = store && store.getTenantSettings ? await store.getTenantSettings(tenantId) : {};
      return merge(DEFAULTS, raw || {});
    },
  };
}

module.exports = { DEFAULTS, INTERVIEW_SCOPES, merge, createSettingsService };
