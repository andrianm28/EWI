// B3: dashboard utama terhadap Postgres. Bukti: store baru (aiReviewCounts, analysisDurations) benar,
// temuan draf dan data tenant lain tidak ikut, atasan hanya timnya. Spek: docs/designs/b3-dashboard.md.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('B3 dashboard utama (Postgres)', () => {
  let db; let stores; let app; const t = {}; const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const q = (sql, replacements) => db.query(sql, { replacements, type: 'SELECT' });

  async function makeTenant(key, flags) {
    const [row] = await q(`INSERT INTO tenants (slug, name) VALUES (:slug, :name) RETURNING id`, { slug: `db-${key}-${Date.now()}`, name: `Dashboard ${key}` });
    t[key] = row.id;
    await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t: row.id } });
    for (const f of flags) await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :f, true)`, { replacements: { t: row.id, f } });
    const [p] = await q(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'Pilot') RETURNING id`, { t: row.id });
    return p.id;
  }
  async function addUser(tenant, key, role, supervisor = null, status = 'active') {
    const [row] = await q(
      `INSERT INTO users (tenant_id, email, name, employee_id, role, status, supervisor_id) VALUES (:t, :e, :n, :emp, :role, :status, :spv) RETURNING id`,
      { t: t[tenant], e: `${key}@dash.test`, n: key, emp: `E-${key}`, role, status, spv: supervisor ? u[supervisor] : null },
    );
    u[key] = row.id;
    tok[key] = await sessionSigner(makeConfig(), createStores(db).authSessions).sign({ id: row.id, tenantId: t[tenant], role, email: `${key}@dash.test` });
  }
  /** Sesi TNA selesai dengan temuan hasil job AI. reviews: daftar [status, reviewer|null, jam setelah sesi selesai]. */
  async function sessionWithFindings(tenant, project, who, reviews, category = 'training') {
    const [s] = await q(
      `INSERT INTO lna_interview_sessions (tenant_id, project_id, submodule, interviewee_id, status, started_at, ended_at)
       VALUES (:t, :p, 'tna', :u, 'completed', now() - interval '10 days', now() - interval '10 days') RETURNING id`,
      { t: t[tenant], p: project, u: u[who] },
    );
    const [j] = await q(`INSERT INTO lna_analysis_jobs (tenant_id, session_id, submodule, status) VALUES (:t, :s, 'tna', 'done') RETURNING id`, { t: t[tenant], s: s.id });
    let seq = 0;
    for (const [status, reviewer, hours] of reviews) {
      seq += 1;
      await db.query(
        `INSERT INTO lna_findings (tenant_id, project_id, user_id, session_id, category, title, review_status, reviewed_by, reviewed_at, analysis_job_id, finding_seq)
         VALUES (:t, :p, :u, :s, :category, :title, :status, :rb, CASE WHEN :hours::int IS NULL THEN NULL ELSE now() - interval '10 days' + make_interval(hours => :hours::int) END, :j, :seq)`,
        { replacements: { t: t[tenant], p: project, u: u[who], s: s.id, title: `Temuan ${who} ${seq}`, status, rb: reviewer ? u[reviewer] : null, hours: hours ?? null, j: j.id, seq, category } },
      );
    }
    return s.id;
  }

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    app = createApp({ config: makeConfig(), stores });
    const pa = await makeTenant('a', ['dashboard.main', 'module.tna', 'module.dna']);
    const pb = await makeTenant('b', ['dashboard.main', 'module.tna']);
    await addUser('a', 'hr', 'hr_admin');
    await addUser('a', 'spv', 'supervisor');
    await addUser('a', 'ani', 'learner', 'spv');
    await addUser('a', 'beni', 'learner', 'spv');
    await addUser('a', 'cici', 'learner');
    await addUser('b', 'hrb', 'hr_admin');
    await addUser('b', 'dodi', 'learner');

    // ani: 2 temuan disetujui HR (2 hari dan 3 hari setelah sesi) -> lama analisis 3 hari
    await sessionWithFindings('a', pa, 'ani', [['approved', 'hr', 48], ['edited', 'hr', 72]]);
    // beni: satu draf -> belum dianalisis, tidak masuk lama analisis
    await sessionWithFindings('a', pa, 'beni', [['draft', null, null]]);
    // cici: temuan lama yang ditandai massal oleh migrasi (approved tanpa reviewer) -> tidak masuk kesepakatan AI
    await sessionWithFindings('a', pa, 'cici', [['approved', null, 1], ['rejected', 'hr', 120]]);
    // fani: hanya temuan non-pelatihan yang sudah ditinjau -> tetap terhitung "dianalisis" untuk HR (spek 3.3)
    await addUser('a', 'fani', 'learner');
    await sessionWithFindings('a', pa, 'fani', [['approved', 'hr', 24]], 'non_training');
    // eko: karyawan nonaktif, di luar penyebut: lama analisis dan rencana tanpa modul miliknya tidak dihitung
    await addUser('a', 'eko', 'learner', null, 'disabled');
    await sessionWithFindings('a', pa, 'eko', [['approved', 'hr', 24]]);
    await db.query(`INSERT INTO lna_training_plan_items (tenant_id, user_id, origin, status) VALUES (:t, :u, 'ai', 'new')`, { replacements: { t: t.a, u: u.eko } });
    await db.query(`INSERT INTO lna_training_plan_items (tenant_id, user_id, origin, status) VALUES (:t, :u, 'ai', 'new')`, { replacements: { t: t.a, u: u.ani } });
    // tenant lain: tidak boleh ikut terhitung
    await sessionWithFindings('b', pb, 'dodi', [['approved', 'hrb', 24], ['draft', null, null]]);
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: Object.values(t) }, transaction });
    });
    await db.close();
  });

  it('aiReviewCounts: hanya temuan job AI; yang diputus harus oleh orang', async () => {
    // seluruh tenant (spek 3.3): ani 1, fani 1, eko 1 disetujui orang; cici 1 tanpa reviewer tidak ikut
    expect(await stores.tna.aiReviewCounts(t.a)).toEqual({ draft: 1, approved: 3, edited: 1, rejected: 1 });
    expect(await stores.tna.aiReviewCounts(t.b)).toEqual({ draft: 1, approved: 1, edited: 0, rejected: 0 });
  });

  it('analysisDurations: sesi yang seluruh temuannya diputus orang, dalam hari, sesuai cakupan', async () => {
    const all = await stores.tna.analysisDurations(t.a, { all: true });
    // store tidak menyaring karyawan nonaktif; penyaringan ke penyebut `people` dilakukan modul dashboard
    expect(all.map((d) => d.userId).sort()).toEqual([u.ani, u.fani, u.eko].sort());
    expect(all.find((d) => d.userId === u.ani).days).toBeCloseTo(3, 1);
    expect(await stores.tna.analysisDurations(t.a, { userIds: [u.beni, u.cici] })).toEqual([]);
  });

  it('HR: angka seluruh tenant tanpa data tenant lain', async () => {
    const res = await request(app).get('/api/dashboard').set(as('hr'));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ scope: 'all', people: 5 }); // spv, ani, beni, cici, fani (eko nonaktif)
    expect(d.kpis.employeesAnalyzed).toBe(3); // ani, cici, fani (non-pelatihan) sudah ditinjau; beni masih draf
    expect(d.kpis.aiHrAgreement).toEqual({ percent: 60, approved: 3, reviewed: 5, targetPercent: 85 }); // seluruh tenant
    expect(d.kpis.analysisDays).toEqual({ median: 2, sessions: 2, targetDays: 14 }); // ani 3 hari, fani 1 hari; eko (nonaktif) tidak ikut
    expect(d.actions).toContainEqual({ key: 'plan_needs_module', count: 1 }); // butir ani saja, bukan eko
    expect(d.actions).toContainEqual({ key: 'review_pending', count: 1 });
    expect(d.modules.map((m) => m.key)).toEqual(['lna', 'li', 'ld', 'lim', 'cp']);
    const [log] = await q(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'dashboard.summary' ORDER BY at DESC LIMIT 1`, { t: t.a });
    expect(log.meta).toMatchObject({ scope: 'all', people: 5 });
  });

  it('atasan: hanya bawahan langsung; tidak ada angka yang membocorkan draf', async () => {
    const res = await request(app).get('/api/dashboard').set(as('spv'));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ scope: 'team', people: 2 });
    expect(d.kpis).toMatchObject({ employeesAnalyzed: 1, aiHrAgreement: null, analysisDays: null });
    expect(d.actions.map((a) => a.key)).not.toContain('review_pending');
    expect(d.pareto.rows.length).toBeGreaterThan(0);
    const [log] = await q(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'dashboard.summary' AND user_id = :u ORDER BY at DESC LIMIT 1`, { t: t.a, u: u.spv });
    expect([...log.meta.employeeIds].sort()).toEqual([u.ani, u.beni].sort());
  });

  it('karyawan ditolak', async () => {
    expect((await request(app).get('/api/dashboard').set(as('ani'))).status).toBe(403);
  });
});
