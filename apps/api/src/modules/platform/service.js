'use strict';
// B12: logika konsol Super Admin di balik antarmuka kecil. Rute hanya memetakan HTTP ke satu method.
const { QueryTypes } = require('sequelize');
const { MODULES, byKey, rowFor } = require('./modules');
const { ensureEntitlement, onboardTenant, OnboardingError, TenantExistsError } = require('../../core/tenant/onboarding');
const { inviteAdmins } = require('../../core/tenant/invite');
const { HttpError, notFound, badRequest } = require('../../core/errors');

const ACTOR_LABEL = 'Super Admin ELGOS';
const VIA = 'api/platform';

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
  meta: { actor: ACTOR_LABEL, actorUserId: actor.userId, via: VIA },
});

/**
 * onboardingClient(fn): menjalankan fn(pgClient) di koneksi khusus onboarding (core/tenant/client.js).
 * provider: penyedia kunci induk (local/kms); links: layanan email-link (prepare/send).
 */
function createPlatformService({ db, store, flags, entitlements, audit, platformLog, links, provider, production = false, onboardingClient }) {
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
    /**
     * Buat tenant baru lewat onboarding mode create. input = { name, slug, adminEmail, adminName?, id? }.
     * dryRun: { slug, exists, report }. Selain itu { tenant, slug, invitation: 'sent'|'failed' }.
     */
    async createTenant(actor, input, { dryRun = false } = {}) {
      const spec = { id: input.id || undefined, slug: input.slug, name: input.name, products: [],
        users: [{ email: input.adminEmail, role: 'tenant_admin', name: input.adminName }] };
      const by = { userId: actor.userId, label: ACTOR_LABEL, via: VIA };
      let result;
      try {
        result = await onboardingClient((client) => onboardTenant({
          db: client, provider, spec, production, dryRun, mode: 'create', actor: by,
          beforeCommit: async (c, r) => {
            const { text, values } = platformLog.insertSql({ actor, action: 'create', resource: 'tenant',
              targetTenantId: r.tenantId, meta: { slug: r.slug, name: r.name } });
            await c.query(text, values);
          },
        }));
      } catch (e) {
        if (e instanceof OnboardingError || e instanceof TenantExistsError) throw new HttpError(e.status, e.code, e.message);
        throw e;
      }
      if (dryRun) return { slug: result.slug, exists: result.exists, report: result.report };

      let invitation = 'sent';
      try {
        const r = await inviteAdmins({ query: (sql, params) => txQuery(db).query(sql, params), links,
          tenantId: result.tenantId, tenantName: result.name, emails: result.users.map((u) => u.email), actor: by });
        if (r.failed || !r.sent) invitation = 'failed';
      } catch { invitation = 'failed'; }
      const tenant = (await store.listTenants()).find((t) => t.id === result.tenantId);
      return { tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status }, slug: result.slug, invitation };
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
