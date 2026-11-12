// Alur POC ELGOS Desember (DNA + TNA) dari ujung ke ujung di Postgres.
// Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan (CI menyiapkannya).
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { createCatalogService, memoryAdapter } = require('../../src/integrations/catalog');
const { makeConfig } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('POC DNA + TNA (Postgres)', () => {
  let db; let app; let tokens; let tenant; let otherTenant; const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const catalog = createCatalogService({ elitementor: memoryAdapter('elitementor', [{ ref: 'prog-12', title: 'Membaca Kontrak Proyek', keywords: ['kontrak'] }]) });
    app = createApp({ config, stores: createStores(db), catalog });
    tokens = createTokenService(config.jwt);

    const slug = `poc-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'ELGOS uji') RETURNING id`, { replacements: { slug } });
    [[otherTenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Lain') RETURNING id`, { replacements: { slug: `${slug}-x` } });
    const add = async (key, role, extra = {}) => {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status, supervisor_id)
         VALUES (:t, :email, :name, :emp, :role, 'active', :sup) RETURNING id`,
        { replacements: { t: extra.tenant || tenant.id, email: `${key}@elgos.test`, name: key, emp: `E-${key}`, role, sup: extra.sup || null } },
      );
      u[key] = row.id;
      tok[key] = tokens.sign({ id: row.id, tenantId: extra.tenant || tenant.id, role, email: `${key}@elgos.test` });
    };
    await add('hr', 'hr_admin');
    await add('eta', 'eta_admin');
    await add('spv', 'supervisor');
    await add('dimas', 'learner', { sup: null });
    await add('rina', 'learner');
    await add('budi', 'learner');
    await add('luar', 'hr_admin', { tenant: otherTenant.id });
    await db.query('UPDATE users SET supervisor_id = :spv WHERE id IN (:ids)', { replacements: { spv: u.spv, ids: [u.dimas, u.rina] } });
    for (const t of [tenant.id, otherTenant.id]) {
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t } });
      await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'module.dna', true), (:t, 'module.tna', true)`, { replacements: { t } });
    }
  });

  afterAll(async () => {
    await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, otherTenant.id] } });
    await db.close();
  });

  let role; let levels; let compCore; let projectId;

  it('HR menyusun jenjang dan kamus kompetensi (konfigurasi per klien)', async () => {
    const res = await request(app).post('/api/dna/job-roles').set(as('hr')).send({
      name: 'Service Delivery L1',
      levels: [
        { name: 'Probation', programTier: 'basic' }, { name: 'Junior', programTier: 'basic' },
        { name: 'Senior', programTier: 'intermediate' }, { name: 'Leader', programTier: 'advanced' },
      ],
    });
    expect(res.status).toBe(201);
    role = res.body.data; levels = role.levels;
    expect(levels.map((l) => l.name)).toEqual(['Probation', 'Junior', 'Senior', 'Leader']);

    const bulk = await request(app).post('/api/dna/competencies/bulk').set(as('hr')).send({
      items: [
        { kind: 'job', jobRoleId: role.id, careerLevelId: levels[1].id, name: 'Memahami kontrak proyek', source: 'dacum', importance: 4 },
        { kind: 'job', jobRoleId: role.id, name: 'Menjalankan SOP L1', source: 'hr_rule', requiredScore: 2 },
        { kind: 'core', name: 'Komunikasi pelanggan' },
      ],
    });
    expect(bulk.status).toBe(201);
    compCore = bulk.body.data[2];

    const bad = await request(app).post('/api/dna/competencies').set(as('hr')).send({ kind: 'job', name: 'x' });
    expect(bad.status).toBe(400);
    const learnerDenied = await request(app).post('/api/dna/competencies').set(as('dimas')).send({ kind: 'core', name: 'x' });
    expect(learnerDenied.status).toBe(403);
  });

  it('alur DACUM masih menunggu keputusan (stub 501)', async () => {
    const res = await request(app).post('/api/dna/dacum/sessions').set(as('hr')).send({});
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('DECISION_PENDING');
  });

  it('HR menempatkan karyawan dan mencatat kelulusan program', async () => {
    for (const k of ['dimas', 'rina', 'budi']) {
      const res = await request(app).put(`/api/dna/employees/${u[k]}/position`).set(as('hr')).send({ jobRoleId: role.id, careerLevelId: levels[1].id });
      expect(res.status).toBe(200);
    }
    await request(app).post('/api/dna/program-completions').set(as('hr')).send({ userId: u.rina, programTier: 'basic', status: 'passed' }).expect(201);
    await request(app).post('/api/dna/program-completions').set(as('hr')).send({ userId: u.rina, programTier: 'intermediate', status: 'passed' }).expect(201);
    await request(app).post('/api/dna/program-completions').set(as('hr')).send({ userId: u.dimas, programTier: 'basic', status: 'passed' }).expect(201);
  });

  it('POC: HR mengimpor hasil wawancara DNA manual ELGOS, gap tampil per karyawan', async () => {
    const res = await request(app).post('/api/dna/assessments/import').set(as('hr')).send({
      assessor: 'Tim ETA', assessedAt: '2026-10-20',
      rows: [
        { employeeId: 'E-rina', competency: 'memahami kontrak proyek', score: 4, evidence: 'Wawancara 20 Okt' },
        { email: 'rina@elgos.test', competency: 'Komunikasi pelanggan', score: 2 },
        { employeeId: 'E-budi', competencyId: compCore.id, score: '3' },
        { employeeId: 'E-tidak-ada', competency: 'Komunikasi pelanggan', score: 3 },
        { employeeId: 'E-rina', competency: 'Kompetensi asing', score: 3 },
        { employeeId: 'E-rina', competency: 'Komunikasi pelanggan', score: 7 },
        { employeeId: 'E-luar', competency: 'Komunikasi pelanggan', score: 3 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.imported).toBe(3);
    expect(res.body.data.rejected.map((r) => r.index).sort()).toEqual([3, 4, 5, 6]);
    expect((await request(app).post('/api/dna/assessments/import').set(as('dimas')).send({ rows: [] })).status).toBe(403);

    const rina = await request(app).get(`/api/dna/employees/${u.rina}`).set(as('spv'));
    expect(rina.status).toBe(200);
    const kontrak = rina.body.data.gap.items.find((g) => g.name === 'Memahami kontrak proyek');
    expect(kontrak).toMatchObject({ score: 4, status: 'met', source: 'manual_interview' });
    expect(rina.body.data.gap.items.find((g) => g.name === 'Komunikasi pelanggan')).toMatchObject({ score: 2, status: 'gap' });
    expect(rina.body.data.gap.summary.assessed).toBe(2);
  });

  it('wawancara DNA menghasilkan skor gap (penyedia AI stub)', async () => {
    const [[p]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'POC Des') RETURNING id`, { replacements: { t: tenant.id } });
    projectId = p.id;
    // Cadence 11 Nov (C2): wawancara AI DNA tidak dipakai di POC, di balik flag dna.ai_interview (default mati)
    const off = await request(app).post('/api/dna/sessions').set(as('hr')).send({ projectId, intervieweeIds: [u.dimas] });
    expect(off.status).toBe(403);
    expect(off.body.error.code).toBe('FEATURE_DISABLED');
    await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'dna.ai_interview', true)`, { replacements: { t: tenant.id } });
    const created = await request(app).post('/api/dna/sessions').set(as('hr')).send({ projectId, intervieweeIds: [u.dimas] });
    expect(created.status).toBe(201);
    const sid = created.body.data[0].id;

    expect((await request(app).post(`/api/dna/sessions/${sid}/consent`).set(as('rina'))).status).toBe(404); // bukan sesinya
    const consent = await request(app).post(`/api/dna/sessions/${sid}/consent`).set(as('dimas'));
    expect(consent.status).toBe(200);
    expect(consent.body.data.question.text).toMatch(/Komunikasi pelanggan|kontrak|SOP/);

    let done = false; let guard = 0;
    while (!done && guard++ < 10) {
      const t = await request(app).post(`/api/dna/sessions/${sid}/turns`).set(as('dimas')).send({ text: 'Saya menangani tiket dan membaca kontrak proyek pelanggan.' });
      expect(t.status).toBe(200);
      done = t.body.data.done;
    }
    const complete = await request(app).post(`/api/dna/sessions/${sid}/complete`).set(as('dimas'));
    expect(complete.status).toBe(200);
    expect(complete.body.data).toMatchObject({ status: 'completed', assessments: 3, aiProvider: 'stub' });

    const detail = await request(app).get(`/api/dna/employees/${u.dimas}`).set(as('dimas'));
    expect(detail.body.data.gap.summary.assessed).toBe(3);
    expect(detail.body.data.career.currentLevel.name).toBe('Junior');
    expect(detail.body.data.career.promotionCandidate).toBeUndefined(); // learner tidak melihat saran promosi
  });

  it('RG-3: learner dirinya, atasan timnya, HR semua; kandidat promosi hanya HR', async () => {
    const names = async (who) => (await request(app).get('/api/dna/employees').set(as(who))).body.data.map((p) => p.name).sort();
    expect(await names('dimas')).toEqual(['dimas']);
    expect(await names('spv')).toEqual(['dimas', 'rina', 'spv']);
    expect(await names('hr')).toEqual(['budi', 'dimas', 'rina', 'spv']);

    expect((await request(app).get(`/api/dna/employees/${u.budi}`).set(as('spv'))).status).toBe(404);
    expect((await request(app).get('/api/dna/promotion-candidates').set(as('spv'))).status).toBe(403);
    const cand = await request(app).get('/api/dna/promotion-candidates').set(as('hr'));
    expect(cand.body.data.map((p) => p.name)).toEqual(['rina']);
  });

  it('tenant lain tidak melihat data', async () => {
    const res = await request(app).get('/api/dna/employees').set(as('luar'));
    expect(res.body.data).toEqual([]);
    expect((await request(app).get(`/api/dna/employees/${u.dimas}`).set(as('luar'))).status).toBe(404);
  });

  let tnaSessionDimas;
  it('HR mengunggah data kinerja (RG-2), baris tak dikenal ditolak', async () => {
    const res = await request(app).post('/api/tna/performance/import').set(as('hr')).send({
      period: '2026-11', projectId,
      rows: [
        { employeeId: 'E-dimas', metricType: 'sla', name: 'Waktu respons tiket (menit)', target: 15, actual: 30, direction: 'lower' },
        { employeeId: 'E-dimas', metricType: 'kpi', name: 'Tiket selesai', target: 100, actual: 110 },
        { email: 'rina@elgos.test', metricType: 'okr', name: 'Kepuasan pelanggan', target: 90, actual: 70 },
        { employeeId: 'E-tidak-ada', metricType: 'kpi', name: 'x', target: 1, actual: 0 },
        { employeeId: 'E-budi', metricType: 'nps', name: 'x', target: 1, actual: 0 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ imported: 3, red: 2 });
    expect(res.body.data.rejected.map((r) => r.index).sort()).toEqual([3, 4]);
  });

  it('cakupan TNA: default hanya target merah, opsi semua karyawan di role tertentu', async () => {
    const redOnly = await request(app).post(`/api/tna/projects/${projectId}/interviews`).set(as('hr')).send({ period: '2026-11' });
    expect(redOnly.status).toBe(201);
    expect(redOnly.body.data.scope).toBe('red_only');
    expect(redOnly.body.data.scheduled).toBe(2);
    // Perusahaan lain bisa memilih semua karyawan di role tertentu; job role wajib disebut
    const noRole = await request(app).post(`/api/tna/projects/${projectId}/interviews`).set(as('hr')).send({ scope: 'all_members', period: '2026-11' });
    expect(noRole.status).toBe(400);
    const roles = await request(app).get('/api/tna/job-roles').set(as('hr'));
    expect(roles.body.data.map((x) => x.name)).toEqual(['Service Delivery L1']);
    expect((await request(app).get('/api/tna/job-roles').set(as('dimas'))).status).toBe(403);
    const all = await request(app).post(`/api/tna/projects/${projectId}/interviews`).set(as('hr')).send({ scope: 'all_members', jobRoleId: role.id, period: '2026-11' });
    expect(all.body.data).toMatchObject({ scheduled: 1, skipped: 2 }); // budi ditambahkan, yang lain sudah terjadwal
    expect((await request(app).post(`/api/tna/projects/${projectId}/interviews`).set(as('hr')).send({ scope: 'semua' })).status).toBe(400);
    expect(roles.body.defaults).toEqual({ scope: 'red_only', jobRoleId: null });
    tnaSessionDimas = redOnly.body.data.sessions.find((s) => s.intervieweeId === u.dimas);
    expect(tnaSessionDimas.triggerRecordIds).toHaveLength(1);
  });

  it('wawancara TNA membahas target merah dan memisahkan training / non-training', async () => {
    const sid = tnaSessionDimas.id;
    const consent = await request(app).post(`/api/tna/sessions/${sid}/consent`).set(as('dimas'));
    expect(consent.body.data.question.text).toMatch(/Waktu respons tiket/);
    await request(app).post(`/api/tna/sessions/${sid}/turns`).set(as('dimas')).send({ text: 'Saya sulit memahami kontrak proyek pelanggan.' }).expect(200);
    await request(app).post(`/api/tna/sessions/${sid}/turns`).set(as('dimas')).send({ text: 'SOP L1 juga belum diperbarui dan tools Pandu lambat.' }).expect(200);
    const complete = await request(app).post(`/api/tna/sessions/${sid}/complete`).set(as('dimas'));
    expect(complete.body.data.findings).toBe(2);

    // RG-4: non-training direkam tapi tidak tampil selama INA mati
    const [[{ n }]] = await db.query(`SELECT count(*)::int AS n FROM lna_findings WHERE session_id = :sid AND category = 'non_training'`, { replacements: { sid } });
    expect(n).toBe(1);
    const visible = await request(app).get('/api/tna/findings').set(as('hr'));
    expect(visible.body.data.every((f) => f.category === 'training')).toBe(true);
    expect(visible.body.data[0]).toMatchObject({ userName: 'dimas', competencyName: 'Memahami kontrak proyek' });
  });

  it('Pareto untuk HR/atasan, bukan learner', async () => {
    expect((await request(app).get('/api/tna/pareto').set(as('dimas'))).status).toBe(403);
    const hr = await request(app).get(`/api/tna/pareto?projectId=${projectId}`).set(as('hr'));
    expect(hr.body.data[0]).toMatchObject({ label: 'Memahami kontrak proyek', people: 1 });
    const spv = await request(app).get('/api/tna/pareto').set(as('spv'));
    expect(spv.body.data).toHaveLength(1);
  });

  it('training plan dari katalog; learner bisa request; atasan memproses timnya', async () => {
    const [finding] = (await request(app).get('/api/tna/findings').set(as('hr'))).body.data;
    const plan = await request(app).post(`/api/tna/findings/${finding.id}/plan`).set(as('hr')).send({});
    expect(plan.status).toBe(201);
    expect(plan.body.data).toMatchObject({ status: 'proposed', catalogSource: 'elitementor', catalogItemRef: 'prog-12' });

    const reqRes = await request(app).post('/api/tna/training-requests').set(as('dimas')).send({ findingId: finding.id, note: 'Mohon pelatihan kontrak' });
    expect(reqRes.status).toBe(201);
    expect((await request(app).post('/api/tna/training-requests').set(as('rina')).send({ findingId: finding.id })).status).toBe(404);

    const patched = await request(app).patch(`/api/tna/plan-items/${reqRes.body.data.id}`).set(as('spv')).send({ status: 'assigned' });
    expect(patched.status).toBe(200);
    expect((await request(app).patch(`/api/tna/plan-items/${reqRes.body.data.id}`).set(as('dimas')).send({ status: 'completed' })).status).toBe(403);

    const mine = await request(app).get('/api/tna/plan-items').set(as('dimas'));
    expect(mine.body.data).toHaveLength(2);
    expect((await request(app).get('/api/tna/plan-items').set(as('rina'))).body.data).toHaveLength(0);
  });

  it('modul belum ada di katalog -> needs_module (HR membuat/memanggil vendor)', async () => {
    const [[f]] = await db.query(
      `INSERT INTO lna_findings (tenant_id, project_id, user_id, competency_id, category, title)
       VALUES (:t, :p, :u, :c, 'training', 'Komunikasi saat eskalasi') RETURNING id`,
      { replacements: { t: tenant.id, p: projectId, u: u.rina, c: compCore.id } },
    );
    const plan = await request(app).post(`/api/tna/findings/${f.id}/plan`).set(as('hr')).send({ programTier: 'basic' });
    expect(plan.status).toBe(201);
    expect(plan.body.data).toMatchObject({ status: 'needs_module', catalogSource: null });
    await db.query('DELETE FROM lna_findings WHERE id = :id', { replacements: { id: f.id } });
  });

  it('dashboard TNA sesuai peran', async () => {
    const hr = await request(app).get('/api/tna/dashboard').set(as('hr'));
    expect(hr.body.data).toMatchObject({ redTargets: 2, trainingFindings: 1 });
    expect(hr.body.data.sessions).toMatchObject({ completed: 1, scheduled: 2 });
    const budi = await request(app).get('/api/tna/dashboard').set(as('budi'));
    expect(budi.body.data).toMatchObject({ redTargets: 0, trainingFindings: 0, people: 1 });
  });

  it('BT-19/BT-29: klien bisa default ke semua anggota job role (ELGOS L1)', async () => {
    await db.query(`UPDATE tenants SET settings = CAST(:s AS jsonb) WHERE id = :t`, {
      replacements: { t: tenant.id, s: JSON.stringify({ tna: { interviewScope: 'all_members', interviewJobRoleId: role.id } }) },
    });
    const defaults = (await request(app).get('/api/tna/job-roles').set(as('hr'))).body.defaults;
    expect(defaults).toEqual({ scope: 'all_members', jobRoleId: role.id });
    const [[p]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'ELGOS L1') RETURNING id`, { replacements: { t: tenant.id } });
    const res = await request(app).post(`/api/tna/projects/${p.id}/interviews`).set(as('hr')).send({ period: '2026-11' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ scope: 'all_members', scheduled: 3 }); // dimas, rina, budi di L1
    await db.query(`UPDATE tenants SET settings = '{}'::jsonb WHERE id = :t`, { replacements: { t: tenant.id } });
  });

  it('C4: TNA berjalan tanpa DACUM/kamus kompetensi (karyawan tanpa job role)', async () => {
    const [[row]] = await db.query(
      `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, 'sari@elgos.test', 'sari', 'E-sari', 'learner', 'active') RETURNING id`,
      { replacements: { t: tenant.id } },
    );
    const sari = { Authorization: `Bearer ${tokens.sign({ id: row.id, tenantId: tenant.id, role: 'learner', email: 'sari@elgos.test' })}` };
    const [[p]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'Sales tanpa DNA') RETURNING id`, { replacements: { t: tenant.id } });
    await request(app).post('/api/tna/performance/import').set(as('hr')).send({
      period: '2026-11', projectId: p.id, rows: [{ employeeId: 'E-sari', metricType: 'kpi', name: 'Closing deal', target: 10, actual: 4 }],
    }).expect(201);
    const sched = await request(app).post(`/api/tna/projects/${p.id}/interviews`).set(as('hr')).send({ period: '2026-11' });
    const s = sched.body.data.sessions.find((x) => x.intervieweeId === row.id);
    expect(s).toBeTruthy();
    expect((await request(app).post(`/api/tna/sessions/${s.id}/consent`).set(sari)).body.data.question.text).toMatch(/Closing deal/);
    await request(app).post(`/api/tna/sessions/${s.id}/turns`).set(sari).send({ text: 'Saya belum menguasai teknik negosiasi.' }).expect(200);
    const done = await request(app).post(`/api/tna/sessions/${s.id}/complete`).set(sari);
    expect(done.status).toBe(200);
    const [finding] = (await request(app).get(`/api/tna/findings?projectId=${p.id}`).set(as('hr'))).body.data;
    expect(finding).toMatchObject({ category: 'training', competencyId: null });
    const plan = await request(app).post(`/api/tna/findings/${finding.id}/plan`).set(as('hr')).send({});
    expect(plan.body.data.status).toBe('needs_module');
  });
});
