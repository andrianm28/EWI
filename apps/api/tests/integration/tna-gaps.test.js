// B5 Training Needs: papan gap dan penugasan wawancara, diuji di Postgres (docs/designs/b5-training-needs.md).
// Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan (CI menyiapkannya).
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createCatalogService, memoryAdapter } = require('../../src/integrations/catalog');
const { memoryMailer } = require('../../src/integrations/mailer');
const { runInterviewReminders } = require('../../src/jobs/interview-reminders');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const DAY = 24 * 60 * 60 * 1000;
const wibDate = (offsetDays) => new Date(Date.now() + 7 * 3600 * 1000 + offsetDays * DAY).toISOString().slice(0, 10);

run('B5 Training Needs: gap dan penugasan (Postgres)', () => {
  let db; let app; let stores; let tokens;
  const T = {}; // tenant utama dan tenant lain
  const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const q = (sql, replacements = {}) => db.query(sql, { replacements, type: 'SELECT' });
  const flag = (tenantId, key, enabled) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled)
     ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t: tenantId, key, enabled } },
  );
  const OKR = { kind: 'okr', metricType: 'sla', name: 'Waktu respons', period: '2026-11' };
  const okrQuery = 'kind=okr&metricType=sla&name=Waktu%20respons&period=2026-11';
  const assign = (who, body) => request(app).post('/api/tna/assignments').set(as(who)).send(body);
  const sessionsOf = (projectId) => q(
    `SELECT id, interviewee_id AS "userId", status, assigned_by AS "assignedBy", duration_minutes AS "durationMinutes", focus_kind AS "focusKind",
            focus_label AS "focusLabel", focus_metric_key AS "focusMetricKey", focus_period AS "focusPeriod", focus_competency_id AS "focusCompetencyId",
            trigger_record_ids AS "triggers", invite_expires_at AS "inviteExpiresAt"
       FROM lna_interview_sessions WHERE project_id = :projectId ORDER BY created_at`, { projectId });

  async function makeTenant(key) {
    const [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, :name) RETURNING id`, { replacements: { slug: `gap-${key}-${Date.now()}`, name: `ELGOS gap ${key}` } });
    await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t: tenant.id } });
    await flag(tenant.id, 'module.tna', true);
    const [[jr]] = await db.query(`INSERT INTO lna_job_roles (tenant_id, name) VALUES (:t, 'Service Delivery L1') RETURNING id`, { replacements: { t: tenant.id } });
    const [[project]] = await db.query(`INSERT INTO lna_projects (tenant_id, name, status) VALUES (:t, 'L1', 'active') RETURNING id`, { replacements: { t: tenant.id } });
    return { id: tenant.id, jobRoleId: jr.id, projectId: project.id, key };
  }
  async function addUser(t, key, role, { sup = null, jobRoleId = t.jobRoleId, status = 'active' } = {}) {
    const email = `${key}@gap-${t.key}.test`;
    const [[row]] = await db.query(
      `INSERT INTO users (tenant_id, email, name, employee_id, role, status, supervisor_id, job_role_id)
       VALUES (:t, :email, :name, :emp, :role, :status, :sup, :jobRoleId) RETURNING id`,
      { replacements: { t: t.id, email, name: key, emp: `G-${key}`, role, status, sup, jobRoleId } },
    );
    u[key] = row.id;
    tok[key] = await tokens.sign({ id: row.id, tenantId: t.id, role, email });
  }
  async function addCompetency(t, name, requiredScore, approvedBy) {
    const [[row]] = await db.query(
      `INSERT INTO lna_competencies (tenant_id, job_role_id, kind, name, required_score, approved_at, approved_by)
       VALUES (:t, :jr, 'job', :name, :req, :at, :by) RETURNING id`,
      { replacements: { t: t.id, jr: t.jobRoleId, name, req: requiredScore, at: approvedBy ? new Date() : null, by: approvedBy || null } },
    );
    return row.id;
  }
  const assess = (t, userId, competencyId, score) => db.query(
    `INSERT INTO lna_assessments (tenant_id, user_id, competency_id, score, source) VALUES (:t, :userId, :competencyId, :score, 'manual_interview')`,
    { replacements: { t: t.id, userId, competencyId, score } },
  );

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    app = createApp({ config, stores, catalog: createCatalogService({ elitementor: memoryAdapter('elitementor', []) }) });
    tokens = sessionSigner(config, stores.authSessions);
    T.main = await makeTenant('utama');
    T.other = await makeTenant('lain');
    const t = T.main;
    await addUser(t, 'hr', 'hr_admin', { jobRoleId: null });
    await addUser(t, 'spv', 'supervisor');
    await addUser(t, 'spv2', 'supervisor');
    await addUser(t, 'a', 'learner', { sup: u.spv });
    await addUser(t, 'b', 'learner', { sup: u.spv, status: 'invited' });
    await addUser(t, 'c', 'learner', { sup: u.spv2 });
    await addUser(t, 'd', 'learner', { sup: u.spv2 });
    await addUser(T.other, 'hrLain', 'hr_admin', { jobRoleId: null });
    await addUser(T.other, 'x', 'learner');

    T.c1 = await addCompetency(t, 'Analisis insiden', 3, u.hr);
    T.c2 = await addCompetency(t, 'Komunikasi pelanggan', 3, u.hr);
    T.cDraft = await addCompetency(t, 'Belum disahkan', 3, null);
    T.cLain = await addCompetency(T.other, 'Kompetensi tenant lain', 3, u.hrLain);
    await assess(t, u.a, T.c1, 1); await assess(t, u.b, T.c1, 2); await assess(t, u.c, T.c1, 3); await assess(t, u.spv, T.c1, 2);
    await assess(t, u.a, T.c2, 4); await assess(t, u.c, T.c2, 3);
    await assess(t, u.a, T.cDraft, 0);
    await assess(T.other, u.x, T.cLain, 0);

    const perf = (name, emp, target, actual, direction = 'lower') => ({ employeeId: `G-${emp}`, metricType: 'sla', name, target, actual, direction, unit: 'menit' });
    await request(app).post('/api/tna/performance/import').set(as('hr')).send({
      period: '2026-11',
      rows: [perf('Waktu respons', 'a', 15, 30), perf('Waktu respons', 'b', 15, 10), perf('Waktu respons', 'c', 15, 20), perf('Waktu respons', 'spv', 15, 40),
        perf('Kepuasan', 'a', 90, 95, 'higher')],
    }).expect(201);
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [T.main.id, T.other.id] }, transaction });
    });
    await db.close();
  });

  it('flag mati: keenam endpoint 403 FEATURE_DISABLED', async () => {
    const calls = [
      request(app).get('/api/tna/gaps/summary'), request(app).get('/api/tna/gaps/competencies'), request(app).get('/api/tna/gaps/okr'),
      request(app).get(`/api/tna/gaps/detail?kind=competency&competencyId=${T.c1}`),
      request(app).post('/api/tna/assignments'), request(app).post(`/api/tna/assignments/${T.c1}/cancel`),
    ];
    for (const call of calls) {
      const res = await call.set(as('hr')).send();
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FEATURE_DISABLED');
    }
    await flag(T.main.id, 'tna.gap_board', true);
    await flag(T.main.id, 'tna.interview_assignment', true);
    await flag(T.other.id, 'tna.gap_board', true);
    await flag(T.other.id, 'tna.interview_assignment', true);
  });

  it('R-1 (keputusan user 23 Nov): undangan massal lama ditolak saat penugasan dari gap menyala, tanpa sesi baru', async () => {
    const before = (await sessionsOf(T.main.projectId)).length;
    const res = await request(app).post(`/api/tna/projects/${T.main.projectId}/interviews`).set(as('hr')).send({ scope: 'red_only' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LEGACY_FLOW_RETIRED');
    expect(res.body.error.message).toMatch(/Training Needs/);
    expect((await sessionsOf(T.main.projectId)).length).toBe(before);
  });

  it('karyawan (learner) ditolak di semua endpoint gap dan penugasan', async () => {
    for (const path of ['/api/tna/gaps/summary', '/api/tna/gaps/competencies', '/api/tna/gaps/okr', `/api/tna/gaps/detail?${okrQuery}`]) {
      const res = await request(app).get(path).set(as('a'));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    }
    expect((await assign('a', {})).status).toBe(403);
  });

  it('HR melihat semua gap; kompetensi belum disahkan tidak menjadi target', async () => {
    const comp = (await request(app).get('/api/tna/gaps/competencies').set(as('hr'))).body.data;
    expect(comp.unapprovedCompetencies).toBe(1);
    expect(comp.rows.map((r) => r.name)).toEqual(['Analisis insiden', 'Komunikasi pelanggan']);
    expect(comp.rows[0]).toMatchObject({
      key: `c:${T.c1}`, target: 3, actual: 2, gap: 1, targetPct: 75, actualPct: 50, gapPct: 25, assessed: 4, peopleWithGap: 3, peopleTotal: 6,
      cumulativeShare: 1, classification: 'pending', interviewed: false, interviewedCount: 0, assignedCount: 0,
    });
    expect(comp.rows[1]).toMatchObject({ gap: 0, classification: 'ok', cumulativeShare: null });

    const okr = (await request(app).get('/api/tna/gaps/okr').set(as('hr'))).body.data;
    expect(okr.period).toBe('2026-11');
    expect(okr.periods).toEqual(['2026-11']);
    expect(okr.rows).toHaveLength(1);
    expect(okr.rows[0]).toMatchObject({
      key: 'o:sla|waktu respons|2026-11', name: 'Waktu respons', target: 15, actual: 25, diff: 10, direction: 'lower', unit: 'menit',
      peopleMissed: 3, peopleTotal: 4, classification: 'pending',
    });

    const sum = (await request(app).get('/api/tna/gaps/summary').set(as('hr'))).body.data;
    expect(sum).toMatchObject({
      period: '2026-11', kpis: { competencyGaps: 1, okrGaps: 1, totalGaps: 2, interviewed: 0, top4Share: 1 },
      classification: { training: 0, non_training: 0, review: 0, pending: 2 }, unapprovedCompetencies: 1,
    });
  });

  it('atasan hanya melihat timnya; tenant lain tidak melihat apa pun dari tenant ini', async () => {
    const comp = (await request(app).get('/api/tna/gaps/competencies').set(as('spv'))).body.data.rows;
    expect(comp[0]).toMatchObject({ actual: 1.67, assessed: 3, peopleWithGap: 3, peopleTotal: 3 }); // spv, a, b
    const okr = (await request(app).get('/api/tna/gaps/okr').set(as('spv2'))).body.data.rows;
    expect(okr[0]).toMatchObject({ peopleMissed: 1, peopleTotal: 1, actual: 20 }); // hanya c (d tanpa data)
    const lain = (await request(app).get('/api/tna/gaps/summary').set(as('hrLain'))).body.data;
    expect(lain.kpis).toMatchObject({ competencyGaps: 1, okrGaps: 0 });
    expect((await request(app).get('/api/tna/gaps/okr?period=2026-11').set(as('hrLain'))).body.data.rows).toEqual([]);
  });

  it('periode terbaru menurut waktu unggah, bukan urutan teks', async () => {
    await db.query(
      `INSERT INTO lna_performance_records (tenant_id, user_id, metric_type, name, target, actual, is_met, period, created_at)
       VALUES (:t, :userId, 'kpi', 'Tiket lama', 10, 5, false, '2026-Q3', now() - interval '60 days')`, { replacements: { t: T.main.id, userId: u.a } });
    const okr = (await request(app).get('/api/tna/gaps/okr').set(as('hr'))).body.data;
    expect(okr.period).toBe('2026-11'); // '2026-Q3' > '2026-11' secara teks, tetapi lebih lama diunggah
    expect(okr.periods).toEqual(['2026-11', '2026-Q3']);
    const old = (await request(app).get('/api/tna/gaps/okr?period=2026-Q3').set(as('hr'))).body.data;
    expect(old.rows.map((r) => r.name)).toEqual(['Tiket lama']);
  });

  it('detail gap: bukti, hipotesis, karyawan dalam cakupan, audit baca; ID asing 404, ID rusak 400', async () => {
    const res = await request(app).get(`/api/tna/gaps/detail?kind=competency&competencyId=${T.c1}`).set(as('spv'));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ name: 'Analisis insiden', classification: 'pending', jobRoles: ['Service Delivery L1'] });
    expect(d.hypotheses).toHaveLength(3);
    expect(d.hypotheses[0].verified).toBe(false);
    expect(d.evidence.join(' ')).not.toMatch(/\b(a|b|spv)\b.*skor/);
    expect(d.employees.map((e) => e.id).sort()).toEqual([u.a, u.b, u.spv].sort());
    expect(d.employees.find((e) => e.id === u.spv)).toMatchObject({ self: true, assignable: false, value: 2, gap: 1 });
    expect(d.employees.find((e) => e.id === u.a)).toMatchObject({ self: false, assignable: true, value: 1, target: 3, gap: 2, session: null });
    expect(d.employees.find((e) => e.id === u.a).jobRoleId).toEqual(expect.any(String)); // kontrak layar: mode all_job_role
    const [audit] = await q(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'tna.gap_detail' AND user_id = :userId`, { t: T.main.id, userId: u.spv });
    expect(audit.meta.employeeIds.sort()).toEqual([u.a, u.b, u.spv].sort());

    const okr = (await request(app).get(`/api/tna/gaps/detail?${okrQuery}`).set(as('hr'))).body.data;
    expect(okr.employees).toHaveLength(4);
    expect(okr.employees.find((e) => e.id === u.b)).toMatchObject({ value: 10, target: 15, isMet: true });

    // spv2 tidak punya bawahan yang dinilai pada kompetensi kedua selain c (gap 0 tetap bisa dibuka), tetapi OKR "Kepuasan" bukan gap
    expect((await request(app).get('/api/tna/gaps/detail?kind=okr&metricType=sla&name=Kepuasan&period=2026-11').set(as('hr'))).status).toBe(404);
    expect((await request(app).get(`/api/tna/gaps/detail?kind=competency&competencyId=${T.cLain}`).set(as('hr'))).status).toBe(404);
    expect((await request(app).get(`/api/tna/gaps/detail?kind=competency&competencyId=${T.cDraft}`).set(as('hr'))).status).toBe(404);
    expect((await request(app).get('/api/tna/gaps/detail?kind=competency&competencyId=bukan-uuid').set(as('hr'))).status).toBe(400);
    expect((await request(app).get('/api/tna/gaps/detail?kind=lain').set(as('hr'))).status).toBe(400);
    // drift report 19 Nov: periode > 32 karakter di detail gap OKR juga 400, sama dengan endpoint papan
    expect((await request(app).get(`/api/tna/gaps/detail?kind=okr&metricType=sla&name=Kepuasan&period=${'x'.repeat(33)}`).set(as('hr'))).status).toBe(400);
    expect((await request(app).get('/api/tna/gaps/summary?jobRoleId=x').set(as('hr'))).status).toBe(400);
  });

  it('penugasan gap OKR mode affected: hanya yang meleset, tenggat akhir hari WIB, kolom fokus, audit', async () => {
    const dueDate = wibDate(5);
    const res = await assign('hr', { projectId: T.main.projectId, gap: OKR, mode: 'affected', dueDate, durationMinutes: 15 });
    expect(res.status).toBe(201);
    expect(res.body.data.assigned.map((s) => s.employeeId).sort()).toEqual([u.a, u.c, u.spv].sort());
    expect(res.body.data.assigned[0]).toMatchObject({ durationMinutes: 15, replaced: false });
    expect(res.body.data.skipped).toEqual([]);
    const rows = await sessionsOf(T.main.projectId);
    expect(rows).toHaveLength(3);
    const sa = rows.find((s) => s.userId === u.a);
    expect(sa).toMatchObject({ status: 'scheduled', assignedBy: u.hr, durationMinutes: 15, focusKind: 'okr', focusLabel: 'Waktu respons', focusMetricKey: 'waktu respons', focusPeriod: '2026-11' });
    expect(sa.triggers).toHaveLength(1);
    expect(new Date(sa.inviteExpiresAt).toISOString()).toBe(new Date(`${dueDate}T23:59:59+07:00`).toISOString());
    const [audit] = await q(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'tna.interview_assignment' AND action = 'create'`, { t: T.main.id });
    expect(audit.meta).toMatchObject({ durationMinutes: 15, gap: { kind: 'okr', name: 'Waktu respons' } });
    expect(audit.meta.employeeIds.sort()).toEqual([u.a, u.c, u.spv].sort());

    const okr = (await request(app).get('/api/tna/gaps/okr').set(as('hr'))).body.data.rows[0];
    expect(okr).toMatchObject({ assignedCount: 3, interviewedCount: 0, classification: 'pending' });
    const detail = (await request(app).get(`/api/tna/gaps/detail?${okrQuery}`).set(as('hr'))).body.data;
    expect(detail.employees.find((e) => e.id === u.a).session).toMatchObject({ id: sa.id, status: 'scheduled', projectId: T.main.projectId, assignedBy: u.hr, open: true }); // kontrak layar: tombol Batalkan
  });

  it('karyawan melihat tenggat, durasi, topik, dan penugas di daftar sesinya; perpanjangan HR menggeser tenggat', async () => {
    const mine = (await request(app).get('/api/tna/sessions').set(as('a'))).body.data;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ durationMinutes: 15, focusKind: 'okr', focusLabel: 'Waktu respons', assignedByName: 'hr' });
    const before = new Date(mine[0].inviteExpiresAt).getTime();
    await request(app).post(`/api/tna/sessions/${mine[0].id}/extend`).set(as('hr')).send({ days: 2 }).expect(200);
    const one = (await request(app).get(`/api/tna/sessions/${mine[0].id}`).set(as('a'))).body.data;
    expect(new Date(one.inviteExpiresAt).getTime()).toBe(before + 2 * DAY);
    expect(one).toMatchObject({ durationMinutes: 15, focusLabel: 'Waktu respons' });
  });

  it('sesi terbuka dilewati; sesi kedaluwarsa digantikan; sesi berjalan tidak digantikan', async () => {
    const body = { projectId: T.main.projectId, gap: OKR, mode: 'affected', dueDate: wibDate(3), durationMinutes: 30 };
    const again = await assign('hr', body);
    expect(again.status).toBe(200);
    expect(again.body.data.assigned).toEqual([]);
    expect(again.body.data.skipped.map((s) => s.reason)).toEqual(['open_session', 'open_session', 'open_session']);

    await db.query(`UPDATE lna_interview_sessions SET invite_expires_at = now() - interval '1 hour' WHERE project_id = :p AND interviewee_id IN (:ids)`,
      { replacements: { p: T.main.projectId, ids: [u.c, u.spv] } });
    await db.query(`UPDATE lna_interview_sessions SET status = 'in_progress' WHERE project_id = :p AND interviewee_id = :id`, { replacements: { p: T.main.projectId, id: u.spv } });
    const res = await assign('hr', body);
    expect(res.status).toBe(201);
    expect(res.body.data.assigned).toHaveLength(1);
    expect(res.body.data.assigned[0]).toMatchObject({ employeeId: u.c, replaced: true, durationMinutes: 30 });
    expect(res.body.data.skipped.sort((x, y) => x.reason.localeCompare(y.reason))).toEqual([{ employeeId: u.spv, reason: 'in_progress' }, { employeeId: u.a, reason: 'open_session' }]);
    const mine = (await sessionsOf(T.main.projectId)).filter((s) => s.userId === u.c);
    expect(mine.map((s) => s.status)).toEqual(['abandoned', 'scheduled']);
    await db.query(`UPDATE lna_interview_sessions SET status = 'scheduled', invite_expires_at = now() + interval '3 days' WHERE project_id = :p AND interviewee_id = :id`,
      { replacements: { p: T.main.projectId, id: u.spv } });
  });

  it('atasan menugaskan bawahannya; orang di luar tim, dirinya, dan bentuk salah ditolak', async () => {
    const [[p2]] = await db.query(`INSERT INTO lna_projects (tenant_id, name, status) VALUES (:t, 'L1 kompetensi', 'active') RETURNING id`, { replacements: { t: T.main.id } });
    T.p2 = p2.id;
    const base = { projectId: T.p2, gap: { kind: 'competency', competencyId: T.c1 }, mode: 'affected', dueDate: wibDate(7), durationMinutes: 30 };
    const outside = await assign('spv', { ...base, employeeIds: [u.c] });
    expect(outside.status).toBe(400);
    expect(outside.body.error.code).toBe('EMPLOYEE_NOT_ELIGIBLE');
    expect((await assign('spv', { ...base, employeeIds: [u.spv] })).body.error.code).toBe('EMPLOYEE_NOT_ELIGIBLE');
    expect((await assign('spv', { ...base, mode: 'all_job_role' })).status).toBe(400);
    expect((await assign('spv', { ...base, dueDate: wibDate(0) })).body.error.code).toBe('DUE_DATE_OUT_OF_RANGE');
    expect((await assign('spv', { ...base, durationMinutes: 45 })).status).toBe(400);
    expect(await sessionsOf(T.p2)).toHaveLength(0);

    const res = await assign('spv', { ...base, employeeIds: [u.a] });
    expect(res.status).toBe(201);
    expect(res.body.data.assigned.map((s) => s.employeeId)).toEqual([u.a]);
    const [s] = await sessionsOf(T.p2);
    expect(s).toMatchObject({ assignedBy: u.spv, focusKind: 'competency', focusCompetencyId: T.c1, focusLabel: 'Analisis insiden', durationMinutes: 30, triggers: [] });

    // mode semua karyawan di jabatan: b (status invited) ikut, a dilewati, penugas tidak ikut
    const all = await assign('spv', { ...base, mode: 'all_job_role', jobRoleId: T.main.jobRoleId });
    expect(all.status).toBe(201);
    expect(all.body.data.assigned.map((x) => x.employeeId)).toEqual([u.b]);
    expect(all.body.data.skipped).toEqual([{ employeeId: u.a, reason: 'open_session' }]);
  });

  it('ID milik tenant lain 404; proyek ditutup 409; mode tanpa hasil 409', async () => {
    const base = { projectId: T.main.projectId, gap: OKR, mode: 'affected', dueDate: wibDate(3), durationMinutes: 15 };
    expect((await assign('hr', { ...base, projectId: T.other.projectId })).status).toBe(404);
    expect((await assign('hr', { ...base, gap: { kind: 'competency', competencyId: T.cLain } })).status).toBe(404);
    expect((await assign('hr', { ...base, gap: { kind: 'competency', competencyId: T.cDraft } })).status).toBe(404);
    expect((await assign('hr', { ...base, mode: 'all_job_role', jobRoleId: T.other.jobRoleId })).status).toBe(404);
    // gap OKR yang tidak ada di tenant pemanggil: 404 (tabel galat spek B5)
    expect((await assign('hrLain', { ...base, projectId: T.other.projectId })).status).toBe(404);
    const missing = await assign('hr', { ...base, gap: { ...OKR, name: 'Tidak ada' } });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    // gap ada tetapi tidak ada yang terdampak (semua skor Komunikasi pelanggan sudah di target): 409
    const none = await assign('hr', { ...base, gap: { kind: 'competency', competencyId: T.c2 } });
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe('NO_ELIGIBLE_EMPLOYEE');
    const [[closed]] = await db.query(`INSERT INTO lna_projects (tenant_id, name, status) VALUES (:t, 'Tutup', 'closed') RETURNING id`, { replacements: { t: T.main.id } });
    const res = await assign('hr', { ...base, projectId: closed.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROJECT_CLOSED');
  });

  it('dua permintaan bersamaan tidak membuat sesi ganda', async () => {
    const [[p3]] = await db.query(`INSERT INTO lna_projects (tenant_id, name, status) VALUES (:t, 'Balapan', 'active') RETURNING id`, { replacements: { t: T.main.id } });
    const body = { projectId: p3.id, gap: OKR, mode: 'affected', dueDate: wibDate(3), durationMinutes: 15 };
    const [r1, r2] = await Promise.all([assign('hr', body), assign('hr', body)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect(r1.body.data.assigned.length + r2.body.data.assigned.length).toBe(3);
    expect(await sessionsOf(p3.id)).toHaveLength(3);
  });

  it('batalkan penugasan: penugas atau HR; atasan lain yang bukan penugas ditolak', async () => {
    const [mine] = (await sessionsOf(T.p2)).filter((s) => s.userId === u.a);
    const hrAssigned = (await sessionsOf(T.main.projectId)).find((s) => s.userId === u.a);
    const notMine = await request(app).post(`/api/tna/assignments/${hrAssigned.id}/cancel`).set(as('spv'));
    expect(notMine.status).toBe(403);
    expect(notMine.body.error.code).toBe('NOT_ASSIGNER');
    expect((await request(app).post(`/api/tna/assignments/${mine.id}/cancel`).set(as('spv2'))).status).toBe(404); // di luar cakupan
    expect((await request(app).post('/api/tna/assignments/bukan-uuid/cancel').set(as('hr'))).status).toBe(400);
    const ok = await request(app).post(`/api/tna/assignments/${mine.id}/cancel`).set(as('spv'));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ id: mine.id, status: 'abandoned' });
    const twice = await request(app).post(`/api/tna/assignments/${mine.id}/cancel`).set(as('hr'));
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('INVALID_STATE');
    const [audit] = await q(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'tna.interview_assignment' AND action = 'update'`, { t: T.main.id });
    expect(audit.meta).toMatchObject({ decision: 'cancelled', employeeIds: [u.a] });
  });

  it('klasifikasi mengikuti wawancara, tinjauan HR, izin atasan, dan flag non-pelatihan', async () => {
    const okrOf = async (who) => (await request(app).get('/api/tna/gaps/okr').set(as(who))).body.data.rows[0];
    const sa = (await sessionsOf(T.main.projectId)).find((s) => s.userId === u.a);
    await db.query(`UPDATE lna_interview_sessions SET status = 'completed', ended_at = now() WHERE id = :id`, { replacements: { id: sa.id } });
    // sudah diwawancarai, belum ada temuan yang terlihat: "Perlu ditinjau HR" untuk semua
    expect(await okrOf('hr')).toMatchObject({ classification: 'review', interviewed: true, interviewedCount: 1 });
    expect(await okrOf('spv')).toMatchObject({ classification: 'review', interviewed: true });

    const finding = (category, reviewStatus, extra = {}) => stores.tna.insertFinding(T.main.id, {
      projectId: T.main.projectId, userId: u.a, sessionId: sa.id, category, title: `Temuan ${category}`, detail: 'rincian', reviewStatus, ...extra,
    });
    // temuan tak tertaut ke kompetensi/target: ikut gap fokus sesinya
    await finding('non_training', 'approved');
    expect((await okrOf('hr')).classification).toBe('review'); // flag non-pelatihan mati
    await flag(T.main.id, 'tna.non_training_hr', true);
    expect((await okrOf('hr')).classification).toBe('non_training');
    expect((await okrOf('spv')).classification).toBe('review'); // atasan tanpa izin
    await request(app).put(`/api/tna/non-training-access/${u.spv}`).set(as('hr')).send({}).expect((r) => expect(r.status).toBeLessThan(300));
    expect((await okrOf('spv')).classification).toBe('non_training');

    await finding('training', 'draft', { performanceRecordId: sa.triggers[0] });
    expect((await okrOf('hr')).classification).toBe('review'); // draf terlihat HR
    expect((await okrOf('spv')).classification).toBe('non_training'); // draf tidak terlihat atasan
    await db.query(`UPDATE lna_findings SET review_status = 'rejected' WHERE tenant_id = :t AND review_status = 'draft'`, { replacements: { t: T.main.id } });
    expect((await okrOf('hr')).classification).toBe('non_training');

    const sum = (await request(app).get('/api/tna/gaps/summary').set(as('hr'))).body.data;
    expect(sum.kpis).toMatchObject({ totalGaps: 2, interviewed: 1 });
    expect(sum.classification).toMatchObject({ non_training: 1 });
  });

  it('pengingat memakai durasi sesi', async () => {
    const sc = (await sessionsOf(T.main.projectId)).find((s) => s.userId === u.c && s.status === 'scheduled');
    const now = new Date();
    await db.query(`UPDATE lna_interview_sessions SET invite_expires_at = :at, reminder_h3_at = NULL, reminder_h1_at = NULL WHERE id = :id`,
      { replacements: { id: sc.id, at: new Date(now.getTime() + 3 * DAY) } });
    const mailer = memoryMailer();
    await runInterviewReminders({ stores, mailer, appBaseUrl: 'https://app.test', now });
    const mail = mailer.sent.find((m) => m.to === 'c@gap-utama.test');
    expect(mail.text).toMatch(/sekitar 30 menit/); // sesi pengganti berdurasi 30
    const s15 = (await sessionsOf(T.main.projectId)).find((s) => s.userId === u.spv);
    await db.query(`UPDATE lna_interview_sessions SET invite_expires_at = :at, reminder_h3_at = NULL, reminder_h1_at = NULL WHERE id = :id`,
      { replacements: { id: s15.id, at: new Date(now.getTime() + 3 * DAY) } });
    await runInterviewReminders({ stores, mailer, appBaseUrl: 'https://app.test', now });
    expect(mailer.sent.find((m) => m.to === 'spv@gap-utama.test').text).toMatch(/sekitar 15 menit/);
  });

  it('peserta gap kompetensi hanya pemegang kompetensi itu; gap di luar cakupan 404; sesi alur lama tidak bisa dibatalkan', async () => {
    const t = T.main;
    const [[jr2]] = await db.query(`INSERT INTO lna_job_roles (tenant_id, name) VALUES (:t, 'Service Desk L2') RETURNING id`, { replacements: { t: t.id } });
    await addUser(t, 'e', 'learner', { sup: u.spv, jobRoleId: jr2.id });
    await assess(t, u.e, T.c1, 0); // asesmen lama dari jabatan sebelumnya
    const [[p4]] = await db.query(`INSERT INTO lna_projects (tenant_id, name, status) VALUES (:t, 'Pindah jabatan', 'active') RETURNING id`, { replacements: { t: t.id } });
    const base = { projectId: p4.id, gap: { kind: 'competency', competencyId: T.c1 }, mode: 'affected', dueDate: wibDate(5), durationMinutes: 30 };
    const moved = await assign('spv', { ...base, employeeIds: [u.e] });
    expect(moved.status).toBe(400);
    expect(moved.body.error.code).toBe('EMPLOYEE_NOT_ELIGIBLE');
    const res = await assign('spv', base);
    expect(res.body.data.assigned.map((x) => x.employeeId)).not.toContain(u.e);

    // gap OKR milik tim lain tidak terlihat oleh atasan ini
    await request(app).post('/api/tna/performance/import').set(as('hr')).send({
      period: '2026-11', rows: [{ employeeId: 'G-d', metricType: 'kpi', name: 'Tiket tim lain', target: 10, actual: 5, direction: 'higher' }],
    }).expect(201);
    const foreign = await assign('spv', { ...base, gap: { kind: 'okr', metricType: 'kpi', name: 'Tiket tim lain', period: '2026-11' } });
    expect(foreign.status).toBe(404);

    // sesi alur lama (tanpa penugas) milik bawahan: 409 INVALID_STATE, bukan NOT_ASSIGNER (R10b)
    const legacy = await stores.interviews.create(t.id, { projectId: p4.id, submodule: 'tna', intervieweeId: u.b, triggerRecordIds: [] });
    const cancel = await request(app).post(`/api/tna/assignments/${legacy.id}/cancel`).set(as('spv'));
    expect(cancel.status).toBe(409);
    expect(cancel.body.error.code).toBe('INVALID_STATE');
  });
});
