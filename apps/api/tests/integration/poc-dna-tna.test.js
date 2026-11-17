// Alur POC ELGOS Desember (DNA + TNA) dari ujung ke ujung di Postgres.
// Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan (CI menyiapkannya).
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { createCatalogService, memoryAdapter } = require('../../src/integrations/catalog');
const { makeConfig } = require('../helpers');
const { createBedrockProvider } = require('../../src/ai/bedrock-provider');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('POC DNA + TNA (Postgres)', () => {
  let db; let app; let tokens; let baseConfig; let stores; let tenant; let otherTenant; const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });

  beforeAll(async () => {
    const config = makeConfig();
    baseConfig = config;
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const catalog = createCatalogService({ elitementor: memoryAdapter('elitementor', [{ ref: 'prog-12', title: 'Membaca Kontrak Proyek', keywords: ['kontrak'] }]) });
    stores = createStores(db);
    app = createApp({ config, stores, catalog });
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
    // audit_logs append-only (R2-2): hapus tenant uji hanya lewat mode pemeliharaan DBA
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, otherTenant.id] }, transaction });
    });
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
    // R3-6: setiap panggilan AI tercatat per sesi (stub: token 0)
    expect(complete.body.data.aiUsage).toMatchObject({ calls: 6, inputTokens: 0, outputTokens: 0 }); // 5 panggilan pertanyaan (terakhir = selesai) + 1 penilaian

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

    // G2-A: rekomendasi promosi = modul terpisah, flag promotion.recommendation default mati
    const off = await request(app).get('/api/dna/promotion-candidates').set(as('hr'));
    expect(off.status).toBe(403);
    expect(off.body.error.code).toBe('FEATURE_DISABLED');
    const hrList = (await request(app).get('/api/dna/employees').set(as('hr'))).body.data;
    expect(hrList.every((p) => p.career.promotionCandidate === undefined)).toBe(true);
    await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'promotion.recommendation', true)`, { replacements: { t: tenant.id } });

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
  it('R2-2: baca data individu dicatat di audit log; agregat tidak; log append-only', async () => {
    const auditRows = async (resource) => db.query(
      `SELECT user_id AS "userId", action, meta FROM audit_logs WHERE tenant_id = :t AND resource = :resource ORDER BY id`,
      { replacements: { t: tenant.id, resource }, type: 'SELECT' },
    );
    await request(app).get(`/api/dna/employees/${u.dimas}`).set(as('spv')).expect(200);
    const row = (await auditRows('dna.employee_result')).filter((r) => r.userId === u.spv).pop();
    expect(row).toMatchObject({ action: 'read', meta: { employeeIds: [u.dimas], self: false, role: 'supervisor', objectType: 'dna_profile' } });

    await request(app).get('/api/tna/findings').set(as('eta')).expect(200);
    const findings = (await auditRows('tna.findings')).filter((r) => r.userId === u.eta);
    expect(findings.length).toBe(1);
    expect(findings[0].meta.employeeIds.length).toBeGreaterThan(0);

    const [[s]] = await db.query(`SELECT id FROM lna_interview_sessions WHERE tenant_id = :t AND submodule = 'tna' LIMIT 1`, { replacements: { t: tenant.id } });
    await request(app).get(`/api/tna/sessions/${s.id}`).set(as('hr')).expect(200);
    const [tr] = (await auditRows('tna.interview_transcript')).filter((r) => r.userId === u.hr);
    expect(tr.meta).toMatchObject({ objectType: 'interview_session', objectIds: [s.id] });

    const before = (await auditRows('tna.dashboard')).length;
    await request(app).get('/api/tna/dashboard').set(as('hr')).expect(200);
    expect((await auditRows('tna.dashboard')).length).toBe(before);

    await expect(db.query('UPDATE audit_logs SET resource = \'x\' WHERE tenant_id = :t', { replacements: { t: tenant.id } })).rejects.toThrow(/append-only/);
    await expect(db.query('DELETE FROM audit_logs WHERE tenant_id = :t', { replacements: { t: tenant.id } })).rejects.toThrow(/append-only/);
  });

  it('R2-1: flag hanya diubah Admin ETA, kill switch global, semua perubahan diaudit', async () => {
    expect((await request(app).put('/api/admin/flags/dna.ai_interview').set(as('hr')).send({ enabled: true })).status).toBe(403);
    expect((await request(app).get('/api/admin/flags').set(as('hr'))).status).toBe(403);

    const on = await request(app).put('/api/admin/flags/dna.ai_interview').set(as('eta')).send({ enabled: true });
    expect(on.status).toBe(200);
    expect(on.body.data).toMatchObject({ key: 'dna.ai_interview', tenantEnabled: true, killSwitch: false, effective: true });
    expect((await request(app).get('/api/dna/sessions').set(as('hr'))).status).toBe(200);
    // flag tenant lain tidak berubah
    expect((await request(app).get('/api/me/access').set(as('luar'))).body.flags['dna.ai_interview']).toBe(false);

    expect((await request(app).put('/api/admin/kill-switches/dna.ai_interview').set(as('eta')).send({ active: true })).status).toBe(400);
    try {
      await request(app).put('/api/admin/kill-switches/dna.ai_interview').set(as('eta')).send({ active: true, reason: 'Biaya AI melonjak' }).expect(200);
      expect((await request(app).get('/api/dna/sessions').set(as('hr'))).status).toBe(403);
      expect((await request(app).get('/api/me/access').set(as('hr'))).body.flags['dna.ai_interview']).toBe(false);
    } finally {
      await request(app).put('/api/admin/kill-switches/dna.ai_interview').set(as('eta')).send({ active: false }).expect(200);
    }
    expect((await request(app).get('/api/dna/sessions').set(as('hr'))).status).toBe(200);
    await request(app).put('/api/admin/flags/dna.ai_interview').set(as('eta')).send({ enabled: false }).expect(200);

    const logs = await db.query(
      `SELECT resource, meta FROM audit_logs WHERE tenant_id = :t AND resource IN ('feature_flag','kill_switch') ORDER BY id`,
      { replacements: { t: tenant.id }, type: 'SELECT' },
    );
    expect(logs.map((l) => [l.resource, l.meta.to])).toEqual([
      ['feature_flag', true], ['kill_switch', true], ['kill_switch', false], ['feature_flag', false],
    ]);
    expect(logs[1].meta).toMatchObject({ key: 'dna.ai_interview', reason: 'Biaya AI melonjak', global: true });
  });
  it('R2-3: transkrip, bukti, temuan, dan catatan tersimpan terenkripsi per tenant', async () => {
    const one = async (sql) => (await db.query(sql, { replacements: { t: tenant.id }, type: 'SELECT' }))[0];
    const turn = await one(`SELECT t.text FROM lna_interview_turns t JOIN lna_interview_sessions s ON s.id = t.session_id WHERE s.tenant_id = :t AND t.speaker = 'human' LIMIT 1`);
    expect(turn.text).toMatch(/^enc:v1:/);
    const ev = await one(`SELECT evidence FROM lna_assessments WHERE tenant_id = :t AND evidence IS NOT NULL AND source = 'manual_interview' LIMIT 1`);
    expect(ev.evidence).toMatch(/^enc:v1:/);
    const f = await one(`SELECT title, detail FROM lna_findings WHERE tenant_id = :t LIMIT 1`);
    expect(f.title).toMatch(/^enc:v1:/);
    const key = await one(`SELECT key_ref AS "keyRef", wrapped_key AS "wrappedKey" FROM tenant_keys WHERE tenant_id = :t`);
    expect(key.keyRef).toBe('local');
    // lewat API tetap terbaca
    const [s] = (await db.query(`SELECT id FROM lna_interview_sessions WHERE tenant_id = :t AND submodule = 'tna' AND status = 'completed' LIMIT 1`, { replacements: { t: tenant.id }, type: 'SELECT' }));
    const res = await request(app).get(`/api/tna/sessions/${s.id}`).set(as('hr'));
    expect(res.body.data.turns.find((x) => x.speaker === 'human').text).not.toMatch(/^enc:/);
    const findings = (await request(app).get('/api/tna/findings').set(as('hr'))).body.data;
    expect(findings.every((x) => !x.title.startsWith('enc:'))).toBe(true);
  });

  it('PK-06: wawancara TNA ujung ke ujung dengan penyedia Bedrock (respons rekaman), token tercatat, gagal AI tidak menyimpan jawaban', async () => {
    const fx = (n) => JSON.parse(JSON.stringify(require(`../fixtures/bedrock/${n}.json`)));
    const responses = [fx('tna-question'), Object.assign(new Error('Too many requests'), { name: 'ThrottlingException' }),
      fx('tna-question'), fx('tna-question-done'), fx('tna-analysis')];
    const sent = [];
    const client = { async send(cmd) { sent.push(cmd.input); const r = responses.shift(); if (r instanceof Error) throw r; return r; } };
    const aiCfg = { provider: 'bedrock', region: 'ap-southeast-1', modelId: 'anthropic.model-uji', maxQuestions: 8, priceInputPerMTok: 3, priceOutputPerMTok: 15 };
    const config = { ...baseConfig, ai: aiCfg }; // kunci induk lokal yang sama dengan app utama
    const bedrockApp = createApp({ config, stores, ai: createBedrockProvider(aiCfg, { client }) }); // store dan kunci tenant yang sama

    const [[row]] = await db.query(
      `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, 'tika@elgos.test', 'Tika Rahasia', 'E-tika', 'learner', 'active') RETURNING id`,
      { replacements: { t: tenant.id } },
    );
    const tika = { Authorization: `Bearer ${tokens.sign({ id: row.id, tenantId: tenant.id, role: 'learner', email: 'tika@elgos.test' })}` };
    const [[p]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'Uji Bedrock') RETURNING id`, { replacements: { t: tenant.id } });
    await request(app).post('/api/tna/performance/import').set(as('hr')).send({
      period: '2026-10', projectId: p.id, rows: [{ employeeId: 'E-tika', metricType: 'sla', name: 'Respons tiket', target: 85, actual: 72 }],
    }).expect(201);
    const s = (await request(app).post(`/api/tna/projects/${p.id}/interviews`).set(as('hr')).send({ period: '2026-10' }))
      .body.data.sessions.find((x) => x.intervieweeId === row.id);
    // PM-10: target milik karyawan lain yang terselip di sesi tidak boleh sampai ke model
    const [[other]] = await db.query(`SELECT id FROM lna_performance_records WHERE tenant_id = :t AND user_id <> :u LIMIT 1`, { replacements: { t: tenant.id, u: row.id } });
    await db.query('UPDATE lna_interview_sessions SET trigger_record_ids = trigger_record_ids || CAST(:o AS uuid) WHERE id = :sid', { replacements: { o: other.id, sid: s.id } });

    const consent = await request(bedrockApp).post(`/api/tna/sessions/${s.id}/consent`).set(tika);
    expect(consent.status).toBe(200);
    expect(consent.body.data.question.text).toMatch(/85%.*72%/);
    const system = sent[0].system[0].text;
    expect(system).toMatch(/Respons tiket/);
    expect(system).not.toMatch(/Waktu respons tiket|Tika|tika@/); // KPI orang lain, nama, dan email tidak dikirim

    const failed = await request(bedrockApp).post(`/api/tna/sessions/${s.id}/turns`).set(tika).send({ text: 'Saya belum paham batas SLA di kontrak.' });
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe('AI_THROTTLED');
    const [[{ n }]] = await db.query('SELECT count(*)::int AS n FROM lna_interview_turns WHERE session_id = :sid', { replacements: { sid: s.id } });
    expect(n).toBe(1); // hanya pertanyaan pembuka; jawaban bisa dikirim ulang

    await request(bedrockApp).post(`/api/tna/sessions/${s.id}/turns`).set(tika).send({ text: 'Saya belum paham batas SLA di kontrak.' }).expect(200);
    const last = await request(bedrockApp).post(`/api/tna/sessions/${s.id}/turns`).set(tika).send({ text: 'Aplikasi tiket juga sering lambat saat jam sibuk.' });
    expect(last.body.data).toMatchObject({ question: null, done: true });

    const done = await request(bedrockApp).post(`/api/tna/sessions/${s.id}/complete`).set(tika);
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ findings: 3, aiProvider: 'bedrock', aiModel: 'anthropic.model-uji' });
    expect(done.body.data.aiUsage).toMatchObject({ calls: 4, inputTokens: 812 * 2 + 1530 + 1904, outputTokens: 46 * 2 + 5 + 231 });
    expect(done.body.data.aiUsage.costUsd).toBeCloseTo(((812 * 2 + 1530 + 1904) * 3 + (46 * 2 + 5 + 231) * 15) / 1e6, 6);

    const logs = await db.query('SELECT operation, provider, model, user_id AS "userId", project_id AS "projectId" FROM ai_usage_logs WHERE session_id = :sid ORDER BY id',
      { replacements: { sid: s.id }, type: 'SELECT' });
    expect(logs.map((l) => l.operation)).toEqual(['next_question', 'next_question', 'next_question', 'analyze_tna']);
    expect(logs.every((l) => l.provider === 'bedrock' && l.userId === row.id && l.projectId === p.id)).toBe(true);

    const findings = (await request(app).get(`/api/tna/findings?projectId=${p.id}`).set(as('hr'))).body.data;
    const [rec] = await db.query('SELECT id FROM lna_performance_records WHERE user_id = :u', { replacements: { u: row.id }, type: 'SELECT' });
    expect(findings.find((f) => f.title.startsWith('Belum memahami klausul SLA'))).toMatchObject({ category: 'training', competencyId: null, performanceRecordId: rec.id });
    // BT-23: non-training tertaut ke temuan training sebelumnya
    const [nt] = await db.query(`SELECT linked_finding_id AS "linked" FROM lna_findings WHERE session_id = :sid AND category = 'non_training'`, { replacements: { sid: s.id }, type: 'SELECT' });
    expect(nt.linked).toBeTruthy();
  });
});
