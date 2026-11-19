// B15 Learning Impact Measurement (Postgres): rencana, peserta (periode + jabatan), skor post dari Learning Delivery,
// rantai bukti, indikator, isian skor, pre dari DNA, antrean wawancara ulang per karyawan, cakupan atasan, impor,
// ekspor karyawan, audit, isolasi tenant, dan gerbang. Spek: docs/designs/b15-impact-measurement.md.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { makeConfig } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const day = (offset) => new Date(Date.now() + 7 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);

run('B15 Learning Impact Measurement (Postgres)', () => {
  let db; let app; let stores; let tenant; let other; const u = {}; const tok = {};
  let role; let role2; let k1; let k2; let k3; let m1; let m2; let mOther; let plan;
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const get = (path, who = 'hr') => request(app).get(`/api/lim${path}`).set(as(who));
  const send = (method, path, body, who = 'hr') => request(app)[method](`/api/lim${path}`).set(as(who)).send(body || {});
  const q = (sql, replacements = {}) => db.query(sql, { replacements, type: 'SELECT' });
  const flag = (key, enabled, t = tenant.id) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled) ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t, key, enabled } });
  const training = async (o) => {
    const [row] = await q(`INSERT INTO ld_trainings (tenant_id, title, mode, source, module_id, starts_on, ends_on, status, assessment_mode)
      VALUES (:t, :title, :mode, :source, :moduleId, :startsOn, :endsOn, :status, :assessmentMode) RETURNING id`,
    { t: tenant.id, mode: 'offline', source: 'manual', startsOn: null, endsOn: null, status: 'done', assessmentMode: 'none', ...o });
    return row.id;
  };
  const participant = (trainingId, userId, o = {}) => q(`INSERT INTO ld_participants (tenant_id, training_id, user_id, status, attendance, score, score_source, completed_at)
    VALUES (:t, :trainingId, :userId, :status, :attendance, :score, :scoreSource, :completedAt) RETURNING id`,
  { t: tenant.id, trainingId, userId, status: 'completed', attendance: null, score: null, scoreSource: null, completedAt: null, ...o });

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    app = createApp({ config, stores });
    const tokens = createTokenService(config.jwt);
    const slug = `lim-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'LIM uji') RETURNING id`, { replacements: { slug } });
    [[other]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Lain') RETURNING id`, { replacements: { slug: `${slug}-x` } });
    [role] = await q(`INSERT INTO lna_job_roles (tenant_id, name) VALUES (:t, 'Engineer Service Delivery') RETURNING id`, { t: tenant.id });
    [role2] = await q(`INSERT INTO lna_job_roles (tenant_id, name) VALUES (:t, 'Sales') RETURNING id`, { t: tenant.id });
    const add = async (key, r, { t = tenant.id, sup = null, jobRole = role.id } = {}) => {
      const [row] = await q(`INSERT INTO users (tenant_id, email, name, employee_id, role, status, supervisor_id, job_role_id)
        VALUES (:t, :email, :key, :emp, :r, 'active', :sup, :jobRole) RETURNING id`, { t, email: `${key}@lim.test`, key, emp: `E-${key}`, r, sup, jobRole });
      u[key] = row.id;
      tok[key] = tokens.sign({ id: row.id, tenantId: t, role: r, email: `${key}@lim.test` });
    };
    await add('hr', 'hr_admin');
    await add('eta', 'eta_admin');
    await add('spv', 'supervisor');
    await add('dir', 'pimpinan');
    await add('a', 'learner', { sup: u.spv });
    await add('b', 'learner', { sup: u.spv });
    await add('c', 'learner', { sup: u.dir });
    await add('lama', 'learner'); // angkatan lama (di luar periode)
    await add('sales', 'learner', { jobRole: role2.id }); // jabatan lain
    await add('luar', 'hr_admin', { t: other.id, jobRole: null });
    for (const t of [tenant.id, other.id]) {
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t } });
      await flag('module.lim', true, t);
    }
    const comp = async (name) => (await q(`INSERT INTO lna_competencies (tenant_id, job_role_id, kind, name) VALUES (:t, :r, 'job', :name) RETURNING id`, { t: tenant.id, r: role.id, name }))[0].id;
    k1 = await comp('RCA & Post-Incident Report');
    k2 = await comp('Ticket Life Cycle');
    k3 = await comp('Automation & IaC');
    const mod = async (code, comps, t = tenant.id) => {
      const [row] = await q(`INSERT INTO li_modules (tenant_id, code, name, level) VALUES (:t, :code, :code, 'basic') RETURNING id`, { t, code });
      for (const c of comps) await q('INSERT INTO li_module_competencies (tenant_id, module_id, competency_id) VALUES (:t, :m, :c) RETURNING module_id', { t, m: row.id, c });
      return row.id;
    };
    m1 = await mod('ST-A2', [k1, k2]);
    m2 = await mod('ST-B1', [k3]);
    mOther = await mod('LUAR', [], other.id);

    // Workshop offline: a (vendor_manual 70, hadir), b (75, tidak hadir) — tanggal selesai efektif = ends_on
    const t1 = await training({ title: 'Workshop RCA', moduleId: m1, startsOn: '2026-10-01', endsOn: '2026-10-02', assessmentMode: 'vendor_manual' });
    await participant(t1, u.a, { attendance: true, score: 70, scoreSource: 'vendor_manual' });
    await participant(t1, u.b, { attendance: false, score: 75, scoreSource: 'vendor_manual' });
    // Course online: a mengulang dengan skor lebih baru 82; c tanpa tanggal sama sekali (LMS)
    const t2 = await training({ title: 'Course RCA', mode: 'online', source: 'elitementor', moduleId: m1, startsOn: '2026-10-05' });
    await participant(t2, u.a, { score: 82, scoreSource: 'elitementor', completedAt: '2026-10-20T03:00:00Z' });
    const t3 = await training({ title: 'Course LMS', mode: 'online', source: 'lms', moduleId: m2 });
    await participant(t3, u.c, { score: 64, scoreSource: 'lms', status: 'in_progress' });
    // Dibatalkan, angkatan lama, dan jabatan lain tidak ikut
    const t4 = await training({ title: 'Batal', moduleId: m1, startsOn: '2026-10-03', status: 'cancelled' });
    await participant(t4, u.b, { score: 10, scoreSource: 'vendor_manual' });
    const t5 = await training({ title: 'Angkatan 2025', moduleId: m1, startsOn: '2025-03-01', endsOn: '2025-03-01' });
    await participant(t5, u.lama, { score: 90, scoreSource: 'vendor_manual' });
    const t6 = await training({ title: 'Workshop Sales', moduleId: m1, startsOn: '2026-10-01', endsOn: '2026-10-01' });
    await participant(t6, u.sales, { score: 95, scoreSource: 'vendor_manual' });
    // Asesmen DNA (skala 0-4) untuk pre: a punya dua (yang terakhir sebelum mulai dipakai), b punya satu setelah mulai
    await q(`INSERT INTO lna_assessments (tenant_id, user_id, competency_id, score, assessed_at) VALUES
      (:t, :a, :k1, 1, '2026-08-01'), (:t, :a, :k1, 2, '2026-09-15'), (:t, :b, :k1, 3, '2026-11-01'), (:t, :a, :k2, 3, '2026-09-01') RETURNING id`, { t: tenant.id, a: u.a, b: u.b, k1, k2 });
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.close();
  });

  const planBody = (o = {}) => ({
    title: 'Pilot L1', jobRoleId: role.id, periodFrom: '2026-09-01', periodUntil: '2026-12-31',
    businessProblem: 'Penyelesaian insiden P1 lambat', desiredBehavior: 'Engineer menganalisis akar masalah',
    priorityCapabilities: 'RCA dan Ticket Life Cycle', evidencePlan: 'Skor asesmen, wawancara ulang AI, review atasan',
    existingMetrics: 'MTTR P1, SLA', baselineLabel: 'Sep 2026', afterLabel: 'Nov 2026', moduleIds: [m1, m2], ...o,
  });

  it('gerbang: flag module.lim, entitlement full_suite, dan peran', async () => {
    await flag('module.lim', false);
    expect((await get('/plans')).status).toBe(403);
    await flag('module.lim', true);
    expect((await get('/plans')).status).toBe(200);
    expect((await get('/plans', 'eta')).status).toBe(200);
    for (const who of ['a']) expect((await get('/plans', who)).status).toBe(403);
    expect((await send('post', '/plans', planBody(), 'spv')).status).toBe(403);
  });

  it('HR membuat rencana; modul tenant lain, jabatan tenant lain, dan isian kosong ditolak', async () => {
    expect((await send('post', '/plans', planBody({ moduleIds: [mOther] }))).body.error.code).toBe('MODULE_NOT_FOUND');
    expect((await send('post', '/plans', planBody({ moduleIds: [] }))).status).toBe(400);
    expect((await send('post', '/plans', planBody({ title: '' }))).status).toBe(400);
    expect((await send('post', '/plans', planBody({ periodFrom: '2026-13-01' }))).status).toBe(400);
    expect((await send('post', '/plans', planBody({ periodFrom: '2026-12-01', periodUntil: '2026-01-01' }))).status).toBe(400);
    const res = await send('post', '/plans', planBody());
    expect(res.status).toBe(201);
    plan = res.body.data;
    expect(plan).toMatchObject({ title: 'Pilot L1', jobRoleId: role.id, jobRoleName: 'Engineer Service Delivery', periodFrom: '2026-09-01', status: 'active' });
    expect(plan.modules.map((m) => m.id).sort()).toEqual([m1, m2].sort());
    const list = (await get('/plans')).body.data;
    expect(list).toEqual([{ id: plan.id, title: 'Pilot L1', jobRoleName: 'Engineer Service Delivery', moduleCount: 2, participantCount: 3 }]);
  });

  it('overview: peserta dari periode + jabatan, tanpa pelatihan batal; post terbaru; rantai dan insight', async () => {
    const res = await get(`/plans/${plan.id}/overview`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.participants).toBe(3); // a, b, c (lama: di luar periode; sales: jabatan lain)
    expect(d.generatedBy).toBe('rules');
    expect(d.competencies.map((c) => c.name)).toEqual(['Automation & IaC', 'RCA & Post-Incident Report', 'Ticket Life Cycle']);
    const rca = d.competencies.find((c) => c.competencyId === k1);
    expect(rca).toMatchObject({ post: 79, postN: 2, postUnauditable: 1, postShared: true, pre: null, verdict: 'belum_diukur' }); // a 82 (online terbaru), b 75
    expect(d.competencies.find((c) => c.competencyId === k3)).toMatchObject({ post: 64, postShared: false });
    expect(d.chain[0]).toMatchObject({ level: 1, coverage: 'measured', finding: '3 dari 4 keikutsertaan selesai (75%); kehadiran offline 1 dari 2 tercatat' });
    expect(d.chain[1].coverage).toBe('missing');
    expect(d.insight.level).toBe(2);
  });

  it('indikator tim: tambah, ubah, urutkan, hapus; maksimal 20; kekuatan bukti', async () => {
    const add = await send('post', `/plans/${plan.id}/indicators`, { name: 'MTTR insiden P1', level: 'performance', source: 'Sistem tiket', unit: 'mnt', direction: 'lower_better', baseline: 92, current: 71, target: 75 });
    expect(add.status).toBe(201);
    expect(add.body.data).toMatchObject({ improved: true, targetMet: true, strength: 'moderate', strengthSource: 'rules', position: 0 });
    const sla = (await send('post', `/plans/${plan.id}/indicators`, { name: 'Kepatuhan SLA', level: 'business', source: 'Laporan SLA', unit: '%', direction: 'higher_better', baseline: 96.4, current: 98.2, target: 98 })).body.data;
    const csat = (await send('post', `/plans/${plan.id}/indicators`, { name: 'Kepuasan pelanggan', level: 'business', source: 'Belum terhubung', direction: 'higher_better' })).body.data;
    expect(csat).toMatchObject({ strength: 'no_data', position: 2 });
    expect((await send('post', `/plans/${plan.id}/indicators`, { name: '', level: 'business', direction: 'higher_better' })).status).toBe(400);
    expect((await send('post', `/plans/${plan.id}/indicators`, { name: 'X', level: 'lain', direction: 'higher_better' })).status).toBe(400);
    const strong = await send('patch', `/indicators/${add.body.data.id}`, { strength: 'strong' });
    expect(strong.body.data).toMatchObject({ strength: 'strong', strengthSource: 'hr' });
    expect((await send('patch', `/indicators/${sla.id}`, { position: 5 })).body.data.position).toBe(5);
    const tmp = (await send('post', `/plans/${plan.id}/indicators`, { name: 'Sementara', level: 'business', direction: 'higher_better' })).body.data;
    expect((await send('delete', `/indicators/${tmp.id}`)).status).toBe(204);
    expect((await send('delete', `/indicators/${tmp.id}`)).status).toBe(404);
    const d = (await get(`/plans/${plan.id}/overview`)).body.data;
    expect(d.indicators.map((i) => i.name)).toEqual(['MTTR insiden P1', 'Kepuasan pelanggan', 'Kepatuhan SLA']);
    expect(d.chain[4]).toMatchObject({ coverage: 'measured', finding: 'MTTR insiden P1 92 → 71 mnt' });
    expect(d.chain[5]).toMatchObject({ coverage: 'partial', finding: 'Kepatuhan SLA 96,4 → 98,2%; data Kepuasan pelanggan belum ada' });
  });

  it('isian skor HR: peserta dan kompetensi rencana saja; null mengosongkan; post HR menimpa skor modul', async () => {
    const res = await send('put', `/plans/${plan.id}/measurements`, { entries: [
      { userId: u.a, competencyId: k1, postScore: 85, performanceScore: 88, performanceNote: 'Laporan RCA rapi' },
      { userId: u.b, competencyId: k2, preScore: 58 },
      { userId: u.lama, competencyId: k1, preScore: 50 },
      { userId: u.a, competencyId: '00000000-0000-4000-8000-000000000000', preScore: 50 },
      { userId: u.a, competencyId: k2, preScore: 101 },
    ] });
    expect(res.status).toBe(200);
    expect(res.body.data.saved).toBe(2);
    expect(res.body.data.rejected.map((r) => [r.index, r.message])).toEqual([
      [2, 'Karyawan bukan peserta rencana ini'], [3, 'Kompetensi bukan bagian rencana ini'], [4, 'Skor harus bilangan 0-100'],
    ]);
    const rows = (await get(`/plans/${plan.id}/measurements`)).body.data;
    const a1 = rows.find((r) => r.userId === u.a && r.competencyId === k1);
    expect(a1).toMatchObject({ postScore: 85, postSource: 'manual', postShared: false, postAuditable: true, performanceScore: 88, postCompletedOn: '2026-10-20' });
    const b1 = rows.find((r) => r.userId === u.b && r.competencyId === k1);
    expect(b1).toMatchObject({ postScore: 75, postSource: 'ld', postShared: true, postAuditable: false, postCompletedOn: '2026-10-02' });
    await send('put', `/plans/${plan.id}/measurements`, { entries: [{ userId: u.b, competencyId: k2, preScore: null }] });
    expect((await get(`/plans/${plan.id}/measurements`)).body.data.find((r) => r.userId === u.b && r.competencyId === k2).preScore).toBeNull();
    expect((await send('put', `/plans/${plan.id}/measurements`, { entries: Array(501).fill({ userId: u.a, competencyId: k1 }) })).status).toBe(400);
    const reads = await q(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'lim.measurement' AND action = 'read'`, { t: tenant.id });
    expect(reads.length).toBeGreaterThan(0);
    const writes = await q(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'lim.measurement' AND action = 'update'`, { t: tenant.id });
    expect(writes.length).toBeGreaterThan(0);
  });

  it('pre dari DNA: asesmen terakhir sebelum mulai belajar ×25, hanya mengisi yang kosong', async () => {
    await send('put', `/plans/${plan.id}/measurements`, { entries: [{ userId: u.a, competencyId: k2, preScore: 40 }] });
    const res = await send('post', `/plans/${plan.id}/pre-from-dna`);
    expect(res.status).toBe(200);
    expect(res.body.data.filled).toBe(1); // a/k1 = 2×25; a/k2 sudah diisi HR; b/k1 asesmennya sesudah mulai
    const rows = (await get(`/plans/${plan.id}/measurements`)).body.data;
    expect(rows.find((r) => r.userId === u.a && r.competencyId === k1)).toMatchObject({ preScore: 50, preSource: 'dna' });
    expect(rows.find((r) => r.userId === u.a && r.competencyId === k2)).toMatchObject({ preScore: 40, preSource: 'manual' });
    expect((await send('post', `/plans/${plan.id}/pre-from-dna`)).body.data.filled).toBe(0);
  });

  it('antrean per karyawan: tanpa tanggal tidak bisa dijadwalkan; jadwal ulang menimpa; null membatalkan; done dilewati', async () => {
    const queue = (await get(`/plans/${plan.id}/queue`)).body.data;
    expect(queue.map((r) => r.userId).sort()).toEqual([u.a, u.b, u.c].sort());
    const qa = queue.find((r) => r.userId === u.a);
    expect(qa).toMatchObject({ postCompletedOn: '2026-10-20', dueFrom: '2026-11-17', dueUntil: '2026-12-01', status: 'none' });
    expect(qa.competencies.map((c) => c.competencyId).sort()).toEqual([k1, k2].sort());
    expect(queue.find((r) => r.userId === u.c)).toMatchObject({ window: null, dueFrom: null });

    expect((await send('post', `/plans/${plan.id}/queue/schedule`, { userIds: [u.a], date: day(-1) })).status).toBe(400);
    expect((await send('post', `/plans/${plan.id}/queue/schedule`, { userIds: [u.a], date: day(181) })).status).toBe(400);
    const res = await send('post', `/plans/${plan.id}/queue/schedule`, { userIds: [u.a, u.c, u.lama], date: day(3) });
    expect(res.body.data.scheduled).toEqual([u.a]);
    expect(res.body.data.rejected.map((r) => r.userId).sort()).toEqual([u.c, u.lama].sort());
    await send('post', `/plans/${plan.id}/queue/schedule`, { userIds: [u.a], date: day(5) });
    expect((await get(`/plans/${plan.id}/queue`)).body.data.find((r) => r.userId === u.a)).toMatchObject({ status: 'scheduled', scheduledOn: day(5) });
    await send('post', `/plans/${plan.id}/queue/schedule`, { userIds: [u.a], date: null });
    expect((await get(`/plans/${plan.id}/queue`)).body.data.find((r) => r.userId === u.a).status).toBe('none');

    // done hanya lewat store (sambungan mesin wawancara tahap 3)
    await stores.lim.recordReinterview(tenant.id, plan.id, u.b, k1, { score: 66, sessionId: null });
    const skip = await send('post', `/plans/${plan.id}/queue/schedule`, { userIds: [u.b], date: day(3) });
    expect(skip.body.data.skipped).toEqual([{ userId: u.b, reason: 'done' }]);
    const d = (await get(`/plans/${plan.id}/overview`)).body.data;
    expect(d.competencies.find((c) => c.competencyId === k1)).toMatchObject({ reinterview: 66, verdict: 'retensi_turun' });
    expect(d.chain[2].finding).toBe('1 dari 3 karyawan sudah diwawancara ulang');
  });

  it('atasan: hanya rencana dan ringkasan timnya (tanpa dirinya), tanpa data per orang; boleh isi skor kinerja bawahan langsung', async () => {
    const list = (await get('/plans', 'spv')).body.data;
    expect(list).toEqual([expect.objectContaining({ id: plan.id, participantCount: 2 })]);
    const d = (await get(`/plans/${plan.id}/overview`, 'spv')).body.data;
    expect(d.participants).toBe(2);
    expect(d.competencies.find((c) => c.competencyId === k3).postN).toBe(0); // c bukan timnya
    expect((await get(`/plans/${plan.id}/overview`, 'dir')).body.data.participants).toBe(1); // pimpinan: bawahan langsung (c)
    expect((await get(`/plans/${plan.id}/measurements`, 'spv')).status).toBe(403);
    expect((await get(`/plans/${plan.id}/queue`, 'spv')).status).toBe(403);
    const res = await send('put', `/plans/${plan.id}/measurements`, { entries: [
      { userId: u.b, competencyId: k1, performanceScore: 70, performanceNote: 'Review laporan RCA' },
      { userId: u.b, competencyId: k1, preScore: 10 },
      { userId: u.c, competencyId: k3, performanceScore: 50 },
    ] }, 'spv');
    expect(res.body.data.saved).toBe(1);
    expect(res.body.data.rejected.map((r) => r.message)).toEqual(['Atasan hanya mengisi skor kinerja', 'Karyawan bukan anggota tim Anda']);
    expect((await get(`/plans/${plan.id}/overview`, 'dir')).body.data.plan.id).toBe(plan.id);
  });

  it('PATCH rencana: field yang tidak dikirim tetap; estimasi nilai, faktor, arsip', async () => {
    const res = await send('patch', `/plans/${plan.id}`, { valueEstimate: { label: 'Waktu teknisi dihemat', value: '±14 jam / bulan', note: '21 menit × 40 insiden' }, factors: ['Alat monitoring baru Oktober 2026'] });
    expect(res.body.data).toMatchObject({ title: 'Pilot L1', valueEstimate: { label: 'Waktu teknisi dihemat' }, factors: ['Alat monitoring baru Oktober 2026'] });
    expect((await send('patch', `/plans/${plan.id}`, { factors: Array(21).fill('x') })).status).toBe(400);
    expect((await send('patch', `/plans/${plan.id}`, { moduleIds: [m1] })).body.data.modules.map((m) => m.id)).toEqual([m1]);
    await send('patch', `/plans/${plan.id}`, { moduleIds: [m1, m2] });
    await send('patch', `/plans/${plan.id}`, { status: 'archived' });
    expect((await get('/plans')).body.data).toEqual([]);
    expect((await get('/plans?archived=1')).body.data).toHaveLength(1);
    await send('patch', `/plans/${plan.id}`, { status: 'active' });
  });

  it('impor lim_measurements: cocok ID atau nama kompetensi rencana, karyawan peserta', async () => {
    const kinds = (await get('/imports/kinds')).body.data.map((k) => k.key);
    expect(kinds).toContain('lim_measurements');
    const csv = ['ID Karyawan,Nama Kompetensi,Skor Pre,Skor Post,Skor Kinerja,Catatan Kinerja',
      'E-b,ticket life cycle,45,,,', 'E-lama,Ticket Life Cycle,40,,,', 'E-b,Tidak Ada,40,,,', `E-c,${k3},,,61,Dicek atasan`].join('\n');
    const up = await request(app).post('/api/lim/imports?kind=lim_measurements&filename=lim.csv').set(as('hr')).set('Content-Type', 'text/csv').send(csv);
    expect(up.status).toBe(201);
    const id = up.body.data.id;
    const val = await send('post', `/imports/${id}/validate`, { options: { planId: plan.id } });
    expect(val.status).toBe(200);
    expect(val.body.data.accepted).toBe(2);
    const commit = await send('post', `/imports/${id}/commit`, { options: { planId: plan.id } });
    expect(commit.status).toBe(200);
    const rows = (await get(`/plans/${plan.id}/measurements`)).body.data;
    expect(rows.find((r) => r.userId === u.b && r.competencyId === k2)).toMatchObject({ preScore: 45, preSource: 'import' });
    expect(rows.find((r) => r.userId === u.c && r.competencyId === k3)).toMatchObject({ performanceScore: 61 });
  });

  it('ekspor data karyawan memuat impactMeasurement; tenant lain tidak melihat apa pun', async () => {
    const res = await request(app).get(`/api/employees/${u.a}/export`).set(as('hr'));
    expect(res.status).toBe(200);
    expect(res.body.data.impactMeasurement.map((r) => r.competencyId).sort()).toEqual([k1, k2].sort());
    expect((await get(`/plans/${plan.id}/overview`, 'luar')).status).toBe(404);
    expect((await get('/plans', 'luar')).body.data).toEqual([]);
    expect((await send('patch', `/plans/${plan.id}`, { title: 'x' }, 'luar')).status).toBe(404);
    expect((await get('/plans/bukan-uuid/overview')).status).toBe(404);
  });
});
