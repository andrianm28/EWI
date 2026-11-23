'use strict';
// B12: GET/PUT /api/platform/settings. Isian yang bisa diubah + baris tampilan kartu konfigurasi (spek §Konfigurasi platform).
const { FLAGS } = require('../../core/flags');

function createSettingsView({ platformSettings, store, encryption, ai }) {
  return {
    async view() {
      const [editable, ssoTenants, idleEnforcedTenants] = await Promise.all([
        platformSettings.all(), store.tenantsWithFlag(FLAGS.AUTH_SSO), store.tenantsWithFlag(FLAGS.AUTH_SESSION_IDLE)]);
      return {
        editable,
        display: {
          encryption,
          aiModel: { provider: ai.provider, model: ai.modelId || '' },
          ssoTenants,
          // tahap 2: ditegakkan per tenant lewat flag auth.session_idle
          idleEnforcedTenants,
          idleEnforcement: 'per_tenant',
        },
        encryptionProvider: encryption,
      };
    },
    update: (actor, patch) => platformSettings.update(actor, patch),
  };
}

module.exports = { createSettingsView };
