'use strict';
// B14: penerima event webhook EliteMentor (progres belajar online dan hasil asesmen). Dipasang sebagai `handler`
// webhookRouter (tanda tangan HMAC sudah diverifikasi di sana). Webhook tidak lewat requireSubmodule, jadi
// entitlement dan flag dicek di sini. Selalu selesai tanpa melempar untuk event yang tidak bisa dipakai
// (EliteMentor tidak perlu mengulang); galat sungguhan (mis. DB) dilempar agar dijawab 5xx dan diulang.
const { FLAGS } = require('../../core/flags');
const { normalizeEvent } = require('./domain');

function createLdSync({ stores, flags, entitlements, log = () => {} }) {
  return async function handle(raw) {
    const { event, error } = normalizeEvent(raw);
    if (error) { log(`[ld.sync] event diabaikan: ${error}`); return { ignored: 'invalid', error }; }
    const tenants = await stores.ld.tenantsByElitementorOrg(event.organizationId);
    if (tenants.length !== 1) return { ignored: tenants.length ? 'tenant_ambiguous' : 'tenant_unknown' };
    const tenantId = tenants[0].id;
    const open = (await entitlements.has(tenantId, 'ld'))
      && (await flags.isEnabled(tenantId, FLAGS.MODULE_LD))
      && (await flags.isEnabled(tenantId, FLAGS.WEBHOOK_SYNC));
    if (!open) return { ignored: 'disabled' };
    return stores.ld.applySyncEvent(tenantId, event);
  };
}

module.exports = { createLdSync };
