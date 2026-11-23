// B2: peran per akun, trigger sinkron, penjaga akun istimewa, dan isi wawancara tertutup untuk Super Admin (Postgres).
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

run('B2 peran (Postgres)', () => {
  let db; let app; let stores; let signer;
  const t = {}; const u = {};
  const sign = (key, tenant, role) => signer.sign({ id: u[key], tenantId: t[tenant], role, email: `${key}@roles.test` });
  const rolesOf = async (key) => (await db.query('SELECT role FROM user_roles WHERE user_id = :id ORDER BY role', { replacements: { id: u[key] } }))[0].map((r) => r.role);
  const addUser = async (key, tenant, role, status = 'active') => {
    const [[row]] = await db.query(
      `INSERT INTO users (tenant_id, email, name, role, status, employee_id) VALUES (:t, :email, :key, :role, :status, :key) RETURNING id`,
      { replacements: { t: t[tenant], email: `${key}@roles.test`, key, role, status } });
    u[key] = row.id;
  };

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    app = createApp({ config, stores });
    signer = sessionSigner(config, stores.authSessions);
    for (const key of ['a', 'b']) {
      const [[row]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, :slug) RETURNING id`, { replacements: { slug: `roles-${key}-${Date.now()}` } });
      t[key] = row.id;
    }
    await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'auth.multi_role', true), (:t, 'module.tna', true)`, { replacements: { t: t.a } });
    await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'tna')`, { replacements: { t: t.a } });
    await addUser('admin', 'a', 'tenant_admin'); await addUser('admin2', 'a', 'tenant_admin');
    await addUser('hr', 'a', 'hr_admin'); await addUser('spv', 'a', 'supervisor'); await addUser('dimas', 'a', 'learner');
    await addUser('eta', 'a', 'eta_admin'); await addUser('adminb', 'b', 'tenant_admin'); await addUser('budi', 'b', 'learner');
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [t.a, t.b] }, transaction });
    });
    await db.close();
  });

  it('trigger: akun baru mendapat baris peran utama; mengganti users.role mengganti baris itu', async () => {
    expect(await rolesOf('spv')).toEqual(['supervisor']);
    await db.query(`UPDATE users SET role = 'learner' WHERE id = :id`, { replacements: { id: u.spv } });
    expect(await rolesOf('spv')).toEqual(['learner']);
    await db.query(`UPDATE users SET role = 'supervisor' WHERE id = :id`, { replacements: { id: u.spv } });
    expect(await rolesOf('spv')).toEqual(['supervisor']);
  });

  it('baris peran tidak bisa menunjuk user di tenant lain (FK komposit)', async () => {
    await expect(db.query(`INSERT INTO user_roles (tenant_id, user_id, role) VALUES (:t, :id, 'hr_admin')`, { replacements: { t: t.b, id: u.dimas } }))
      .rejects.toThrow(/foreign key/i);
  });

  it('Admin Tenant memberi peran tambahan; akun itu lalu bisa pindah tampilan', async () => {
    const admin = await sign('admin', 'a', 'tenant_admin');
    const put = await request(app).put(`/api/users/${u.spv}/roles`).set(bearer(admin)).send({ roles: ['supervisor', 'hr_admin'], primary: 'supervisor' });
    expect(put.status).toBe(200);
    expect(put.body.data).toMatchObject({ primary: 'supervisor', roles: ['hr_admin', 'supervisor'] });
    expect(put.body.data.views.map((v) => v.role)).toEqual(['hr_admin', 'supervisor', 'learner']);
    expect((await request(app).get(`/api/users/${u.spv}/roles`).set(bearer(await sign('hr', 'a', 'hr_admin')))).body.data.roles).toEqual(['hr_admin', 'supervisor']);

    const spv = await sign('spv', 'a', 'supervisor');
    const sw = await request(app).post('/api/auth/switch-role').set(bearer(spv)).send({ role: 'hr_admin' });
    expect(sw.status).toBe(200);
    expect((await request(app).get('/api/me/access').set(bearer(sw.body.token))).body).toMatchObject({ role: 'hr_admin', view: 'hr' });
    const [[sess]] = await db.query(`SELECT active_role, role_version FROM auth_sessions WHERE user_id = :id AND role_version > 0`, { replacements: { id: u.spv } });
    expect(sess).toEqual({ active_role: 'hr_admin', role_version: 1 });

    // peran dicabut: sesi yang sedang memakai peran itu langsung ditolak
    await request(app).put(`/api/users/${u.spv}/roles`).set(bearer(admin)).send({ roles: ['supervisor'], primary: 'supervisor' });
    expect((await request(app).get('/api/auth/me').set(bearer(sw.body.token))).status).toBe(401);
    const [audit] = await db.query(`SELECT meta->'to'->'roles' AS roles FROM audit_logs WHERE tenant_id = :t AND resource = 'user.roles' ORDER BY id`, { replacements: { t: t.a } });
    expect(audit.map((a) => a.roles)).toEqual([['hr_admin', 'supervisor'], ['supervisor']]);
  });

  it('PUT roles: validasi, diri sendiri, Super Admin, isolasi tenant, dan hak akses', async () => {
    const admin = await sign('admin', 'a', 'tenant_admin');
    const put = (id, body, tok = admin) => request(app).put(`/api/users/${id}/roles`).set(bearer(tok)).send(body);
    for (const body of [{}, { roles: [], primary: 'learner' }, { roles: ['learner', 'learner'], primary: 'learner' },
      { roles: ['eta_admin'], primary: 'eta_admin' }, { roles: ['ngawur'], primary: 'ngawur' }, { roles: ['learner'], primary: 'hr_admin' }]) {
      expect((await put(u.dimas, body)).status).toBe(400);
    }
    expect((await put(u.admin, { roles: ['tenant_admin', 'hr_admin'], primary: 'tenant_admin' })).body.error.code).toBe('SELF_ROLE_CHANGE');
    expect((await put(u.eta, { roles: ['learner'], primary: 'learner' })).body.error.code).toBe('ROLE_PROTECTED');
    expect((await put(u.budi, { roles: ['hr_admin'], primary: 'hr_admin' })).status).toBe(404); // akun tenant lain
    expect(await rolesOf('budi')).toEqual(['learner']);
    expect((await put(u.dimas, { roles: ['hr_admin'], primary: 'hr_admin' }, await sign('hr', 'a', 'hr_admin'))).status).toBe(403);
    expect((await request(app).get(`/api/users/${u.dimas}/roles`).set(bearer(await sign('dimas', 'a', 'learner')))).status).toBe(403);
    // Super Admin boleh (jalur membuat Admin Tenant pertama)
    expect((await put(u.dimas, { roles: ['learner', 'tenant_admin'], primary: 'learner' }, await sign('eta', 'a', 'eta_admin'))).status).toBe(200);
    await put(u.dimas, { roles: ['learner'], primary: 'learner' });
  });

  it('Admin Tenant terakhir tidak bisa dicabut, juga saat dua permintaan datang bersamaan', async () => {
    const admin = await sign('admin', 'a', 'tenant_admin');
    const admin2 = await sign('admin2', 'a', 'tenant_admin');
    const demote = (id, tok) => request(app).put(`/api/users/${id}/roles`).set(bearer(tok)).send({ roles: ['learner'], primary: 'learner' });
    const [x, y] = await Promise.all([demote(u.admin2, admin), demote(u.admin, admin2)]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect([x.body, y.body].find((b) => b.error).error.code).toBe('LAST_TENANT_ADMIN');
    const [[{ n }]] = await db.query(`SELECT count(*)::int AS n FROM user_roles WHERE tenant_id = :t AND role = 'tenant_admin'`, { replacements: { t: t.a } });
    expect(n).toBe(1);
  });

  it('akun istimewa (peran di user_roles) tidak diubah impor dan tidak diundang lewat jalur karyawan', async () => {
    await db.query(`INSERT INTO user_roles (tenant_id, user_id, role) VALUES (:t, :id, 'hr_admin')`, { replacements: { t: t.a, id: u.spv } });
    const existing = await stores.people.resolve(t.a, { employeeIds: ['spv', 'dimas'], emails: [] });
    expect(Object.fromEntries(existing.map((e) => [e.employeeId, e.privileged]))).toEqual({ spv: true, dimas: false });
    await stores.people.importEmployees(t.a, [{ id: u.spv, employeeId: 'spv', name: 'diubah', email: 'spv@roles.test', role: 'learner' }]);
    const [[row]] = await db.query('SELECT name, role FROM users WHERE id = :id', { replacements: { id: u.spv } });
    expect(row).toEqual({ name: 'spv', role: 'supervisor' });
    const invitees = (await stores.users.listInvitees(t.a, {})).map((i) => i.id);
    expect(invitees).toContain(u.dimas);
    expect(invitees).not.toContain(u.spv);
    expect(invitees).not.toContain(u.hr);
  });

  it('Super Admin tidak ikut percakapan wawancara atau menutup sesi; status sesi tetap lewat pemeriksaan biasa', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const eta = await sign('eta', 'a', 'eta_admin');
    for (const path of ['/turns', '/complete']) {
      const r = await request(app).post(`/api/tna/sessions/${id}${path}`).set(bearer(eta)).send({});
      expect([r.status, r.body.error.code]).toEqual([403, 'INTERVIEW_CONTENT_PRIVATE']);
    }
    expect((await request(app).get(`/api/tna/sessions/${id}`).set(bearer(eta))).status).toBe(404); // status sesi: bukan 403
    expect((await request(app).get(`/api/tna/sessions/${id}/transcript`).set(bearer(await sign('hr', 'a', 'hr_admin')))).status).toBe(404);
    expect((await request(app).get('/api/tna/sessions').set(bearer(eta))).status).toBe(200);
  });
});
