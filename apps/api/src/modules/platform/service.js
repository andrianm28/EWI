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
const MIN_REVIEWED = 10;
const pct = (approved, reviewed) => (reviewed ? Math.round((approved / reviewed) * 1000) / 10 : null);

function createPlatformService({ db, store, flags, entitlements, audit, platformLog, platformSettings, links, provider,
  production = false, onboardingClient }) {
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
        // CUJ 3: Admin Tenant melihat baris "update feature_flag <flag>", sama dengan saklar flag biasa
        await audit.record({ tenantId, user: who.user }, 'update', 'feature_flag',
          { ...who.meta, key: m.flag, from: prev, to: enabled, module: m.key, entitlementAdded }, { transaction });
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
    /** Kirim ulang undangan ke pengelola yang masih invited. Link + audit + log dalam satu transaksi; email setelah COMMIT. */
    async reinvite(actor, tenantId) {
      const target = await store.pendingAdmin(tenantId);
      if (!target) {
        if (await store.hasActiveAdmin(tenantId)) throw new HttpError(409, 'ADMIN_ALREADY_ACTIVE', 'Admin tenant sudah aktif; undangan tidak perlu dikirim ulang');
        throw new HttpError(404, 'NO_PENDING_ADMIN', 'Tidak ada admin tenant yang menunggu undangan');
      }
      const who = targetAudit(actor, tenantId);
      const pending = await db.transaction(async (transaction) => {
        const p = await links.prepare(target, 'invite', { createdBy: actor.userId, tenantName: target.tenantName, transaction });
        await audit.record({ tenantId, user: who.user }, 'create', 'invitation', { ...who.meta, count: 1, userIds: [target.id] }, { transaction });
        await platformLog.record({ actor, action: 'create', resource: 'tenant.invitation', targetTenantId: tenantId,
          meta: { userId: target.id } }, { transaction });
        return p;
      });
      try { await pending.send(); } catch {
        throw new HttpError(502, 'MAIL_FAILED', 'Email undangan gagal terkirim. Link tersimpan; coba kirim ulang beberapa saat lagi.');
      }
      return { invitation: 'sent' };
    },
    /** Kesepakatan AI–HR per tenant (PM-2 bagian C); n < 10 tanpa tanda lulus/gagal. */
    async aiQuality({ days }) {
      const target = await platformSettings.get('aiHrAgreementTarget');
      const byTenant = new Map();
      for (const r of await store.aiQuality({ days })) {
        const t = byTenant.get(r.tenantId) || { tenantId: r.tenantId, name: r.name, reviewed: 0, approved: 0, daily: [] };
        t.reviewed += r.reviewed; t.approved += r.approved;
        t.daily.push({ day: r.day, reviewed: r.reviewed, approved: r.approved, agreement: pct(r.approved, r.reviewed), enoughData: r.reviewed >= MIN_REVIEWED });
        byTenant.set(r.tenantId, t);
      }
      return [...byTenant.values()].map((t) => {
        const agreement = pct(t.approved, t.reviewed);
        const enoughData = t.reviewed >= MIN_REVIEWED;
        // dibandingkan dengan rasio mentah, bukan persen yang dibulatkan (84,96% tidak memenuhi 85%)
        return { ...t, agreement, enoughData, meetsTarget: enoughData ? (t.approved / t.reviewed) * 100 >= target : null };
      });
    },
    /** Laporan biaya token mingguan (PO-10). */
    async aiCost({ weeks }) {
      return (await store.aiCost({ weeks })).map((r) => ({
        ...r, tokensIn: Number(r.tokensIn), tokensOut: Number(r.tokensOut), costUsd: Math.round(Number(r.costUsd) * 1e6) / 1e6,
      }));
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
          users: tenants.reduce((n, t) => n + t.users, 0),
          modulesAvailable: MODULES.filter((m) => flags.isKnown(m.flag)).length,
        },
        tenants,
      };
    },
  };
}

module.exports = { createPlatformService };
