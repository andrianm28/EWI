'use strict';
// Feature flag per tenant. Default semua MATI; dinyalakan per org saat Go/No-Go.
// Daftar flag berasal dari scope penuh BRD di balik flag (Q1, 4 Nov) dan RG-4.
const FLAGS = Object.freeze({
  MODULE_CCA: 'module.cca',
  MODULE_DNA: 'module.dna',
  MODULE_TNA: 'module.tna',
  MODULE_INA: 'module.ina',
  // Cadence 11 Nov (C2): POC ELGOS memakai hasil wawancara DNA manual; wawancara AI DNA ditahan
  DNA_AI_INTERVIEW: 'dna.ai_interview',
  // G2-A (13 Nov): rekomendasi promosi = modul terpisah, di luar POC DNA+TNA
  PROMOTION_RECOMMENDATION: 'promotion.recommendation',
  VOICE_REALTIME: 'voice.realtime',
  VOICE_TTS: 'voice.tts',
  LANG_EN: 'lang.en',
  CHANNEL_WHATSAPP: 'channel.whatsapp',
  GAPS_AUTOSEND: 'em.gaps_autosend',
  SSO_ELITEMENTOR: 'em.sso',
  WEBHOOK_SYNC: 'em.webhook_sync',
  COST_PER_SESSION: 'cost.per_session',
  INA_DASHBOARD: 'ina.dashboard', // RG-4: ditahan dari POC Desember
  // PM-8 B: BT-31 ditunda; permintaan training dari karyawan disembunyikan selama POC
  TNA_TRAINING_REQUEST: 'tna.training_request',
  // PM-6 (17 Nov): daftar ringkas temuan non-training untuk HR; atasan bila diberi akses HR. Mati = disembunyikan
  TNA_NON_TRAINING_HR: 'tna.non_training_hr',
});

const KNOWN = new Set(Object.values(FLAGS));

/**
 * store: {
 *   getTenantFlags(tenantId) -> Promise<Record<string, boolean>>
 *   getKillSwitches?() -> Promise<Record<string, boolean>>        // R2-1: saklar darurat global
 *   setTenantFlag?(tenantId, key, enabled, userId) -> Promise<boolean|null>  // nilai sebelumnya
 *   setKillSwitch?(key, active, reason, userId) -> Promise<boolean|null>
 * }
 * Flag efektif = flag tenant menyala DAN kill switch fitur itu tidak aktif.
 */
function createFlagService(store) {
  const kills = async () => (store.getKillSwitches ? (await store.getKillSwitches()) || {} : {});
  const assertKnown = (flag) => { if (!KNOWN.has(flag)) throw new Error(`Flag tidak dikenal: ${flag}`); };
  return {
    known: () => [...KNOWN],
    isKnown: (flag) => KNOWN.has(flag),
    async isEnabled(tenantId, flag) {
      assertKnown(flag);
      const [flags, killed] = await Promise.all([store.getTenantFlags(tenantId), kills()]);
      return (flags || {})[flag] === true && killed[flag] !== true;
    },
    async all(tenantId) {
      const [flags, killed] = await Promise.all([store.getTenantFlags(tenantId), kills()]);
      return Object.fromEntries([...KNOWN].map((f) => [f, (flags || {})[f] === true && killed[f] !== true]));
    },
    /** Rincian untuk panel Admin ETA: nilai tenant, kill switch, dan nilai efektif. */
    async detail(tenantId) {
      const [flags, killed] = await Promise.all([store.getTenantFlags(tenantId), kills()]);
      return [...KNOWN].sort().map((key) => {
        const tenantEnabled = (flags || {})[key] === true;
        const killSwitch = killed[key] === true;
        return { key, tenantEnabled, killSwitch, effective: tenantEnabled && !killSwitch };
      });
    },
    async setTenantFlag(tenantId, flag, enabled, userId) {
      assertKnown(flag);
      return store.setTenantFlag(tenantId, flag, enabled, userId);
    },
    async setKillSwitch(flag, active, reason, userId) {
      assertKnown(flag);
      return store.setKillSwitch(flag, active, reason, userId);
    },
  };
}

/** Middleware: fitur di dalam submodul yang ditahan di balik flag (default mati). */
function requireFlag(flags, flag, message) {
  const { forbidden } = require('../errors');
  return async (req, _res, next) => {
    try {
      if (!(await flags.isEnabled(req.tenantId, flag))) return next(forbidden('FEATURE_DISABLED', message || 'Fitur ini belum diaktifkan untuk organisasi Anda'));
      return next();
    } catch (e) { return next(e); }
  };
}

module.exports = { FLAGS, createFlagService, requireFlag };
