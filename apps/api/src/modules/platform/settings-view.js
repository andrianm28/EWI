'use strict';
// B12: GET/PUT /api/platform/settings. Isian yang bisa diubah + baris tampilan kartu konfigurasi (spek §Konfigurasi platform).
const { FLAGS } = require('../../core/flags');

function createSettingsView({ platformSettings, store, encryption, ai }) {
  return {
    async view() {
      const [editable, ssoTenants] = await Promise.all([platformSettings.all(), store.tenantsWithFlag(FLAGS.AUTH_SSO)]);
      return {
        editable,
        display: {
          encryption,
          aiModel: { provider: ai.provider, model: ai.modelId || '' },
          ssoTenants,
          // tahap 2 (sesi diam) belum masuk: batas sesi tersimpan tetapi belum ditegakkan
          idleEnforcedTenants: 0,
          idleEnforcement: 'not_yet',
        },
        encryptionProvider: encryption,
      };
    },
    update: (actor, patch) => platformSettings.update(actor, patch),
  };
}

module.exports = { createSettingsView };
