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
  VOICE_REALTIME: 'voice.realtime',
  VOICE_TTS: 'voice.tts',
  LANG_EN: 'lang.en',
  CHANNEL_WHATSAPP: 'channel.whatsapp',
  GAPS_AUTOSEND: 'em.gaps_autosend',
  SSO_ELITEMENTOR: 'em.sso',
  WEBHOOK_SYNC: 'em.webhook_sync',
  AUDIT_READ: 'audit.read',
  COST_PER_SESSION: 'cost.per_session',
  INA_DASHBOARD: 'ina.dashboard', // RG-4: ditahan dari POC Desember
});

const KNOWN = new Set(Object.values(FLAGS));

/** store: { getTenantFlags(tenantId) -> Promise<Record<string, boolean>> } */
function createFlagService(store) {
  return {
    async isEnabled(tenantId, flag) {
      if (!KNOWN.has(flag)) throw new Error(`Flag tidak dikenal: ${flag}`);
      const flags = (await store.getTenantFlags(tenantId)) || {};
      return flags[flag] === true;
    },
    async all(tenantId) {
      const flags = (await store.getTenantFlags(tenantId)) || {};
      return Object.fromEntries([...KNOWN].map((f) => [f, flags[f] === true]));
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
