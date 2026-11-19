// PK-07 / P1-7: API berjalan dengan role aplikasi non-superuser. Butuh DATABASE_URL milik user yang boleh
// CREATE ROLE (CI: superuser container) dan migrasi sudah dijalankan.
const crypto = require('crypto');
const request = require('supertest');
const { QueryTypes } = require('sequelize');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { applyAppRole } = require('../../src/db/app-role');
const { checkUndo } = require('../../src/db/undo-guard');
const { createApp } = require('../../src/app');
const { createFieldCipher, createProvider } = require('../../src/core/crypto');
const { makeConfig } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const schema = process.env.DB_SCHEMA || 'ewi';

run('role aplikasi non-superuser (Postgres)', () => {
  const role = `elgos_app_it_${crypto.randomBytes(4).toString('hex')}`;
  const password = crypto.randomBytes(16).toString('hex');
  let owner; let app; let tenantId;
  const sel = (db, sql, replacements) => db.query(sql, { type: QueryTypes.SELECT, replacements });

  beforeAll(async () => {
    owner = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: schema });
    await owner.query(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);
    await applyAppRole({ query: (sql) => owner.query(sql, { type: sql.trim().startsWith('SELECT') ? QueryTypes.SELECT : QueryTypes.RAW }), schema, role });
    const u = new URL(process.env.DATABASE_URL);
    u.username = role; u.password = password;
    app = createDb({ databaseUrl: u.toString(), dbSchema: schema });
    const [t] = await sel(owner, `INSERT INTO tenants (slug, name) VALUES (:s, 'Role IT') RETURNING id`, { s: `role-it-${Date.now()}` });
    tenantId = t.id;
  });

  afterAll(async () => {
    await app.close();
    await owner.transaction(async (transaction) => {
      await owner.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await owner.query('DELETE FROM tenant_keys WHERE tenant_id = :t', { replacements: { t: tenantId }, transaction });
      await owner.query('DELETE FROM tenants WHERE id = :t', { replacements: { t: tenantId }, transaction });
    });
    await applyAppRole({ query: (sql) => owner.query(sql, { type: sql.trim().startsWith('SELECT') ? QueryTypes.SELECT : QueryTypes.RAW }), schema, role, mode: 'revoke' });
    await owner.query(`DROP ROLE "${role}"`);
    await owner.close();
  });

  it('terhubung sebagai role non-superuser', async () => {
    const [r] = await sel(app, 'SELECT current_user AS u, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS s');
    expect(r).toEqual({ u: role, s: false });
  });

  it('boleh DML biasa pada tabel bisnis', async () => {
    await app.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'P')`, { replacements: { t: tenantId } });
    await app.query(`UPDATE lna_projects SET name = 'P2' WHERE tenant_id = :t`, { replacements: { t: tenantId } });
    await app.query('DELETE FROM lna_projects WHERE tenant_id = :t', { replacements: { t: tenantId } });
  });

  it('audit_logs: boleh INSERT dan SELECT; UPDATE, DELETE, TRUNCATE ditolak oleh hak (bukan hanya trigger)', async () => {
    await app.query(`INSERT INTO audit_logs (tenant_id, action, resource) VALUES (:t, 'read', 'uji')`, { replacements: { t: tenantId } });
    expect((await sel(app, 'SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = :t', { t: tenantId }))[0].n).toBe(1);
    await expect(app.query(`UPDATE audit_logs SET resource = 'x' WHERE tenant_id = :t`, { replacements: { t: tenantId } })).rejects.toThrow(/permission denied/);
    await expect(app.query('DELETE FROM audit_logs WHERE tenant_id = :t', { replacements: { t: tenantId } })).rejects.toThrow(/permission denied/);
    await expect(app.query('TRUNCATE audit_logs')).rejects.toThrow(/permission denied/);
  });

  it('saklar pemeliharaan audit tidak menolong role aplikasi', async () => {
    await expect(app.transaction(async (transaction) => {
      await app.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await app.query('DELETE FROM audit_logs WHERE tenant_id = :t', { replacements: { t: tenantId }, transaction });
    })).rejects.toThrow(/permission denied/);
  });

  it('hapus user berhasil sebagai role aplikasi: aksi FK ON DELETE SET NULL berjalan sebagai pemilik tabel', async () => {
    // Hak UPDATE audit_logs dicabut dari role aplikasi, tetapi aksi FK tetap jalan. Migrasi 20261117000502 (PK-15)
    // mengizinkan UPDATE yang hanya mengosongkan user_id, jadi baris audit tetap ada dengan user_id NULL.
    const [u] = await sel(owner, `INSERT INTO users (tenant_id, email, name, role) VALUES (:t, :e, 'FK', 'learner') RETURNING id`, { t: tenantId, e: `fk-${Date.now()}@elgos.test` });
    const [a] = await sel(owner, `INSERT INTO audit_logs (tenant_id, user_id, action, resource) VALUES (:t, :u, 'read', 'fk') RETURNING id`, { t: tenantId, u: u.id });
    await app.query('DELETE FROM users WHERE id = :u', { replacements: { u: u.id } });
    expect(await sel(app, 'SELECT id FROM users WHERE id = :u', { u: u.id })).toEqual([]);
    const [row] = await sel(app, 'SELECT user_id AS "userId", resource FROM audit_logs WHERE id = :a', { a: a.id });
    expect(row).toEqual({ userId: null, resource: 'fk' });
    // UPDATE langsung oleh aplikasi pada audit_logs tetap ditolak hak, termasuk hanya mengosongkan user_id
    await expect(app.query('UPDATE audit_logs SET user_id = NULL WHERE id = :a', { replacements: { a: a.id } })).rejects.toThrow(/permission denied/);
  });

  it('tanpa DDL: tidak bisa membuat tabel, mengubah tabel, atau mematikan trigger audit', async () => {
    await expect(app.query('CREATE TABLE coba_ddl (id int)')).rejects.toThrow(/permission denied/);
    await expect(app.query('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update')).rejects.toThrow(/must be owner/);
    await expect(app.query('DROP TABLE lna_projects')).rejects.toThrow(/must be owner/);
  });

  it('riwayat migrasi hanya bisa dibaca', async () => {
    expect((await sel(app, 'SELECT count(*)::int AS n FROM sequelize_meta'))[0].n).toBeGreaterThan(0);
    await expect(app.query(`INSERT INTO sequelize_meta (name) VALUES ('palsu.js')`)).rejects.toThrow(/permission denied/);
  });

  it('API berjalan dengan role ini: /api/ready 200, enkripsi membuat kunci tenant', async () => {
    const config = makeConfig();
    const stores = createStores(app, { encryption: config.encryption });
    // Suite lain berjalan paralel di database yang sama dengan kunci induk acak per proses, jadi DEK "terbaru"
    // bisa milik proses lain. Pemeriksaan kesiapan di sini dibatasi ke kunci tenant uji ini.
    const enc = await stores.cipher.encrypt(tenantId, 'uji');
    expect(await stores.cipher.decrypt(tenantId, enc)).toBe('uji');
    const keyRow = await sel(app, 'SELECT tenant_id AS "tenantId", version, key_ref AS "keyRef", wrapped_key AS "wrappedKey" FROM tenant_keys WHERE tenant_id = :t', { t: tenantId });
    expect(keyRow).toHaveLength(1);
    const scoped = createFieldCipher({ provider: createProvider(config.encryption), keyStore: { any: async () => keyRow[0], get: async () => keyRow[0], insert: async () => keyRow[0] } });
    const res = await request(createApp({ config, stores: { ...stores, cipher: scoped } })).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.checks).toEqual({ database: 'ok', encryption: 'ok' });
  });

  it('pengaman undo membaca data terenkripsi lewat database nyata', async () => {
    const refusals = await checkUndo((sql) => sel(owner, sql), ['20261113000008-tenant-keys.js']);
    expect(refusals).toHaveLength(1);
    expect(refusals[0].reason).toMatch(/kunci tenant/);
  });

  it('/api/ready 503 bila database mati', async () => {
    const dead = createDb({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none', dbSchema: schema });
    const config = makeConfig();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(createApp({ config, stores: createStores(dead, { encryption: config.encryption }) })).get('/api/ready');
    spy.mockRestore();
    await dead.close();
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready', checks: { database: 'gagal', encryption: 'gagal' } });
  });
});
