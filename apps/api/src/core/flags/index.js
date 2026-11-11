'use strict';
// Feature flag per tenant. Default semua MATI; dinyalakan per org saat Go/No-Go.
// Daftar flag berasal dari scope penuh BRD di balik flag (Q1, 4 Nov) dan RG-4.
const FLAGS = Object.freeze({
  MODULE_CCA: 'module.cca',
  MODULE_DNA: 'module.dna',
  MODULE_TNA: 'module.tna',
  MODULE_INA: 'module.ina',
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

module.exports = { FLAGS, createFlagService };
