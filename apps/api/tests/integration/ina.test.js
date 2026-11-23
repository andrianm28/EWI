// B9: Improvement Needs (tindakan perbaikan, akses atasan, verifikasi AI) di Postgres.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { memoryMailer } = require('../../src/integrations/mailer');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const BASE = '/api/ina';

run('Improvement Needs B9 (Postgres)', () => {
  let db; let app; let tokens; let stores; let A; let B;
  const tok = {}; const id = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const get = (path, who = 'hr') => request(app).get(`${BASE}${path}`).set(as(who));
  const post = (path, body, who = 'hr') => request(app).post(`${BASE}${path}`).set(as(who)).send(body);
  const patch = (path, body, who = 'hr') => request(app).patch(`${BASE}${path}`).set(as(who)).send(body);
  const sql = (q, replacements = {}) => db.query(q, { replacements, type: 'SELECT' });
  const audits = (resource) => sql('SELECT action, meta FROM audit_logs WHERE tenant_id = :t AND resource = :resource ORDER BY id', { t: A.id, resource });
  const flag = (tenantId, key, enabled = true) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled)
     ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t: tenantId, key, enabled } });

  async function addUser(tenantId, key, role, extra = {}) {
    const [[row]] = await db.query(
      `INSERT INTO users (tenant_id, email, name, role, status, supervisor_id, job_role_id) VALUES (:t, :email, :name, :role, 'active', :sup, :jr) RETURNING id`,
      { replacements: { t: tenantId, email: `${key}@b9.test`, name: `Nama ${key}`, role, sup: extra.sup || null, jr: extra.jr || null } });
    id[key] = row.id;
    tok[key] = await tokens.sign({ id: row.id, tenantId, role, email: `${key}@b9.test` });
    return row.id;
  }
  async function addFinding(tenantId, key, { category = 'non_training', review = 'approved', userId, projectId }) {
    const [[row]] = await db.query(
      `INSERT INTO lna_findings (tenant_id, project_id, user_id, category, title, review_status, competency_id)
       VALUES (:t, :p, :u, :category, 'temuan', :review, :c) RETURNING id`,
      { replacements: { t: tenantId, p: projectId, u: userId, category, review, c: tenantId === A.id ? id.comp : null } });
    id[key] = row.id;
  }

  beforeAll(async () => {
    const config = makeConfig({});
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    app = createApp({ config, stores, mailer: memoryMailer() });
    tokens = sessionSigner(config, stores.authSessions);
    const slug = `b9-${Date.now()}`;
    [[A]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Tenant A') RETURNING id`, { replacements: { slug } });
    [[B]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Tenant B') RETURNING id`, { replacements: { slug: `${slug}-b` } });
    const [[jr]] = await db.query(`INSERT INTO lna_job_roles (tenant_id, name) VALUES (:a, 'Engineer L1') RETURNING id`, { replacements: { a: A.id } });
    const [[comp]] = await db.query(`INSERT INTO lna_competencies (tenant_id, job_role_id, kind, name) VALUES (:a, :jr, 'job', 'Eskalasi insiden') RETURNING id`, { replacements: { a: A.id, jr: jr.id } });
    id.comp = comp.id;
    await addUser(A.id, 'hr', 'hr_admin');
    await addUser(A.id, 'spv', 'supervisor');
    await addUser(A.id, 'spv2', 'supervisor');
    await addUser(A.id, 'staf', 'learner', { sup: id.spv, jr: jr.id });
    await addUser(A.id, 'lain', 'learner', { sup: id.spv2 });
    await addUser(A.id, 'pim', 'pimpinan');
    await addUser(B.id, 'hrB', 'hr_admin');
    await addUser(B.id, 'stafB', 'learner');
    const [[pA]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:a, 'Proyek A') RETURNING id`, { replacements: { a: A.id } });
    const [[pB]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:b, 'Proyek B') RETURNING id`, { replacements: { b: B.id } });
    await addFinding(A.id, 'fNon', { userId: id.staf, projectId: pA.id });
    await addFinding(A.id, 'fTraining', { category: 'training', userId: id.staf, projectId: pA.id });
    await addFinding(A.id, 'fDraft', { review: 'draft', userId: id.staf, projectId: pA.id });
    await addFinding(B.id, 'fB', { userId: id.stafB, projectId: pB.id });
    await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:b, 'ina')`, { replacements: { b: B.id } });
    for (const key of ['module.ina', 'ina.dashboard', 'ina.ai_verification']) await flag(B.id, key);
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [A.id, B.id] }, transaction });
    });
    await db.close();
  });

  it('gerbang: entitlement, module.ina, ina.dashboard, lalu ina.ai_verification', async () => {
    expect((await get('/actions')).body.error.code).toBe('NOT_ENTITLED');
    await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:a, 'ina')`, { replacements: { a: A.id } });
    expect((await get('/actions')).body.error.code).toBe('FEATURE_DISABLED');
    await flag(A.id, 'module.ina');
    expect((await get('/actions')).body.error.code).toBe('FEATURE_DISABLED');
    expect((await post('/actions', { title: 'abc', category: 'sop' })).status).toBe(403);
    // menu: flag dashboard mati dijawab level null, bukan galat
    expect((await get('/access/me')).body.data).toEqual({ level: null, pendingVerifications: 0 });
    await flag(A.id, 'ina.dashboard');
    expect((await get('/actions')).status).toBe(200);
    expect((await get('/access/me')).body.data).toEqual({ level: 'manage', pendingVerifications: 0 });
    // verifikasi AI punya flag sendiri
    expect((await get('/verifications')).body.error.code).toBe('FEATURE_DISABLED');
    expect((await get('/verifications/mine', 'staf')).body.error.code).toBe('FEATURE_DISABLED');
  });

  it('HR membuat tindakan; validasi kategori, sub-label, tenggat, pemilik', async () => {
    for (const body of [
      { category: 'sop' }, { title: 'ab', category: 'sop' }, { title: 'Judul sah', category: 'pelatihan' },
      { title: 'Judul sah', category: 'sop', subLabel: 'x' }, { title: 'Judul sah', category: 'sop', dueDate: '2026-02-30' },
      { title: 'Judul sah', category: 'sop', ownerUserId: id.stafB }, { title: 'Judul sah', category: 'sop', ownerUserId: 'bukan-uuid' },
      { title: 'Judul sah', category: 'sop', competencyId: id.fNon }, { title: 'Judul sah', category: 'sop', involvesIndividual: 'ya' },
    ]) {
      const res = await post('/actions', body);
      expect([res.status, JSON.stringify(body)]).toEqual([400, JSON.stringify(body)]);
    }
    const res = await post('/actions', { title: ' Perbarui SOP eskalasi ', detail: 'Rincian rahasia SOP', category: 'sop', ownerUserId: id.staf, competencyId: id.comp, dueDate: '2020-01-31' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: 'Perbarui SOP eskalasi', detail: 'Rincian rahasia SOP', category: 'sop', ownerUserId: id.staf, ownerName: 'Nama staf', ownerJobRoleName: 'Engineer L1',
      sourceRef: 'Eskalasi insiden', dueDate: '2020-01-31', status: 'new', overdue: true, involvesIndividual: false, lastVerification: null,
    });
    id.aSop = res.body.data.id;
    id.aLain = (await post('/actions', { title: 'Tinjau beban kerja', category: 'lainnya', subLabel: 'Beban kerja', ownerUserId: id.lain })).body.data.id;
    id.aBudaya = (await post('/actions', { title: 'Forum umpan balik', category: 'budaya' })).body.data.id; // tanpa pemilik
    const a = (await audits('ina.action')).filter((x) => x.action === 'create');
    expect(a).toHaveLength(3);
    expect(a[0].meta).toMatchObject({ objectIds: [id.aSop], employeeIds: [id.staf], category: 'sop', fromFinding: false });
    expect(JSON.stringify(a)).not.toContain('Perbarui SOP');
  });

  it('enkripsi: judul dan detail tidak tersimpan sebagai teks polos', async () => {
    const [row] = await sql('SELECT title, detail FROM ina_actions WHERE id = :id', { id: id.aSop });
    expect(row.title).not.toContain('Perbarui');
    expect(row.detail).not.toContain('Rincian');
    expect(stores.cipher.isEncrypted(row.title)).toBe(true);
  });

  it('daftar dan KPI untuk HR; filter tidak mengubah KPI; detail hanya di GET satuan', async () => {
    const res = await get('/actions');
    expect(res.body.data.map((x) => x.id).sort()).toEqual([id.aSop, id.aLain, id.aBudaya].sort());
    expect(res.body.kpis).toEqual({ total: 3, done: 0, process: 1, culture: 1, overdue: 1 });
    expect(res.body.meta).toEqual({ level: 'manage', hiddenIndividual: 0 });
    expect(res.body.data[0].detail).toBeUndefined();
    const f = await get('/actions?category=budaya');
    expect(f.body.data.map((x) => x.id)).toEqual([id.aBudaya]);
    expect(f.body.kpis.total).toBe(3);
    expect((await get('/actions?status=apa')).status).toBe(400);
    expect((await get(`/actions/${id.aSop}`)).body.data.detail).toBe('Rincian rahasia SOP');
    expect((await get('/actions/bukan-uuid')).status).toBe(404);
    const reads = await audits('ina.actions');
    expect(reads[0].meta.employeeIds.sort()).toEqual([id.staf, id.lain].sort());
  });

  it('ubah tindakan: transisi status, sub-label ikut kategori, audit tanpa isi teks', async () => {
    expect((await patch(`/actions/${id.aLain}`, {})).status).toBe(400);
    expect((await patch(`/actions/${id.aLain}`, { findingId: id.fNon })).status).toBe(400);
    const done = await patch(`/actions/${id.aLain}`, { status: 'done' });
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('done');
    const again = await patch(`/actions/${id.aLain}`, { status: 'rejected' });
    expect([again.status, again.body.error.code]).toEqual([409, 'INVALID_TRANSITION']);
    expect((await sql('SELECT completed_at FROM ina_actions WHERE id = :id', { id: id.aLain }))[0].completed_at).not.toBeNull();
    expect((await patch(`/actions/${id.aLain}`, { status: 'in_progress' })).body.data.status).toBe('in_progress');
    expect((await sql('SELECT completed_at FROM ina_actions WHERE id = :id', { id: id.aLain }))[0].completed_at).toBeNull();
    // pindah kategori dari "lainnya": sub-label dikosongkan
    const moved = await patch(`/actions/${id.aLain}`, { category: 'alat', title: 'Judul baru rahasia' });
    expect(moved.body.data).toMatchObject({ category: 'alat', subLabel: null, title: 'Judul baru rahasia' });
    expect((await patch(`/actions/${id.aLain}`, { subLabel: 'x' })).status).toBe(400);
    // nilai sama: tanpa audit baru
    const before = (await audits('ina.action')).length;
    expect((await patch(`/actions/${id.aLain}`, { category: 'alat' })).status).toBe(200);
    const after = await audits('ina.action');
    expect(after.length).toBe(before);
    expect(JSON.stringify(after)).not.toContain('Judul baru rahasia');
    expect(after.find((x) => x.meta.status && x.meta.status.to === 'done').meta.status).toEqual({ from: 'new', to: 'done' });
  });

  it('dari temuan: hanya non-pelatihan yang sudah ditinjau, wajib keputusan individu, satu tindakan per temuan', async () => {
    const base = { title: 'Perbaiki alur tiket', category: 'sistem', involvesIndividual: false };
    expect((await post('/actions', { ...base, findingId: id.fTraining })).status).toBe(400);
    expect((await post('/actions', { ...base, findingId: id.fDraft })).status).toBe(400);
    expect((await post('/actions', { ...base, findingId: id.fB })).status).toBe(400);
    expect((await post('/actions', { title: base.title, category: 'sistem', findingId: id.fNon })).status).toBe(400); // tanpa involvesIndividual
    const res = await post('/actions', { ...base, findingId: id.fNon, ownerUserId: id.staf });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ findingId: id.fNon, competencyId: id.comp, sourceRef: 'Eskalasi insiden', title: 'Perbaiki alur tiket' });
    id.aTemuan = res.body.data.id;
    const status = async () => (await sql('SELECT status FROM lna_findings WHERE id = :id', { id: id.fNon }))[0].status;
    expect(await status()).toBe('planned');
    const dup = await post('/actions', { ...base, findingId: id.fNon });
    expect([dup.status, dup.body.error.code]).toEqual([409, 'DUPLICATE']);
    await patch(`/actions/${id.aTemuan}`, { status: 'done' });
    expect(await status()).toBe('resolved');
    await patch(`/actions/${id.aTemuan}`, { status: 'in_progress' });
    expect(await status()).toBe('planned');
  });

  it('K1: atasan tanpa izin ditolak; dengan izin hanya melihat tindakan dirinya dan bawahan langsung; izin bisa dicabut', async () => {
    expect((await get('/actions', 'spv')).body.error.code).toBe('NO_INA_ACCESS');
    expect((await get('/access/me', 'spv')).body.data.level).toBeNull();
    expect((await get('/access', 'spv')).status).toBe(403);
    const list = await get('/access');
    expect(list.body.data.map((s) => [s.supervisorId, s.granted]).sort()).toEqual([[id.spv, false], [id.spv2, false]].sort());
    expect((await request(app).put(`${BASE}/access/${id.staf}`).set(as('hr'))).status).toBe(404); // bukan atasan
    expect((await request(app).put(`${BASE}/access/${id.spv}`).set(as('spv'))).status).toBe(403);
    const put = await request(app).put(`${BASE}/access/${id.spv}`).set(as('hr'));
    expect(put.body.data).toEqual({ supervisorId: id.spv, granted: true, changed: true });
    expect((await request(app).put(`${BASE}/access/${id.spv}`).set(as('hr'))).body.data.changed).toBe(false);
    // izin yang sama dengan daftar temuan di luar pelatihan TNA (PM-6)
    expect(await stores.tna.hasNonTrainingGrant(A.id, id.spv)).toBe(true);
    expect((await get('/access')).body.data.find((s) => s.supervisorId === id.spv)).toMatchObject({ granted: true, grantedByName: 'Nama hr' });

    const res = await get('/actions', 'spv');
    expect(res.status).toBe(200);
    expect(res.body.data.map((x) => x.id).sort()).toEqual([id.aSop, id.aTemuan].sort()); // milik staf; bukan milik "lain", bukan yang tanpa pemilik
    expect(res.body.kpis.total).toBe(2);
    expect(res.body.meta).toEqual({ level: 'read' });
    for (const row of res.body.data) {
      expect(row.findingId).toBeUndefined();
      expect(row.involvesIndividual).toBeUndefined();
    }
    expect((await get(`/actions/${id.aSop}`, 'spv')).status).toBe(200);
    expect((await get(`/actions/${id.aLain}`, 'spv')).status).toBe(404);
    expect((await get(`/actions/${id.aBudaya}`, 'spv')).status).toBe(404);
    expect((await get('/actions?hidden=1', 'spv')).status).toBe(403);
    expect((await post('/actions', { title: 'Judul sah', category: 'sop' }, 'spv')).status).toBe(403);
    expect((await patch(`/actions/${id.aSop}`, { status: 'done' }, 'spv')).status).toBe(403);

    const del = await request(app).delete(`${BASE}/access/${id.spv}`).set(as('hr'));
    expect(del.body.data).toEqual({ supervisorId: id.spv, granted: false, changed: true });
    expect((await get('/actions', 'spv')).body.error.code).toBe('NO_INA_ACCESS');
    expect((await audits('tna.non_training_access')).filter((x) => x.meta.via === 'ina').map((x) => x.action)).toEqual(['create', 'delete']);
    await request(app).put(`${BASE}/access/${id.spv}`).set(as('hr'));
  });

  it('spek B9 §15: Admin ETA hanya membaca seluruh tindakan, tidak membuat atau mengubah', async () => {
    await addUser(A.id, 'eta', 'eta_admin');
    const list = await get('/actions', 'eta');
    expect(list.status).toBe(200);
    expect(list.body.meta.level).toBe('read');
    expect(list.body.data.length).toBe(list.body.kpis.total);
    // tindakan tanpa pemilik yang tampil di daftar juga bisa dibuka
    expect(list.body.data.map((x) => x.id)).toContain(id.aBudaya);
    expect((await get(`/actions/${id.aBudaya}`, 'eta')).status).toBe(200);
    expect((await post('/actions', { title: 'Judul sah', category: 'sop' }, 'eta')).status).toBe(403);
    expect((await patch(`/actions/${id.aSop}`, { status: 'in_progress' }, 'eta')).status).toBe(403);
    expect((await get('/access', 'eta')).status).toBe(403);
    expect((await get('/owners', 'eta')).status).toBe(403);
  });

  it('pimpinan hanya angka ringkasan; karyawan ditolak', async () => {
    const res = await get('/actions', 'pim');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.kpis.total).toBe(4);
    expect(res.body.meta).toEqual({ level: 'summary' });
    expect((await get(`/actions/${id.aSop}`, 'pim')).status).toBe(403);
    expect((await post('/actions', { title: 'Judul sah', category: 'sop' }, 'pim')).status).toBe(403);
    expect((await get('/actions', 'staf')).body.error.code).toBe('ROLE_FORBIDDEN');
    // pilihan pemilik hanya untuk HR, tanpa email
    const owners = await get('/owners');
    expect(owners.body.data.find((o) => o.id === id.staf)).toEqual({ id: id.staf, name: 'Nama staf', jobRoleName: 'Engineer L1' });
    expect(owners.body.data.map((o) => o.id)).not.toContain(id.stafB);
    for (const who of ['pim', 'spv', 'staf']) expect((await get('/owners', who)).status).toBe(403);
    expect((await get(`/actions/${id.aSop}`, 'staf')).status).toBe(403);
  });

  it('temuan yang menyangkut individu: keluar dari daftar dan KPI semua orang; HR bisa membukanya lewat hidden=1', async () => {
    expect((await patch(`/actions/${id.aTemuan}`, { involvesIndividual: true })).body.data.involvesIndividual).toBe(true);
    const hr = await get('/actions');
    expect(hr.body.data.map((x) => x.id)).not.toContain(id.aTemuan);
    expect(hr.body.kpis.total).toBe(3);
    expect(hr.body.meta.hiddenIndividual).toBe(1);
    const spv = await get('/actions', 'spv');
    expect(spv.body.data.map((x) => x.id)).toEqual([id.aSop]);
    expect(spv.body.meta.hiddenIndividual).toBeUndefined();
    expect((await get(`/actions/${id.aTemuan}`, 'spv')).status).toBe(404);
    expect((await get('/actions', 'pim')).body.kpis.total).toBe(3);
    const hidden = await get('/actions?hidden=1');
    expect(hidden.body.data.map((x) => x.id)).toEqual([id.aTemuan]);
    expect(hidden.body.kpis.total).toBe(3); // KPI tetap dari daftar utama
    expect(hidden.body.meta.hiddenIndividual).toBe(1);
    expect((await get(`/actions/${id.aTemuan}`)).status).toBe(200);
  });

  it('isolasi tenant', async () => {
    expect((await get('/actions', 'hrB')).body.data).toEqual([]);
    expect((await get(`/actions/${id.aSop}`, 'hrB')).status).toBe(404);
    expect((await patch(`/actions/${id.aSop}`, { status: 'done' }, 'hrB')).status).toBe(404);
    expect((await post('/actions', { title: 'Judul sah', category: 'sop', ownerUserId: id.staf }, 'hrB')).status).toBe(400);
    expect((await request(app).put(`${BASE}/access/${id.spv}`).set(as('hrB'))).status).toBe(404);
    expect((await post(`/actions/${id.aSop}/verifications`, {}, 'hrB')).status).toBe(404);
  });

  it('verifikasi AI: tugaskan, setuju, tiga jawaban, ringkasan untuk HR tanpa transkrip', async () => {
    await flag(A.id, 'ina.ai_verification');
    expect((await post(`/actions/${id.aBudaya}/verifications`, {})).body.error.code).toBe('NO_OWNER');
    expect((await post(`/actions/${id.aTemuan}/verifications`, {})).body.error.code).toBe('INVALID_STATE'); // menyangkut individu
    expect((await post(`/actions/${id.aSop}/verifications`, { dueDate: 'besok' })).status).toBe(400);
    expect((await post(`/actions/${id.aSop}/verifications`, {}, 'spv')).status).toBe(403);
    const made = await post(`/actions/${id.aSop}/verifications`, { dueDate: '2026-12-05' });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ actionId: id.aSop, ownerUserId: id.staf, status: 'assigned', dueDate: '2026-12-05', summary: null });
    const vid = made.body.data.id; id.v1 = vid;
    expect((await post(`/actions/${id.aSop}/verifications`, {})).body.error.code).toBe('DUPLICATE');
    expect((await get('/access/me', 'staf')).body.data).toEqual({ level: null, pendingVerifications: 1 });
    expect((await get('/verifications/mine', 'staf')).body.data.map((v) => v.id)).toEqual([vid]);
    expect((await get('/verifications/mine', 'lain')).body.data).toEqual([]);

    // hanya pemilik yang bisa bercakap
    expect((await post(`/verifications/${vid}/consent`, { consentVersion: 'v1.0' }, 'hr')).status).toBe(404);
    expect((await post(`/verifications/${vid}/consent`, { consentVersion: 'v1.0' }, 'lain')).status).toBe(404);
    expect((await post(`/verifications/${vid}/turns`, { text: 'halo' }, 'staf')).body.error.code).toBe('INVALID_STATE'); // belum setuju
    expect((await post(`/verifications/${vid}/consent`, {}, 'staf')).status).toBe(400);
    // Audit 23 Nov: versi persetujuan dicek ke registry (sama seperti TNA/CCA/LIM)
    const stale = await post(`/verifications/${vid}/consent`, { consentVersion: 'v1.0' }, 'staf');
    expect(stale.status).toBe(400);
    expect(stale.body.error.code).toBe('CONSENT_VERSION_INVALID');
    const consent = await post(`/verifications/${vid}/consent`, { consentVersion: 'ina-verifikasi-v1.0' }, 'staf');
    expect(consent.status).toBe(200);
    expect(consent.body.data).toMatchObject({ status: 'in_progress', done: false });
    expect(consent.body.data.question).toContain('Perbarui SOP eskalasi');
    expect((await post(`/verifications/${vid}/consent`, { consentVersion: 'ina-verifikasi-v1.0' }, 'staf')).body.error.code).toBe('INVALID_STATE');
    expect((await post(`/verifications/${vid}/complete`, {}, 'staf')).body.error.code).toBe('INVALID_STATE'); // belum ada jawaban
    expect((await post(`/verifications/${vid}/turns`, { text: '' }, 'staf')).status).toBe(400);

    const t1 = await post(`/verifications/${vid}/turns`, { text: 'Belum selesai, draf SOP JAWABAN-RAHASIA masih direvisi' }, 'staf');
    expect(t1.body.data.done).toBe(false);
    const t2 = await post(`/verifications/${vid}/turns`, { text: 'Terkendala persetujuan manajer' }, 'staf');
    expect(t2.body.data.question).not.toBe(t1.body.data.question);
    const t3 = await post(`/verifications/${vid}/turns`, { text: 'Butuh keputusan minggu ini' }, 'staf');
    expect(t3.body.data).toMatchObject({ done: true, question: null, status: 'completed', reportedStatus: 'blocked', aiProvider: 'bawaan' });
    expect((await post(`/verifications/${vid}/turns`, { text: 'tambahan' }, 'staf')).body.error.code).toBe('INVALID_STATE');

    // pemilik melihat transkripnya; HR hanya ringkasan
    const own = await get(`/verifications/${vid}`, 'staf');
    expect(own.body.data.turns.map((t) => t.speaker)).toEqual(['ai', 'human', 'ai', 'human', 'ai', 'human']);
    expect(own.body.data.turns[1].text).toContain('JAWABAN-RAHASIA');
    const hr = await get(`/verifications/${vid}`);
    expect(hr.body.data.turns).toBeUndefined();
    expect(hr.body.data.summary).toContain('terhambat');
    const all = await get('/verifications');
    expect(JSON.stringify([hr.body, all.body])).not.toContain('JAWABAN-RAHASIA');
    expect((await get(`/verifications/${vid}`, 'spv')).status).toBe(404);
    expect((await get(`/verifications/${vid}`, 'pim')).status).toBe(404);
    expect((await get('/verifications', 'spv')).status).toBe(403);
    expect((await get('/verifications', 'pim')).status).toBe(403);
    // lintas tenant: HR tenant B tidak menjangkau verifikasi tenant A
    expect((await get(`/verifications/${vid}`, 'hrB')).status).toBe(404);
    expect((await post(`/verifications/${vid}/cancel`, {}, 'hrB')).status).toBe(404);
    expect((await post(`/verifications/${vid}/turns`, { text: 'x' }, 'stafB')).status).toBe(404);
    expect((await get('/verifications', 'hrB')).body.data).toEqual([]);
    // batas tiga jawaban dan status dijaga di store, bukan hanya di router
    expect(await stores.ina.addTurn(A.id, vid, 'human', 'susulan', { maxHuman: 3 })).toBe(false);

    // status tindakan tidak berubah otomatis; HR melihat status yang dilaporkan, atasan tidak
    const hrRow = (await get('/actions')).body.data.find((x) => x.id === id.aSop);
    expect(hrRow.status).toBe('new');
    expect(hrRow.lastVerification).toMatchObject({ id: vid, status: 'completed', reportedStatus: 'blocked' });
    const spvRow = (await get('/actions', 'spv')).body.data.find((x) => x.id === id.aSop);
    expect(spvRow.lastVerification.status).toBe('completed');
    expect(spvRow.lastVerification.reportedStatus).toBeUndefined();

    // enkripsi dan jejak
    const raw = await sql('SELECT t.text, v.summary, v.consent_version FROM ina_verification_turns t JOIN ina_verifications v ON v.id = t.verification_id WHERE v.id = :vid', { vid });
    expect(raw).toHaveLength(6);
    expect(JSON.stringify(raw)).not.toMatch(/JAWABAN-RAHASIA|terhambat|Terkendala/);
    expect(raw[0].consent_version).toBe('ina-verifikasi-v1.0');
    const log = await audits('ina.verification');
    expect(log.map((x) => x.meta.event || x.action)).toEqual(['create', 'consent', 'completed']);
    expect(JSON.stringify(log)).not.toContain('JAWABAN-RAHASIA');
    expect((await audits('ina.verification_transcript'))[0].meta.self).toBe(true);
  });

  it('verifikasi: selesai lebih awal, tarik diri menghapus percakapan, batal oleh HR, dan batal otomatis', async () => {
    // selesai lebih awal setelah satu jawaban
    const v2 = (await post(`/actions/${id.aSop}/verifications`, {})).body.data.id;
    await post(`/verifications/${v2}/consent`, { consentVersion: 'ina-verifikasi-v1.0' }, 'staf');
    await post(`/verifications/${v2}/turns`, { text: 'Sudah selesai kemarin' }, 'staf');
    const done = await post(`/verifications/${v2}/complete`, {}, 'staf');
    expect(done.body.data).toMatchObject({ status: 'completed', reportedStatus: 'done', done: true });

    // tarik diri: percakapan dihapus
    const v3 = (await post(`/actions/${id.aSop}/verifications`, {})).body.data.id;
    await post(`/verifications/${v3}/consent`, { consentVersion: 'ina-verifikasi-v1.0' }, 'staf');
    await post(`/verifications/${v3}/turns`, { text: 'jawaban yang ditarik' }, 'staf');
    expect((await post(`/verifications/${v3}/withdraw`, {}, 'hr')).status).toBe(404);
    expect((await post(`/verifications/${v3}/withdraw`, {}, 'staf')).body.data.status).toBe('withdrawn');
    expect((await sql('SELECT count(*)::int AS n FROM ina_verification_turns WHERE verification_id = :v3', { v3 }))[0].n).toBe(0);
    expect((await post(`/verifications/${v3}/withdraw`, {}, 'staf')).body.error.code).toBe('INVALID_STATE');
    // giliran tidak bisa menyusul setelah ditarik (balapan turns vs withdraw)
    expect(await stores.ina.addTurn(A.id, v3, 'human', 'menyusul')).toBe(false);
    expect((await sql('SELECT count(*)::int AS n FROM ina_verification_turns WHERE verification_id = :v3', { v3 }))[0].n).toBe(0);
    // verifikasi yang ditarik tidak menjadi "verifikasi terakhir" tindakan
    expect((await get(`/actions/${id.aSop}`)).body.data.lastVerification.id).toBe(v2);

    // batal oleh HR
    const v4 = (await post(`/actions/${id.aSop}/verifications`, {})).body.data.id;
    expect((await post(`/verifications/${v4}/cancel`, {}, 'staf')).status).toBe(403);
    expect((await post(`/verifications/${v4}/cancel`, {})).body.data.status).toBe('cancelled');
    expect((await post(`/verifications/${v4}/consent`, { consentVersion: 'ina-verifikasi-v1.0' }, 'staf')).body.error.code).toBe('INVALID_STATE');
    expect((await get('/verifications/mine', 'staf')).body.data.map((v) => v.id)).not.toContain(v4);

    // ganti pemilik atau menutup tindakan membatalkan verifikasi terbuka
    const v5 = (await post(`/actions/${id.aSop}/verifications`, {})).body.data.id;
    const moved = await patch(`/actions/${id.aSop}`, { ownerUserId: id.lain });
    expect(moved.body.data.ownerUserId).toBe(id.lain);
    expect((await sql('SELECT status FROM ina_verifications WHERE id = :v5', { v5 }))[0].status).toBe('cancelled');
    // pemilik lama masih melihat riwayatnya, tetapi tidak lagi judul tindakan yang sekarang
    const lama = (await get(`/verifications/${v2}`, 'staf')).body.data;
    expect(lama.actionTitle).toBe('Tindakan perbaikan (sudah dialihkan)');
    expect(lama.turns.length).toBeGreaterThan(0);
    expect((await get(`/verifications/${v2}`)).body.data.actionTitle).toBe('Perbarui SOP eskalasi');
    const v6 = (await post(`/actions/${id.aSop}/verifications`, {})).body.data.id;
    expect((await get('/verifications/mine', 'lain')).body.data.map((v) => v.id)).toEqual([v6]);
    await patch(`/actions/${id.aSop}`, { status: 'done' });
    expect((await sql('SELECT status FROM ina_verifications WHERE id = :v6', { v6 }))[0].status).toBe('cancelled');
    expect((await post(`/actions/${id.aSop}/verifications`, {})).body.error.code).toBe('INVALID_STATE'); // tindakan sudah selesai
    expect((await get('/verifications/bukan-uuid')).status).toBe(404);
    // status yang dibaca sudah basi (request lain lebih dulu): tidak ada yang disimpan
    expect(await stores.ina.updateAction(A.id, id.aSop, { status: 'rejected' }, 'new')).toBeNull();
    expect((await get(`/actions/${id.aSop}`)).body.data.status).toBe('done');
    // atasan melihat tindakan yang ia miliki sendiri
    await patch(`/actions/${id.aBudaya}`, { ownerUserId: id.spv });
    expect((await get('/actions', 'spv')).body.data.map((x) => x.id)).toContain(id.aBudaya);
  });

  describe('triase review egm 19 Nov', () => {
    it('CD-1/CD-12: pemilik yang dinonaktifkan tidak mengunci ubahan lain; UUID huruf besar yang sama bukan perubahan', async () => {
      await addUser(A.id, 'keluar', 'learner');
      const a = (await post('/actions', { title: 'Perbaiki alat ukur', category: 'alat', ownerUserId: id.keluar })).body.data;
      await db.query("UPDATE users SET status = 'disabled' WHERE id = :u", { replacements: { u: id.keluar } });
      // formulir web selalu mengirim ownerUserId apa adanya
      const res = await patch(`/actions/${a.id}`, { title: 'Perbaiki alat ukur v2', ownerUserId: id.keluar });
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Perbaiki alat ukur v2');
      // mengganti ke akun nonaktif tetap ditolak
      expect((await patch(`/actions/${a.id}`, { ownerUserId: id.keluar.toUpperCase() })).status).toBe(200);
      const before = (await audits('ina.action')).length;
      await patch(`/actions/${a.id}`, { ownerUserId: id.keluar.toUpperCase() });
      expect((await audits('ina.action')).length).toBe(before);
      const b = (await post('/actions', { title: 'Tindakan lain', category: 'sop' })).body.data;
      expect((await patch(`/actions/${b.id}`, { ownerUserId: id.keluar })).status).toBe(400);
    });

    it('IR-1: verifikasi tidak bisa dibuat di store bila tindakan sudah ditutup, pindah pemilik, atau menyangkut individu', async () => {
      const a = (await post('/actions', { title: 'Revisi SOP shift', category: 'sop', ownerUserId: id.staf })).body.data;
      const by = id.hr;
      await patch(`/actions/${a.id}`, { ownerUserId: id.lain });
      expect(await stores.ina.createVerification(A.id, { actionId: a.id, ownerUserId: id.staf, assignedBy: by })).toBeNull();
      await patch(`/actions/${a.id}`, { involvesIndividual: true });
      expect(await stores.ina.createVerification(A.id, { actionId: a.id, ownerUserId: id.lain, assignedBy: by })).toBeNull();
      await patch(`/actions/${a.id}`, { involvesIndividual: false, status: 'rejected' });
      expect(await stores.ina.createVerification(A.id, { actionId: a.id, ownerUserId: id.lain, assignedBy: by })).toBeNull();
      const c = (await post('/actions', { title: 'Revisi SOP malam', category: 'sop', ownerUserId: id.staf })).body.data;
      expect(await stores.ina.createVerification(A.id, { actionId: c.id, ownerUserId: id.staf, assignedBy: by })).toMatchObject({ status: 'assigned' });
    });

    it('CD-5: verifikasi yang batal otomatis tercatat sebagai event cancelled di audit ina.verification', async () => {
      const a = (await post('/actions', { title: 'Ganti vendor alat', category: 'alat', ownerUserId: id.staf })).body.data;
      const v = (await post(`/actions/${a.id}/verifications`, {})).body.data.id;
      await patch(`/actions/${a.id}`, { ownerUserId: id.lain });
      const last = (await audits('ina.verification')).pop();
      expect(last.meta).toMatchObject({ event: 'cancelled', objectIds: [v], reason: 'owner_changed' });
    });

    it('IC-1: ubah status dan efek sampingnya atomik; gagal di tengah tidak menyisakan status setengah jadi', async () => {
      const a = (await post('/actions', { title: 'Uji atomik', category: 'sop', ownerUserId: id.staf })).body.data;
      const v = (await post(`/actions/${a.id}/verifications`, {})).body.data.id;
      // findingStatus tidak sah memicu CHECK di lna_findings: seluruh perubahan dibatalkan
      await expect(stores.ina.updateAction(A.id, a.id, { status: 'done' }, 'new', {
        cancelVerifications: true, finding: { id: id.fNon, status: 'tidak-sah' },
      })).rejects.toThrow();
      expect((await get(`/actions/${a.id}`)).body.data.status).toBe('new');
      expect((await sql('SELECT status FROM ina_verifications WHERE id = :v', { v }))[0].status).toBe('assigned');
    });

    it('ZO-4: perubahan status temuan dari INA tercatat di audit tna.finding', async () => {
      await addFinding(A.id, 'fAudit', { userId: id.lain, projectId: (await sql('SELECT project_id FROM lna_findings WHERE id = :f', { f: id.fNon }))[0].project_id });
      const a = (await post('/actions', { title: 'Dari temuan audit', category: 'sistem', findingId: id.fAudit, involvesIndividual: false })).body.data;
      await patch(`/actions/${a.id}`, { status: 'in_progress' });
      await patch(`/actions/${a.id}`, { status: 'done' });
      const log = (await audits('tna.finding')).filter((x) => (x.meta.objectIds || []).includes(id.fAudit));
      expect(log.map((x) => x.meta.status)).toEqual([{ from: 'open', to: 'planned' }, { from: 'planned', to: 'resolved' }]);
      expect(log[0].meta.via).toBe('ina');
    });

    it('CD-7: asal gap tidak diisi otomatis dari baris kinerja per karyawan', async () => {
      const [[rec]] = await db.query(
        `INSERT INTO lna_performance_records (tenant_id, user_id, metric_type, name, period) VALUES (:t, :u, 'sla', 'SLA tiket Karyawan X', '2026-Q4') RETURNING id`,
        { replacements: { t: A.id, u: id.staf } });
      const a = (await post('/actions', { title: 'Perbaiki antrean tiket', category: 'sistem', performanceRecordId: rec.id })).body.data;
      expect(a.sourceRef).toBeNull();
    });

    it('IZ-4: izin atasan dari panel INA dicatat dengan nama sumber daya yang sama dengan TNA', async () => {
      await request(app).put(`${BASE}/access/${id.spv2}`).set(as('hr'));
      const row = (await audits('tna.non_training_access')).pop();
      expect(row).toMatchObject({ action: 'create' });
      expect(row.meta.via).toBe('ina');
      await request(app).delete(`${BASE}/access/${id.spv2}`).set(as('hr'));
    });
  });
});
