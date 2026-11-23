// B12: konsol Super Admin (/api/platform) di Postgres. Spek: docs/designs/b12-super-admin.md.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { memoryMailer } = require('../../src/integrations/mailer');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const BASE = '/api/platform';
const FORBIDDEN_KEYS = /"(answer|transcript|text|quote|summary)"/;

run('B12 Super Admin (Postgres)', () => {
  let db; let app; let tokens; let mailer; let stores; let config;
  const tok = {}; const id = {}; const T = {}; const created = [];
  const stamp = Date.now();
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const get = (path, who = 'super') => request(app).get(`${BASE}${path}`).set(as(who));
  const post = (path, body, who = 'super') => request(app).post(`${BASE}${path}`).set(as(who)).send(body);
  const put = (path, body, who = 'super') => request(app).put(`${BASE}${path}`).set(as(who)).send(body);
  const q = (sql, replacements = {}) => db.query(sql, { replacements, type: 'SELECT' });

  async function tenant(key, { status = 'active' } = {}) {
    const [[row]] = await db.query('INSERT INTO tenants (slug, name, status) VALUES (:slug, :name, :status) RETURNING id',
      { replacements: { slug: `b12-${key}-${stamp}`, name: `PT ${key} ${stamp}`, status } });
    T[key] = row.id; created.push(row.id);
    return row.id;
  }
  async function user(tenantKey, key, role, { status = 'active', login = true } = {}) {
    const [[row]] = await db.query(
      `INSERT INTO users (tenant_id, email, name, role, status) VALUES (:t, :email, :name, :role, :status) RETURNING id`,
      { replacements: { t: T[tenantKey], email: `${key}-${stamp}@b12.test`, name: key, role, status } });
    id[key] = row.id;
    if (login) tok[key] = await tokens.sign({ id: row.id, tenantId: T[tenantKey], role, email: `${key}-${stamp}@b12.test` });
    return row.id;
  }
  const setFlag = (tenantKey, key, enabled = true) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled)
     ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t: T[tenantKey], key, enabled } });

  beforeAll(async () => {
    config = makeConfig({ APP_BASE_URL: 'https://elgos.test', DATABASE_URL: process.env.DATABASE_URL, DB_SCHEMA: process.env.DB_SCHEMA || 'ewi' });
    db = createDb({ databaseUrl: config.databaseUrl, dbSchema: config.dbSchema });
    mailer = memoryMailer();
    stores = createStores(db, { encryption: config.encryption });
    app = createApp({ config, stores, mailer });
    tokens = sessionSigner(config, stores.authSessions);
    await tenant('eta');
    await user('eta', 'super', 'eta_admin');
    await user('eta', 'tadmin', 'tenant_admin');
    await user('eta', 'hr', 'hr_admin');
    await user('eta', 'staf', 'learner');
    await setFlag('eta', 'platform.console');
    // tenant contoh untuk status turunan
    await tenant('aktif'); await user('aktif', 'aktifAdm', 'tenant_admin', { login: false });
    await tenant('tunggu'); await user('tunggu', 'tungguAdm', 'hr_admin', { status: 'invited', login: false });
    await tenant('draf');
    await tenant('mati'); await user('mati', 'matiAdm', 'tenant_admin', { status: 'disabled', login: false });
    await tenant('beku', { status: 'suspended' }); await user('beku', 'bekuAdm', 'tenant_admin', { login: false });
    await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t: T.aktif } });
    await setFlag('aktif', 'module.tna'); await setFlag('aktif', 'module.li');
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query(`DELETE FROM tenants WHERE id IN (:ids) OR slug LIKE :api`, { replacements: { ids: created, api: `%-${stamp}` }, transaction });
    });
    await db.close();
  });

  describe('gerbang', () => {
    it.each(['tadmin', 'hr', 'staf'])('%s ditolak ROLE_FORBIDDEN, baik flag menyala maupun mati', async (who) => {
      const on = await get('/tenants', who);
      expect([on.status, on.body.error.code]).toEqual([403, 'ROLE_FORBIDDEN']);
      await setFlag('eta', 'platform.console', false);
      try {
        const off = await get('/tenants', who);
        expect([off.status, off.body.error.code]).toEqual([403, 'ROLE_FORBIDDEN']);
      } finally { await setFlag('eta', 'platform.console', true); }
    });

    it('Super Admin mendapat FEATURE_DISABLED saat platform.console mati', async () => {
      await setFlag('eta', 'platform.console', false);
      try {
        const res = await get('/tenants');
        expect([res.status, res.body.error.code]).toEqual([403, 'FEATURE_DISABLED']);
      } finally { await setFlag('eta', 'platform.console', true); }
    });

    it('tanpa token 401; path platform tak dikenal 404; :tenantId bukan UUID 404', async () => {
      expect((await request(app).get(`${BASE}/tenants`)).status).toBe(401);
      expect((await get('/tidak-ada')).status).toBe(404);
      expect((await get('/tenants/bukan-uuid/modules')).status).toBe(404);
      expect((await get('/tenants/00000000-0000-4000-8000-000000000000/modules')).status).toBe(404);
    });
  });

  describe('daftar tenant', () => {
    it('status turunan, admin, pengguna, dan modul aktif', async () => {
      const res = await get('/tenants');
      expect(res.status).toBe(200);
      const row = (key) => res.body.data.tenants.find((t) => t.id === T[key]);
      expect(row('aktif')).toMatchObject({ status: 'active', adminEmail: `aktifAdm-${stamp}@b12.test`, users: 1, activeModules: 2 });
      expect(row('tunggu')).toMatchObject({ status: 'pending_admin', adminEmail: `tungguAdm-${stamp}@b12.test` });
      expect(row('draf')).toMatchObject({ status: 'draft', adminEmail: null, users: 0, activeModules: 0 });
      expect(row('mati')).toMatchObject({ status: 'draft', users: 0 });
      expect(row('beku')).toMatchObject({ status: 'suspended' });
      expect(res.body.data.kpis).toMatchObject({ modulesAvailable: 8 });
      expect(res.body.data.kpis.tenants).toBeGreaterThanOrEqual(6);
      expect(JSON.stringify(res.body)).not.toMatch(FORBIDDEN_KEYS);
    });
  });

  describe('modul tenant', () => {
    const platformLogs = (target, resource) => q(
      'SELECT action, resource, actor_user_id AS "actorUserId", meta FROM platform_audit_logs WHERE target_tenant_id = :t AND resource = :resource ORDER BY id',
      { t: target, resource });

    it('panel menampilkan delapan modul dengan akses, flag, kill switch, dan efektif', async () => {
      const res = await get(`/tenants/${T.aktif}/modules`);
      expect(res.body.data.map((m) => m.key)).toEqual(['cca', 'dna', 'tna', 'ina', 'li', 'ld', 'lim', 'promotion']);
      expect(res.body.data.find((m) => m.key === 'tna')).toMatchObject({ entitled: true, flagOn: true, killSwitch: false, effective: true });
      expect(res.body.data.find((m) => m.key === 'promotion')).toMatchObject({ entitled: null, flagOn: false, effective: false });
      expect(res.body.data.find((m) => m.key === 'cca')).toMatchObject({ earlyAccess: true });
    });

    it('menyalakan TNA: entitlement platform, flag, audit tenant sasaran, log platform', async () => {
      const res = await put(`/tenants/${T.draf}/modules/tna`, { enabled: true });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ key: 'tna', entitled: true, flagOn: true, effective: true });
      expect(await q("SELECT product, source FROM entitlements WHERE tenant_id = :t", { t: T.draf })).toEqual([{ product: 'tna', source: 'platform' }]);
      const audits = await q('SELECT user_id AS "userId", action, resource, meta FROM audit_logs WHERE tenant_id = :t ORDER BY id', { t: T.draf });
      expect(audits.at(-1)).toMatchObject({ userId: null, action: 'update', resource: 'tenant.module',
        meta: { actor: 'Super Admin ELGOS', actorUserId: id.super, via: 'api/platform', module: 'tna', enabled: true } });
      expect(await platformLogs(T.draf, 'tenant.module')).toEqual([
        expect.objectContaining({ action: 'update', actorUserId: id.super, meta: expect.objectContaining({ module: 'tna', enabled: true }) })]);
      // mematikan: flag mati, entitlement tetap
      const off = await put(`/tenants/${T.draf}/modules/tna`, { enabled: false });
      expect(off.body.data).toMatchObject({ flagOn: false, effective: false, entitled: true });
    });

    it('full_suite tidak digandakan; kill switch tampil; li tanpa full_suite tidak berentitlement', async () => {
      await put(`/tenants/${T.aktif}/modules/dna`, { enabled: true }).expect(200);
      expect(await q("SELECT product FROM entitlements WHERE tenant_id = :t", { t: T.aktif })).toEqual([{ product: 'full_suite' }]);
      await db.query("INSERT INTO feature_kill_switches (key, active, reason) VALUES ('module.dna', true, 'uji B12') ON CONFLICT (key) DO UPDATE SET active = true");
      try {
        const row = (await get(`/tenants/${T.aktif}/modules`)).body.data.find((m) => m.key === 'dna');
        expect(row).toMatchObject({ flagOn: true, killSwitch: true, effective: false });
      } finally { await db.query("UPDATE feature_kill_switches SET active = false WHERE key = 'module.dna'"); }
      const li = await put(`/tenants/${T.tunggu}/modules/li`, { enabled: true });
      expect(li.body.data).toMatchObject({ flagOn: true, entitled: false, effective: false });
    });

    it('validasi: kunci tak dikenal 404, enabled bukan boolean 400', async () => {
      expect((await put(`/tenants/${T.draf}/modules/xyz`, { enabled: true })).status).toBe(404);
      expect((await put(`/tenants/${T.draf}/modules/tna`, { enabled: 'ya' })).status).toBe(400);
    });

    it('audit gagal: flag dan entitlement tidak berubah (satu transaksi)', async () => {
      await db.query(`ALTER TABLE audit_logs ADD CONSTRAINT b12_tolak_uji CHECK (resource <> 'tenant.module') NOT VALID`);
      try {
        expect((await put(`/tenants/${T.mati}/modules/ina`, { enabled: true })).status).toBe(500);
      } finally { await db.query('ALTER TABLE audit_logs DROP CONSTRAINT b12_tolak_uji'); }
      expect(await q("SELECT key FROM feature_flags WHERE tenant_id = :t", { t: T.mati })).toEqual([]);
      expect(await q("SELECT product FROM entitlements WHERE tenant_id = :t", { t: T.mati })).toEqual([]);
      expect(await platformLogs(T.mati, 'tenant.module')).toEqual([]);
    });
  });
  describe('buat tenant', () => {
    const name = (key) => `PT ${key} ${stamp}`;
    const slugOf = (key) => `pt-${key}-${stamp}`;
    const tenantBySlug = async (slug) => (await q('SELECT id, name, status FROM tenants WHERE slug = :slug', { slug }))[0];

    it('Periksa (dryRun): slug dan laporan tanpa menyimpan', async () => {
      const res = await post('/tenants?dryRun=1', { name: `PT Périksa ${stamp}`, adminEmail: `admin-periksa-${stamp}@contoh.test` });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ slug: slugOf('periksa'), exists: false });
      expect(res.body.data.report.map((r) => r.step)).toContain('tenant');
      expect(await tenantBySlug(slugOf('periksa'))).toBeUndefined();
    });

    it('membuat tenant: tenant_admin invited, undangan terkirim, audit tenant berpelaku, log platform', async () => {
      const before = mailer.sent.length;
      const email = `admin-contoh-${stamp}@contoh.test`;
      const res = await post('/tenants', { name: name('Contoh'), adminEmail: email, adminName: 'Admin Contoh' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ slug: slugOf('contoh'), invitation: 'sent',
        tenant: { slug: slugOf('contoh'), name: name('Contoh'), status: 'pending_admin' } });
      const tid = res.body.data.tenant.id;
      expect(await q('SELECT email, role, status FROM users WHERE tenant_id = :t', { t: tid }))
        .toEqual([{ email, role: 'tenant_admin', status: 'invited' }]);
      expect(mailer.sent.slice(before).map((m) => m.to)).toEqual([email]);
      expect(await q("SELECT purpose FROM login_links WHERE tenant_id = :t", { t: tid })).toEqual([{ purpose: 'invite' }]);
      const audits = await q('SELECT user_id AS "userId", action, resource, meta FROM audit_logs WHERE tenant_id = :t ORDER BY id', { t: tid });
      expect(audits[0]).toMatchObject({ userId: null, action: 'create', resource: 'tenant.onboarding',
        meta: { actor: 'Super Admin ELGOS', actorUserId: id.super, via: 'api/platform' } });
      expect(audits.map((a) => `${a.action} ${a.resource}`)).toContain('create invitation');
      expect(await q('SELECT action, resource, actor_user_id AS "actorUserId" FROM platform_audit_logs WHERE target_tenant_id = :t', { t: tid }))
        .toEqual([{ action: 'create', resource: 'tenant', actorUserId: id.super }]);
      // tidak ada entitlement atau flag: modul dinyalakan terpisah
      expect(await q('SELECT product FROM entitlements WHERE tenant_id = :t', { t: tid })).toEqual([]);
    });

    it('slug atau id yang sudah ada: 409 TENANT_EXISTS tanpa mengubah tenant lama; dryRun memberi exists', async () => {
      const again = await post('/tenants', { name: name('Contoh'), adminEmail: `lain-${stamp}@contoh.test` });
      expect([again.status, again.body.error.code]).toEqual([409, 'TENANT_EXISTS']);
      const check = await post('/tenants?dryRun=1', { name: name('Contoh'), adminEmail: `lain-${stamp}@contoh.test` });
      expect(check.body.data).toMatchObject({ exists: true });
      const byId = await post('/tenants', { id: T.aktif, name: name('Baru'), adminEmail: `baru-${stamp}@contoh.test` });
      expect([byId.status, byId.body.error.code]).toEqual([409, 'TENANT_EXISTS']);
      expect((await q('SELECT name FROM tenants WHERE id = :t', { t: T.aktif }))[0].name).toBe(`PT aktif ${stamp}`);
      expect(await tenantBySlug(slugOf('baru'))).toBeUndefined();
    });

    it('validasi: email salah dan nama tanpa huruf/angka 400; slug yang dipotong tidak berakhir -', async () => {
      expect((await post('/tenants', { name: name('Salah'), adminEmail: 'bukan-email' })).status).toBe(400);
      const empty = await post('/tenants?dryRun=1', { name: '!!! ***', adminEmail: `x-${stamp}@contoh.test` });
      expect([empty.status, empty.body.error.message]).toEqual([400, 'Nama perusahaan harus memuat huruf atau angka']);
      const long = await post('/tenants?dryRun=1', { name: `${'a'.repeat(63)} b ${stamp}`, adminEmail: `x-${stamp}@contoh.test` });
      expect(long.body.data.slug).toBe('a'.repeat(63));
    });

    it('log platform gagal: tenant batal dibuat', async () => {
      await db.query(`ALTER TABLE platform_audit_logs ADD CONSTRAINT b12_tolak_uji CHECK (resource <> 'tenant') NOT VALID`);
      try {
        expect((await post('/tenants', { name: name('Batal'), adminEmail: `batal-${stamp}@contoh.test` })).status).toBe(500);
      } finally { await db.query('ALTER TABLE platform_audit_logs DROP CONSTRAINT b12_tolak_uji'); }
      expect(await tenantBySlug(slugOf('batal'))).toBeUndefined();
    });

    it('mailer gagal: invitation failed, tenant tetap ada', async () => {
      const send = mailer.send;
      mailer.send = async () => { throw new Error('SES mati'); };
      try {
        const res = await post('/tenants', { name: name('Surat'), adminEmail: `surat-${stamp}@contoh.test` });
        expect([res.status, res.body.data.invitation]).toEqual([201, 'failed']);
      } finally { mailer.send = send; }
      expect(await tenantBySlug(slugOf('surat'))).toMatchObject({ status: 'active' });
    });
  });
});
