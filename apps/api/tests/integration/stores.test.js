// Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan (CI menyiapkannya).
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('Postgres stores (schema ewi)', () => {
  let db; let stores; let tenantA; let tenantB;

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    const [[a]] = await db.query(`INSERT INTO tenants (slug, name) VALUES ('it-a-${Date.now()}', 'A') RETURNING id`);
    const [[b]] = await db.query(`INSERT INTO tenants (slug, name) VALUES ('it-b-${Date.now()}', 'B') RETURNING id`);
    tenantA = a.id; tenantB = b.id;
  });

  afterAll(async () => {
    // audit_logs append-only (R2-2): hapus tenant uji hanya lewat mode pemeliharaan DBA
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenantA, tenantB] }, transaction });
    });
    await db.close();
  });

  it('proyek terisolasi per tenant', async () => {
    await stores.projects.create(tenantA, { name: 'Proyek A' });
    expect((await stores.projects.list(tenantA)).map((p) => p.name)).toEqual(['Proyek A']);
    expect(await stores.projects.list(tenantB)).toEqual([]);
  });

  it('entitlement kedaluwarsa tidak dihitung', async () => {
    await db.query(
      `INSERT INTO entitlements (tenant_id, product, starts_at, ends_at) VALUES
        (:t, 'tna', now() - interval '2 day', NULL),
        (:t, 'dna', now() - interval '2 day', now() - interval '1 day')`,
      { replacements: { t: tenantA } },
    );
    const rows = await stores.entitlements.getActiveEntitlements(tenantA, new Date());
    expect(rows.map((r) => r.product)).toEqual(['tna']);
  });

  it('flag dibaca per tenant', async () => {
    await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'module.tna', true)`, { replacements: { t: tenantA } });
    expect(await stores.flags.getTenantFlags(tenantA)).toEqual({ 'module.tna': true });
    expect(await stores.flags.getTenantFlags(tenantB)).toEqual({});
  });
});
