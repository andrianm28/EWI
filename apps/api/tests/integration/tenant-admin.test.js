// B11: Admin Tenant (pengguna & peran, jabatan & kamus, impor & integrasi) di Postgres.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { memoryMailer } = require('../../src/integrations/mailer');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const BASE = '/api/tenant-admin';

run('Admin Tenant B11 (Postgres)', () => {
  let db; let app; let tokens; let mailer; let stores; let A; let B; let slugA;
  const tok = {}; const id = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const get = (path, who = 'admin') => request(app).get(`${BASE}${path}`).set(as(who));
  const post = (path, body, who = 'admin') => request(app).post(`${BASE}${path}`).set(as(who)).send(body);
  const patch = (path, body, who = 'admin') => request(app).patch(`${BASE}${path}`).set(as(who)).send(body);
  const upload = (sm, kind, filename, lines, who = 'admin') => request(app)
    .post(`${BASE}/imports/${sm}/${kind}?filename=${encodeURIComponent(filename)}`)
    .set(as(who)).set('Content-Type', 'application/octet-stream').send(Buffer.from(`${lines.join('\n')}\n`));
  const audits = (tenantId, resource) => db.query(
    'SELECT action, resource, meta FROM audit_logs WHERE tenant_id = :t AND resource = :resource ORDER BY id',
    { replacements: { t: tenantId, resource }, type: 'SELECT' });

  async function addUser(tenantId, key, role, extra = {}) {
    const [[row]] = await db.query(
      `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, :email, :name, :emp, :role, :status) RETURNING id`,
      { replacements: { t: tenantId, email: `${key}@b11.test`, name: key, emp: extra.emp || null, role, status: extra.status || 'active' } });
    id[key] = row.id;
    tok[key] = await tokens.sign({ id: row.id, tenantId, role, email: `${key}@b11.test` });
    return row.id;
  }

  beforeAll(async () => {
    const config = makeConfig({
      APP_BASE_URL: 'https://elgos.test', ELITEMENTOR_API_URL: 'https://em.test/api', ELITEMENTOR_TOKEN_URL: 'https://em.test/token',
      ELITEMENTOR_CLIENT_ID: 'elgos', ELITEMENTOR_CLIENT_SECRET: 'rahasia-klien-jangan-bocor',
    });
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    mailer = memoryMailer();
    stores = createStores(db);
    app = createApp({ config, stores, mailer });
    tokens = sessionSigner(config, stores.authSessions);
    slugA = `b11-${Date.now()}`;
    [[A]] = await db.query(`INSERT INTO tenants (slug, name, elitementor_organization_id) VALUES (:slug, 'Tenant A', 77) RETURNING id`, { replacements: { slug: slugA } });
    [[B]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Tenant B') RETURNING id`, { replacements: { slug: `${slugA}-b` } });
    await addUser(A.id, 'admin', 'hr_admin');
    await addUser(A.id, 'eta', 'eta_admin');
    await addUser(A.id, 'spv', 'supervisor', { emp: 'E-1' });
    await addUser(A.id, 'staf', 'learner', { emp: 'E-2' });
    await addUser(A.id, 'pim', 'pimpinan');
    await addUser(B.id, 'adminB', 'hr_admin');
    await addUser(B.id, 'stafB', 'learner');
    // token yang mengaku tenant_admin padahal di DB masih karyawan: gerbang membaca peran dari DB
    tok.fakeAdmin = await tokens.sign({ id: id.staf, tenantId: A.id, role: 'tenant_admin', email: 'staf@b11.test' });
    await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:a, 'dna'), (:b, 'full_suite')`, { replacements: { a: A.id, b: B.id } });
    await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:b, 'admin.tenant', true)`, { replacements: { b: B.id } });
    const [[jr]] = await db.query(`INSERT INTO lna_job_roles (tenant_id, name) VALUES (:b, 'Jabatan B') RETURNING id`, { replacements: { b: B.id } });
    id.jobB = jr.id;
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [A.id, B.id] }, transaction });
    });
    await db.close();
  });

  it('flag admin.tenant mati: semua rute ditolak', async () => {
    for (const res of [await get('/users'), await get('/job-roles'), await get('/imports/summary'), await post('/users', {}), await get('/imports/dna/templates')]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FEATURE_DISABLED');
    }
    await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:a, 'admin.tenant', true)`, { replacements: { a: A.id } });
    expect((await get('/users')).status).toBe(200);
  });

  it('hanya admin tenant: karyawan, atasan, pimpinan ditolak; hr_admin (sementara) dan eta_admin lolos; peran dibaca dari DB', async () => {
    for (const who of ['staf', 'spv', 'pim']) {
      const res = await get('/users', who);
      expect([who, res.status, res.body.error.code]).toEqual([who, 403, 'ROLE_FORBIDDEN']);
    }
    for (const who of ['admin', 'eta']) expect([who, (await get('/users', who)).status]).toEqual([who, 200]);
    // B2: sesi yang memakai peran di luar peran akunnya ditolak sejak autentikasi (401), bukan baru di gerbang peran
    expect((await get('/users', 'fakeAdmin')).body.error.code).toBe('UNAUTHORIZED');
    // admin yang diturunkan atau dinonaktifkan kehilangan akses walau tokennya masih berlaku
    await addUser(A.id, 'eks', 'hr_admin');
    expect((await get('/users', 'eks')).status).toBe(200);
    await db.query(`UPDATE users SET status = 'disabled' WHERE id = :id`, { replacements: { id: id.eks } });
    // PK-16/B2: sesi akun nonaktif atau yang kehilangan perannya ditutup sejak autentikasi (401)
    expect((await get('/users', 'eks')).status).toBe(401);
    await db.query(`UPDATE users SET status = 'active', role = 'learner' WHERE id = :id`, { replacements: { id: id.eks } });
    expect((await post('/users', { email: 'x@b11.test', name: 'X', role: 'hr_admin' }, 'eks')).status).toBe(401);
    await db.query('DELETE FROM users WHERE id = :id', { replacements: { id: id.eks } });
    expect((await request(app).get(`${BASE}/users`)).status).toBe(401);
  });

  it('daftar pengguna dan peran yang boleh diberikan', async () => {
    const res = await get('/users');
    expect(res.body.meta).toEqual({ total: 5, sso: false });
    expect(res.body.data.map((u) => u.email).sort()).toEqual(['admin@b11.test', 'eta@b11.test', 'pim@b11.test', 'spv@b11.test', 'staf@b11.test']);
    expect(res.body.data.find((u) => u.email === 'spv@b11.test')).toMatchObject({ role: 'supervisor', status: 'active', employeeId: 'E-1', jobRoleName: null });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    expect((await get('/users?q=STAF')).body.data.map((u) => u.email)).toEqual(['staf@b11.test']);
    const roles = (await get('/roles')).body.data;
    expect(roles.map((r) => r.key)).not.toContain('eta_admin');
    expect(roles.find((r) => r.key === 'supervisor')).toEqual({ key: 'supervisor', label: 'Atasan' });
  });

  it('jabatan: buat, nama kembar ditolak, ubah, hitungan kamus dan pegawai', async () => {
    const made = await post('/job-roles', { name: 'Engineer Service Delivery', division: 'Service Delivery', levels: [{ name: 'Junior', programTier: 'basic' }, { name: 'Senior' }] });
    expect(made.status).toBe(201);
    id.job = made.body.data.id; id.level = made.body.data.levels[0].id;
    expect((await post('/job-roles', { name: 'engineer service delivery' })).body.error.code).toBe('DUPLICATE');
    expect((await post('/job-roles', { name: ' ' })).status).toBe(400);
    expect((await post('/job-roles', { name: 'X', levels: [{ name: 'L', programTier: 'expert' }] })).status).toBe(400);
    const other = await post('/job-roles', { name: 'Account Manager' });
    expect((await patch(`/job-roles/${other.body.data.id}`, { name: 'Engineer Service Delivery' })).body.error.code).toBe('DUPLICATE');
    expect((await patch(`/job-roles/${other.body.data.id}`, { division: 'Sales' })).body.data).toMatchObject({ name: 'Account Manager', division: 'Sales' });
    expect((await patch(`/job-roles/${id.jobB}`, { division: 'X' })).status).toBe(404);

    await db.query(`INSERT INTO lna_competencies (tenant_id, job_role_id, kind, name, source) VALUES (:a, :j, 'job', 'Triase tiket', 'dacum')`, { replacements: { a: A.id, j: id.job } });
    await db.query('UPDATE users SET job_role_id = :j WHERE id IN (:ids)', { replacements: { j: id.job, ids: [id.staf, id.spv] } });
    const rows = (await get('/job-roles')).body.data;
    expect(rows.find((r) => r.id === id.job)).toMatchObject({ dictionary: 'tersedia', competencyCount: 1, employeeCount: 2, sources: ['dacum'], lastImport: null });
    expect(rows.find((r) => r.name === 'Account Manager')).toMatchObject({ dictionary: 'belum_tersedia', competencyCount: 0, employeeCount: 0, sources: [] });
    expect(rows.some((r) => r.id === id.jobB)).toBe(false);
    expect((await get(`/job-roles/${id.job}/competencies`)).body.data.map((c) => c.name)).toEqual(['Triase tiket']);
    expect((await get(`/job-roles/${id.jobB}/competencies`)).status).toBe(404);
    expect((await audits(A.id, 'tenant_admin.job_role')).map((a) => a.action)).toEqual(['create', 'create', 'update']);
  });

  it('undang pengguna: akun invited, email undangan, audit; kembar ditolak', async () => {
    const res = await post('/users', { email: ' Baru@B11.test ', name: 'Baru', role: 'supervisor', employeeId: 'E-9', jobRoleId: id.job, careerLevelId: id.level, supervisorId: id.spv });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ invited: true, data: { email: 'baru@b11.test', role: 'supervisor', status: 'invited', jobRoleName: 'Engineer Service Delivery', supervisorId: id.spv } });
    id.baru = res.body.data.id;
    const mail = mailer.sent[mailer.sent.length - 1];
    expect(mail.to).toBe('baru@b11.test');
    expect(mail.subject).toMatch(/Undangan ELGOS dari Tenant A/);
    const token = mail.text.match(/\/masuk#token=([A-Za-z0-9_-]+)/)[1];
    expect((await audits(A.id, 'tenant_admin.user')).pop()).toMatchObject({ action: 'create', meta: { employeeIds: [id.baru], role: 'hr_admin' } });
    expect((await audits(A.id, 'tenant_admin.invitation')).length).toBe(1);

    expect((await post('/users', { email: 'baru@b11.test', name: 'Lagi', role: 'learner' })).body.error.code).toBe('DUPLICATE');
    expect((await post('/users', { email: 'lain@b11.test', name: 'Lagi', role: 'learner', employeeId: 'E-9' })).body.error.code).toBe('DUPLICATE');
    // email yang sama boleh ada di tenant lain
    expect((await post('/users', { email: 'baru@b11.test', name: 'Baru B', role: 'learner' }, 'adminB')).status).toBe(201);

    // link undangan mengaktifkan akun
    const login = await request(app).post('/api/auth/email-link/verify').send({ token });
    expect(login.body.user).toMatchObject({ id: id.baru, role: 'supervisor' });
    expect((await get('/users?status=invited')).body.data).toEqual([]);
  });

  it('validasi undangan dan batas peran', async () => {
    const bad = async (body) => { const r = await post('/users', body); return [r.status, r.body.error && r.body.error.code]; };
    expect(await bad({ name: 'X', role: 'learner' })).toEqual([400, 'BAD_REQUEST']);
    expect(await bad({ email: 'bukan-email', name: 'X', role: 'learner' })).toEqual([400, 'BAD_REQUEST']);
    expect(await bad({ email: 'x@b11.test', role: 'learner' })).toEqual([400, 'BAD_REQUEST']);
    expect(await bad({ email: 'x@b11.test', name: 'X', role: 'raja' })).toEqual([400, 'BAD_REQUEST']);
    expect(await bad({ email: 'x@b11.test', name: 'X', role: 'eta_admin' })).toEqual([403, 'ROLE_FORBIDDEN']);
    expect(await bad({ email: 'x@b11.test', name: 'X', role: 'learner', jobRoleId: id.jobB })).toEqual([400, 'BAD_REQUEST']);
    expect(await bad({ email: 'x@b11.test', name: 'X', role: 'learner', careerLevelId: id.level })).toEqual([400, 'BAD_REQUEST']);
    expect(await bad({ email: 'x@b11.test', name: 'X', role: 'learner', supervisorId: id.stafB })).toEqual([400, 'BAD_REQUEST']);
    expect(await bad({ email: 'x@b11.test', name: 'X', role: 'learner', jobRoleId: 'bukan-uuid' })).toEqual([400, 'BAD_REQUEST']);
    const [{ n }] = await db.query(`SELECT count(*)::int AS n FROM users WHERE tenant_id = :a AND email = 'x@b11.test'`, { replacements: { a: A.id }, type: 'SELECT' });
    expect(n).toBe(0);
  });

  it('kirim ulang undangan: hanya akun invited, dibatasi 3 per 15 menit', async () => {
    const made = await post('/users', { email: 'tunggu@b11.test', name: 'Tunggu', role: 'learner' });
    const uid = made.body.data.id;
    const before = mailer.sent.length;
    expect((await post(`/users/${uid}/invite`)).status).toBe(201);
    expect((await post(`/users/${uid}/invite`)).status).toBe(201);
    expect(mailer.sent.length).toBe(before + 2);
    const limited = await post(`/users/${uid}/invite`);
    expect([limited.status, limited.body.error.code]).toEqual([429, 'RATE_LIMITED']);
    // akun hasil impor (active, belum pernah masuk) juga boleh diundang ulang; yang sudah pernah masuk tidak
    expect((await get('/users')).body.data.find((u) => u.id === id.staf)).toMatchObject({ status: 'active', pendingLogin: true });
    expect((await post(`/users/${id.staf}/invite`)).status).toBe(201);
    expect((await post(`/users/${id.baru}/invite`)).body.error.code).toBe('INVALID_STATE');
    expect((await post(`/users/${id.stafB}/invite`)).status).toBe(404);
  });

  it('ubah peran, jabatan, atasan, status; perubahan tercatat audit', async () => {
    const res = await patch(`/users/${id.staf}`, { role: 'supervisor', jobRoleId: id.job, careerLevelId: id.level, supervisorId: id.spv, name: 'Staf Baru' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ role: 'supervisor', careerLevelId: id.level, supervisorId: id.spv, name: 'Staf Baru' });
    const last = (await audits(A.id, 'tenant_admin.user')).pop();
    expect(last).toMatchObject({ action: 'update', meta: { employeeIds: [id.staf], changes: { role: { from: 'learner', to: 'supervisor' } } } });
    expect(Object.keys(last.meta.changes).sort()).toEqual(['careerLevelId', 'name', 'role', 'supervisorId']);

    expect((await patch(`/users/${id.staf}`, { jobRoleId: null })).body.data).toMatchObject({ jobRoleId: null, careerLevelId: null });
    expect((await patch(`/users/${id.staf}`, { supervisorId: id.staf })).status).toBe(400);
    expect((await patch(`/users/${id.staf}`, { status: 'invited' })).status).toBe(400);
    expect((await patch(`/users/${id.staf}`, {})).status).toBe(400);
    expect((await patch(`/users/${id.staf}`, { employeeId: 'E-1' })).body.error.code).toBe('DUPLICATE');
    expect((await patch('/users/bukan-uuid', { name: 'X' })).status).toBe(404);
  });

  it('batas: tidak bisa mengubah diri sendiri, akun eta_admin, atau memberi eta_admin', async () => {
    expect((await patch(`/users/${id.admin}`, { role: 'learner' })).body.error.code).toBe('SELF_CHANGE');
    expect((await patch(`/users/${id.admin}`, { status: 'disabled' })).body.error.code).toBe('SELF_CHANGE');
    expect((await patch(`/users/${id.admin}`, { name: 'Admin A' })).status).toBe(200);
    expect((await patch(`/users/${id.eta}`, { name: 'X' })).body.error.code).toBe('ROLE_FORBIDDEN');
    expect((await patch(`/users/${id.staf}`, { role: 'eta_admin' })).body.error.code).toBe('ROLE_FORBIDDEN');
    // Admin ETA sendiri juga tidak memberi eta_admin lewat layar tenant
    expect((await patch(`/users/${id.staf}`, { role: 'eta_admin' }, 'eta')).body.error.code).toBe('ROLE_FORBIDDEN');
  });

  it('menonaktifkan akun: tidak bisa minta link masuk; bisa diaktifkan lagi', async () => {
    expect((await patch(`/users/${id.spv}`, { status: 'disabled' })).body.data.status).toBe('disabled');
    const before = mailer.sent.length;
    await request(app).post('/api/auth/email-link').send({ tenant: slugA, email: 'spv@b11.test' });
    expect(mailer.sent.length).toBe(before);
    // belum pernah masuk -> kembali "diundang"; sudah pernah masuk -> aktif
    expect((await patch(`/users/${id.spv}`, { status: 'active' })).body.data.status).toBe('invited');
    expect((await patch(`/users/${id.spv}`, { status: 'active' })).status).toBe(400);
    // akun aktif hasil impor yang belum pernah masuk tidak berubah bila form mengirim status yang sama
    expect((await patch(`/users/${id.staf}`, { status: 'active', name: 'staf' })).body.data.status).toBe('active');
    await patch(`/users/${id.baru}`, { status: 'disabled' });
    expect((await patch(`/users/${id.baru}`, { status: 'active' })).body.data).toMatchObject({ status: 'active', pendingLogin: false });
  });

  it('isolasi tenant: user, jabatan, dan batch tenant lain tidak terlihat dan tidak bisa diubah', async () => {
    expect((await patch(`/users/${id.stafB}`, { name: 'Dibajak' })).status).toBe(404);
    expect((await get('/users', 'adminB')).body.data.some((u) => u.email.endsWith('@b11.test') && u.id === id.staf)).toBe(false);
    expect((await get('/job-roles', 'adminB')).body.data.map((r) => r.name)).toEqual(['Jabatan B']);
    const [[row]] = await db.query('SELECT name FROM users WHERE id = :id', { replacements: { id: id.stafB } });
    expect(row.name).toBe('stafB');
  });

  it('impor kamus per jabatan dan KPI per periode, dengan sumber dan waktu unggah di ringkasan', async () => {
    // Tenant A hanya berlangganan dna: impor tna ditolak, dna terbuka walau flag module.dna mati
    expect((await get('/imports/tna/templates')).body.error.code).toBe('NOT_ENTITLED');
    expect((await get('/imports/dna/templates')).body.data.map((k) => k.key)).toEqual(['dna_competencies']);
    // jenis lain (karyawan, hasil DNA individu) tidak dibuka di layar admin
    expect((await upload('dna', 'employees', 'k.csv', ['ID Karyawan,Nama,Email', 'E-77,Nn,nn@b11.test'])).status).toBe(404);
    expect((await upload('dna', 'dna_results', 'h.csv', ['ID Karyawan,Kompetensi,Skor', 'E-2,X,3'])).status).toBe(404);
    // B2: perubahan peran (learner -> supervisor di test sebelumnya) menutup sesi lama; staf masuk lagi sebagai supervisor
    tok.staf = await tokens.sign({ id: id.staf, tenantId: A.id, role: 'supervisor', email: 'staf@b11.test' });
    expect((await get('/imports/dna/templates', 'staf')).status).toBe(403);

    const up = await upload('dna', 'dna_competencies', 'DACUM_Service Delivery_v2.1.csv', [
      'Job Role,Jenis,Kompetensi,Skor Minimal', ',,Ticket Life Cycle,3', 'Engineer Service Delivery,,RCA & Post-Incident Report,3',
      'Account Manager,,Salah jabatan,3', ',inti,Kompetensi inti,3']);
    expect(up.status).toBe(201);
    const bid = up.body.data.id;
    expect((await request(app).post(`${BASE}/imports/dna/batches/${bid}/commit`).set(as('admin')).send({ options: { jobRoleId: id.jobB, source: 'dacum' } })).status).toBe(400);
    expect((await request(app).post(`${BASE}/imports/dna/batches/${bid}/commit`).set(as('admin')).send({ options: { jobRoleId: id.job, source: 'ngawur' } })).status).toBe(400);
    const done = await request(app).post(`${BASE}/imports/dna/batches/${bid}/commit`).set(as('admin')).send({ options: { jobRoleId: id.job, source: 'dacum' } });
    expect(done.status).toBe(200);
    expect(done.body.data.result).toMatchObject({ imported: 2, competencies: 2, rejectedCount: 2 });
    expect(done.body.data.result.rejected.map((x) => x.reason)).toEqual([expect.stringMatching(/Account Manager/), expect.stringMatching(/inti/)]);
    const comps = (await get(`/job-roles/${id.job}/competencies`)).body.data;
    expect(comps.find((c) => c.name === 'Ticket Life Cycle')).toMatchObject({ kind: 'job', source: 'dacum', jobRoleId: id.job });
    expect((await request(app).get(`${BASE}/imports/dna/batches/${bid}`).set(as('adminB'))).status).toBe(404);

    let sum = (await get('/imports/summary')).body.data;
    const row = sum.competencyModel.find((r) => r.jobRoleId === id.job);
    expect(row).toMatchObject({ jobRoleName: 'Engineer Service Delivery', competencyCount: 3, status: 'terimpor', lastImport: { batchId: bid, filename: 'DACUM_Service Delivery_v2.1.csv', source: 'dacum', uploadedByName: 'Admin A', imported: 2 } });
    expect(Date.parse(row.lastImport.uploadedAt)).toBeGreaterThan(Date.now() - 60000);
    expect(sum.competencyModel.find((r) => r.jobRoleName === 'Account Manager')).toMatchObject({ status: 'belum', lastImport: null });
    expect(sum.performance).toEqual([]);
    expect((await get('/job-roles')).body.data.find((r) => r.id === id.job).lastImport).toMatchObject({ filename: 'DACUM_Service Delivery_v2.1.csv' });

    // KPI/OKR per periode (butuh entitlement tna)
    await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:a, 'tna')`, { replacements: { a: A.id } });
    const perf = await upload('tna', 'tna_performance', 'okr_q4_2026.csv', ['ID Karyawan,Jenis Metrik,Nama Metrik,Target,Realisasi', 'E-2,okr,MTTR insiden P1,90,72', 'E-2,okr,Kepatuhan SLA,95,97']);
    expect((await upload('tna', 'employees', 'k.csv', ['ID Karyawan,Nama,Email', 'E-77,Nn,nn@b11.test'])).status).toBe(404);
    const pdone = await request(app).post(`${BASE}/imports/tna/batches/${perf.body.data.id}/commit`).set(as('admin')).send({ options: { period: '2026-Q4', source: 'HRIS' } });
    expect(pdone.body.data.result).toMatchObject({ imported: 2, red: 1 });
    sum = (await get('/imports/summary')).body.data;
    expect(sum.performance).toEqual([expect.objectContaining({ period: '2026-Q4', records: 2, missed: 1, lastImport: expect.objectContaining({ filename: 'okr_q4_2026.csv', source: 'HRIS', uploadedByName: 'Admin A' }) })]);
    expect(JSON.stringify(sum.performance)).not.toMatch(/staf|E-2/i);
    expect((await get('/imports/summary', 'adminB')).body.data.performance).toEqual([]);
  });

  it('status integrasi: boolean saja, tanpa secret, URL, atau id organisasi', async () => {
    const a = (await get('/imports/summary')).body;
    expect(a.data.integrations).toEqual({
      elitementor: { status: 'terkonfigurasi', organizationMapped: true, sso: false, webhookSync: false },
      lms: { targets: ['elitementor', 'moodle'], gapExport: true },
    });
    expect(JSON.stringify(a)).not.toMatch(/rahasia-klien|em\.test|organizationId|clientId/);
    const b = (await get('/imports/summary', 'adminB')).body.data.integrations;
    expect(b.elitementor).toMatchObject({ status: 'belum_dikonfigurasi', organizationMapped: false });
  });

  it('riwayat batch: jenis di luar daftar dan unggahan orang lain yang belum disimpan tidak terlihat', async () => {
    const mk = async (kind, submodule, by) => {
      const [[row]] = await db.query(
        `INSERT INTO import_batches (id, tenant_id, submodule, kind, filename, row_count, headers, rows, mapping, created_by)
         VALUES (gen_random_uuid(), :t, :submodule, :kind, 'x.csv', 0, '[]', '[]', '{}', :by) RETURNING id`,
        { replacements: { t: A.id, submodule, kind, by } });
      return row.id;
    };
    const hasil = await mk('dna_results', 'dna', id.admin);
    const milikEta = await mk('dna_competencies', 'dna', id.eta);
    const milikSendiri = await mk('dna_competencies', 'dna', id.admin);
    const ids = (await get('/imports/dna/batches')).body.data.map((b) => b.id);
    expect(ids).toContain(milikSendiri);
    expect(ids).not.toContain(hasil);
    expect(ids).not.toContain(milikEta);
    expect((await get(`/imports/dna/batches/${hasil}`)).status).toBe(404);
    expect((await get(`/imports/dna/batches/${milikEta}`)).status).toBe(404);
    expect((await post(`/imports/dna/batches/${milikEta}/commit`, {})).status).toBe(404);
    expect((await get(`/imports/dna/batches/${milikSendiri}`)).status).toBe(200);
    // rute HR lama tetap melihat semuanya (perilaku lama)
    await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:a, 'module.dna', true)`, { replacements: { a: A.id } });
    expect((await request(app).get(`/api/dna/imports/batches/${milikEta}`).set(as('admin'))).status).toBe(200);
  });

  it('atasan: dua akun tidak boleh saling menjadi atasan; kirim ulang undangan ke Super Admin ditolak', async () => {
    expect((await patch(`/users/${id.staf}`, { supervisorId: id.pim })).status).toBe(200);
    const res = await patch(`/users/${id.pim}`, { supervisorId: id.staf });
    expect(res.status).toBe(400);
    expect((await patch(`/users/${id.staf}`, { supervisorId: id.stafB })).status).toBe(400);
    expect((await post(`/users/${id.eta}/invite`, {})).status).toBe(403);
  });

  it('regresi: rute impor lama tetap hanya untuk HR dan tetap lewat gerbang submodul', async () => {
    // tenant B: full_suite tetapi module.dna mati -> rute lama tertutup, rute admin terbuka
    expect((await request(app).get('/api/dna/imports/templates').set(as('adminB'))).body.error.code).toBe('FEATURE_DISABLED');
    expect((await get('/imports/dna/templates', 'adminB')).status).toBe(200);
    await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:b, 'module.dna', true)`, { replacements: { b: B.id } });
    expect((await request(app).get('/api/dna/imports/templates').set(as('adminB'))).status).toBe(200);
    expect((await request(app).get('/api/dna/imports/templates').set(as('stafB'))).status).toBe(403);
  });

  describe('triase review egm 19 Nov', () => {
    it('CD-8/IR-2: atasan yang perannya diganti kehilangan izin temuan di luar pelatihan, dan pencabutannya tercatat', async () => {
      await addUser(A.id, 'spvLama', 'supervisor');
      await stores.tna.grantNonTraining(A.id, id.spvLama, id.admin);
      expect(await stores.tna.hasNonTrainingGrant(A.id, id.spvLama)).toBe(true);
      expect((await patch(`/users/${id.spvLama}`, { role: 'learner' })).status).toBe(200);
      expect(await stores.tna.hasNonTrainingGrant(A.id, id.spvLama)).toBe(false);
      const row = (await audits(A.id, 'tna.non_training_access')).pop();
      expect(row).toMatchObject({ action: 'delete' });
      expect(row.meta).toMatchObject({ supervisorId: id.spvLama, via: 'tenant-admin', reason: 'role_changed' });
      // dijadikan atasan lagi: izin tidak kembali diam-diam
      await patch(`/users/${id.spvLama}`, { role: 'supervisor' });
      expect(await stores.tna.hasNonTrainingGrant(A.id, id.spvLama)).toBe(false);
    });

    it('CD-10: riwayat batch admin tidak tertutup oleh lebih dari 100 batch HR yang lebih baru', async () => {
      const [[own]] = await db.query(
        `INSERT INTO import_batches (id, tenant_id, submodule, kind, filename, row_count, headers, rows, mapping, created_by, created_at)
         VALUES (gen_random_uuid(), :t, 'dna', 'dna_competencies', 'lama.xlsx', 0, '[]', '[]', '{}', :by, now() - interval '1 day') RETURNING id`,
        { replacements: { t: A.id, by: id.admin } });
      await db.query(
        `INSERT INTO import_batches (id, tenant_id, submodule, kind, filename, row_count, headers, rows, mapping, created_by)
         SELECT gen_random_uuid(), :t, 'dna', 'employees', 'k.csv', 0, '[]', '[]', '{}', :by FROM generate_series(1, 105)`,
        { replacements: { t: A.id, by: id.admin } });
      expect((await get('/imports/dna/batches')).body.data.map((b) => b.id)).toContain(own.id);
    });

    it('CB9-4: email gagal: undangan baru tetap dibuat dengan invited=false; kirim ulang menjawab 502 MAIL_FAILED', async () => {
      const send = mailer.send;
      mailer.send = async () => { throw new Error('SES mati'); };
      try {
        const res = await post('/users', { email: 'gagal-kirim@b11.test', name: 'Gagal Kirim', role: 'learner' });
        expect(res.status).toBe(201);
        expect(res.body.data.status).toBe('invited');
        expect(res.body.invited).toBe(false);
        const again = await post(`/users/${res.body.data.id}/invite`, {});
        expect([again.status, again.body.error.code]).toEqual([502, 'MAIL_FAILED']);
        expect((await audits(A.id, 'tenant_admin.invitation')).filter((x) => (x.meta.employeeIds || []).includes(res.body.data.id))).toEqual([]);
      } finally { mailer.send = send; }
    });
  });
});
