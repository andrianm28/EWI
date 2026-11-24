// Keputusan user 24 Nov (kartu "Block Super Admin from reading employee content in every module?" → ya):
// Super Admin (eta_admin) tidak membaca isi data karyawan di modul mana pun. Satu aturan inti
// (core/rbac denyEmployeeContent) dipasang di app.js pada setiap router data karyawan. Konsol platform,
// flag, dan sesi tetap terbuka. Jalan hanya bila DATABASE_URL di-set.
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { makeConfig, TEST_PASSWORD, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const ID = '00000000-0000-4000-8000-000000000001';

run('Super Admin tidak membaca isi data karyawan (Postgres)', () => {
  let db; let app; let tenant;
  const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const stores = createStores(db);
    app = createApp({ config, stores });
    const tokens = sessionSigner(config, stores.authSessions);
    const slug = `superisi-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Super isi') RETURNING id`, { replacements: { slug } });
    const hash = bcrypt.hashSync(TEST_PASSWORD, 4);
    for (const [key, role] of [['hr', 'hr_admin'], ['eta', 'eta_admin'], ['ani', 'learner']]) {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status, password_hash)
         VALUES (:t, :email, :key, :emp, :role, 'active', :hash) RETURNING id`,
        { replacements: { t: tenant.id, email: `${key}@superisi.test`, key, emp: `E-${key}`, role, hash } },
      );
      u[key] = row.id;
      tok[key] = await tokens.sign({ id: row.id, tenantId: tenant.id, role, email: `${key}@superisi.test` });
    }
    await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t: tenant.id } });
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id = :id', { replacements: { id: tenant.id }, transaction });
    });
    await db.close();
  });

  // Satu contoh baca isi per router data karyawan; penolakan terjadi sebelum flag/entitlement dan rute dicek.
  const READS = [
    ['ringkasan wawancara CCA', () => `/api/cca/assignments/${ID}/summary`],
    ['sintesis CCA', () => '/api/cca/synthesis'],
    ['temuan TNA', () => '/api/tna/findings'],
    ['sesi wawancara TNA', () => '/api/tna/sessions'],
    ['DNA', () => '/api/dna/career/decisions'],
    ['aksi INA', () => '/api/ina/actions'],
    ['Learning Intervention', () => '/api/li/drafts'],
    ['Learning Delivery', () => '/api/ld/trainings'],
    ['Learning Impact', () => '/api/lim/plans'],
    ['ekspor data karyawan', () => `/api/employees/${u.ani}/export`],
    ['dashboard', () => '/api/dashboard'],
    ['asisten', () => '/api/assistant'],
  ];

  it.each(READS)('%s: Super Admin 403 EMPLOYEE_CONTENT_PRIVATE', async (_label, path) => {
    const res = await request(app).get(path()).set(as('eta'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMPLOYEE_CONTENT_PRIVATE');
  });

  it('tulis atas nama karyawan juga ditolak', async () => {
    const res = await request(app).delete(`/api/employees/${u.ani}`).set(as('eta'));
    expect(res.body.error.code).toBe('EMPLOYEE_CONTENT_PRIVATE');
  });

  it('peran lain tidak kena aturan ini', async () => {
    for (const who of ['hr', 'ani']) {
      const res = await request(app).get(`/api/employees/${u.ani}/export`).set(as(who));
      expect(res.body.error?.code).not.toBe('EMPLOYEE_CONTENT_PRIVATE');
    }
  });

  it('jalur konfigurasi Super Admin tetap terbuka', async () => {
    expect((await request(app).get('/api/me/access').set(as('eta'))).status).toBe(200);
    expect((await request(app).get('/api/admin/flags').set(as('eta'))).status).toBe(200);
  });
});
