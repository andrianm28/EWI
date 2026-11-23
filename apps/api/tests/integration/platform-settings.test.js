// B12: konfigurasi platform (platform_settings) di Postgres. Spek: docs/designs/b12-super-admin.md §Konfigurasi platform.
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createPlatformLog } = require('../../src/core/platform-log');
const { createPlatformSettings } = require('../../src/core/platform-settings');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('B12 konfigurasi platform (Postgres)', () => {
  let db; let settings; let original;
  const actor = { userId: null, tenantId: null };
  const logs = (since) => db.query(
    "SELECT meta FROM platform_audit_logs WHERE resource = 'platform.setting' AND id > :since ORDER BY id",
    { replacements: { since }, type: 'SELECT' });
  const lastId = async () => (await db.query('SELECT coalesce(max(id), 0)::int AS id FROM platform_audit_logs', { type: 'SELECT' }))[0].id;

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const stores = createStores(db);
    settings = createPlatformSettings({ store: stores.platformSettings, platformLog: createPlatformLog({ store: stores.platformLog }) });
    original = await settings.all();
  });

  afterAll(async () => {
    await settings.update(actor, original);
    await db.close();
  });

  it('nilai bawaan dari migrasi', async () => {
    expect(original).toEqual({ sessionIdleMinutes: expect.any(Number), aiHrAgreementTarget: expect.any(Number) });
  });

  it('satu log per kunci yang berubah; getter langsung memakai nilai baru', async () => {
    const since = await lastId();
    await settings.update(actor, { sessionIdleMinutes: 45, aiHrAgreementTarget: original.aiHrAgreementTarget });
    expect(await settings.get('sessionIdleMinutes')).toBe(45);
    expect(await logs(since)).toEqual([{ meta: { key: 'sessionIdleMinutes', from: original.sessionIdleMinutes, to: 45 } }]);
  });

  it.each([
    [{ sessionIdleMinutes: 4 }], [{ sessionIdleMinutes: 481 }], [{ sessionIdleMinutes: 30.5 }], [{ sessionIdleMinutes: '30' }],
    [{ aiHrAgreementTarget: 49 }], [{ aiHrAgreementTarget: 101 }], [{ lainnya: 1 }],
  ])('menolak %j tanpa mengubah apa pun', async (patch) => {
    const before = await settings.all();
    await expect(settings.update(actor, { aiHrAgreementTarget: 90, ...patch })).rejects.toMatchObject({ status: 400 });
    expect(await settings.all()).toEqual(before);
  });
});
