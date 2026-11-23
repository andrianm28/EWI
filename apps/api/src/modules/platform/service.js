'use strict';
// B12: logika konsol Super Admin di balik antarmuka kecil. Rute hanya memetakan HTTP ke satu method.
const { QueryTypes } = require('sequelize');
const { MODULES, byKey, rowFor } = require('./modules');
const { ensureEntitlement } = require('../../core/tenant/onboarding');
const { notFound, badRequest } = require('../../core/errors');

/** Adapter `{ query(sql, params) -> { rows } }` (parameter $n, gaya pg) di atas transaksi Sequelize. */
const txQuery = (db, transaction) => ({
  async query(sql, params = []) {
    return { rows: await db.query(sql, { bind: params, type: QueryTypes.SELECT, transaction }) };
  },
});

/** Pelaku di audit tenant sasaran: akun Super Admin milik tenant lain, jadi user_id kosong (spek §Delapan modul). */
const targetAudit = (actor, targetTenantId) => ({
  tenantId: targetTenantId,
  user: { role: 'eta_admin' },
  meta: { actor: 'Super Admin ELGOS', actorUserId: actor.userId, via: 'api/platform' },
});

function createPlatformService({ db, store, flags, entitlements, audit, platformLog }) {
  async function listModules(tenantId) {
    const [detail, submodules] = await Promise.all([flags.detail(tenantId), entitlements.submodules(tenantId)]);
    return MODULES.map((m) => rowFor(m, detail, submodules));
  }

  return {
    tenantExists: (tenantId) => store.tenantExists(tenantId),
    listModules,
    /** Saklar modul tenant: entitlement (bila menyala), flag, audit tenant sasaran, log platform; satu transaksi. */
    async setModule(actor, tenantId, moduleKey, enabled) {
      const m = byKey(moduleKey);
      if (!m) throw notFound('Modul tidak dikenal');
      if (typeof enabled !== 'boolean') throw badRequest('enabled harus true atau false');
      if (!flags.isKnown(m.flag)) {
        const e = badRequest('Modul ini belum tersedia'); e.code = 'MODULE_UNAVAILABLE'; throw e;
      }
      await db.transaction(async (transaction) => {
        let entitlementAdded = false;
        if (enabled && m.product) entitlementAdded = await ensureEntitlement(txQuery(db, transaction), tenantId, m.product, 'platform');
        const prev = await flags.setTenantFlag(tenantId, m.flag, enabled, actor.userId, { transaction });
        const who = targetAudit(actor, tenantId);
        const meta = { module: m.key, flag: m.flag, enabled, from: prev, entitlementAdded };
        await audit.record({ tenantId, user: { role: who.user.role } }, 'update', 'tenant.module', { ...who.meta, ...meta }, { transaction });
        await platformLog.record({ actor, action: 'update', resource: 'tenant.module', targetTenantId: tenantId, meta }, { transaction });
      });
      return (await listModules(tenantId)).find((row) => row.key === m.key);
    },
    async listTenants() {
      const rows = await store.listTenants();
      const tenants = await Promise.all(rows.map(async (t) => ({
        ...t, activeModules: (await listModules(t.id)).filter((m) => m.effective).length,
      })));
      return {
        kpis: {
          tenants: tenants.length,
          activeTenants: tenants.filter((t) => t.status === 'active').length,
          modulesAvailable: MODULES.filter((m) => flags.isKnown(m.flag)).length,
        },
        tenants,
      };
    },
  };
}

module.exports = { createPlatformService };
