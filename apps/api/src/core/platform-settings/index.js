'use strict';
// B12: konfigurasi seluruh platform. Hanya kunci yang punya pemakai yang bisa diubah (spek §Konfigurasi platform).
// Cache dalam proses tanpa TTL, dikosongkan saat update: satu proses API per lingkungan di etavm2.
const { badRequest } = require('../errors');

const DEFS = Object.freeze({
  sessionIdleMinutes: { min: 5, max: 480, fallback: 30, label: 'Batas waktu sesi (menit)' },
  aiHrAgreementTarget: { min: 50, max: 100, fallback: 85, label: 'Target kesepakatan AI–HR (%)' },
});

function createPlatformSettings({ store, platformLog }) {
  let cache = null;
  async function all() {
    if (!cache) {
      const rows = await store.all();
      cache = Object.fromEntries(Object.entries(DEFS).map(([k, d]) => [k, Number.isInteger(rows[k]) ? rows[k] : d.fallback]));
    }
    return { ...cache };
  }

  function validate(patch) {
    const errors = [];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw badRequest('Isian konfigurasi harus objek');
    for (const [k, v] of Object.entries(patch)) {
      const d = DEFS[k];
      if (!d) { errors.push(`kunci tidak dikenal: ${k}`); continue; }
      if (!Number.isInteger(v) || v < d.min || v > d.max) errors.push(`${d.label} harus bilangan bulat ${d.min}–${d.max}`);
    }
    if (errors.length) throw badRequest(errors.join('; '));
  }

  return {
    DEFS,
    all,
    async get(key) { return (await all())[key]; },
    /** Validasi semua kunci sekaligus, simpan dalam satu transaksi, satu log platform per kunci yang berubah. */
    async update(actor, patch) {
      validate(patch);
      const current = await all();
      const changed = Object.entries(patch).filter(([k, v]) => current[k] !== v);
      if (changed.length) {
        try {
          await store.transaction(async (transaction) => {
            for (const [key, to] of changed) {
              await store.set(key, to, actor.userId, { transaction });
              await platformLog.record({ actor, action: 'update', resource: 'platform.setting', targetTenantId: null,
                meta: { key, from: current[key], to } }, { transaction });
            }
          });
        } finally { cache = null; }
      }
      return all();
    },
  };
}

module.exports = { createPlatformSettings, DEFS };
