// B3: dashboard utama terhadap Postgres. Bukti: store baru (aiReviewCounts, analysisDurations) benar,
// temuan draf dan data tenant lain tidak ikut, atasan hanya timnya. Spek: docs/designs/b3-dashboard.md.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { makeConfig } = require('../helpers');

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
  async function addUser(tenant, key, role, supervisor = null) {
    const [row] = await q(
      `INSERT INTO users (tenant_id, email, name, employee_id, role, status, supervisor_id) VALUES (:t, :e, :n, :emp, :role, 'active', :spv) RETURNING id`,
      { t: t[tenant], e: `${key}@dash.test`, n: key, emp: `E-${key}`, role, spv: supervisor ? u[supervisor] : null },
    );
    u[key] = row.id;
    tok[key] = createTokenService(makeConfig().jwt).sign({ id: row.id, tenantId: t[tenant], role, email: `${key}@dash.test` });
  }
  /** Sesi TNA selesai dengan temuan hasil job AI. reviews: daftar [status, reviewer|null, jam setelah sesi selesai]. */
  async function sessionWithFindings(tenant, project, who, reviews) {
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
         VALUES (:t, :p, :u, :s, 'training', :title, :status, :rb, CASE WHEN :hours::int IS NULL THEN NULL ELSE now() - interval '10 days' + make_interval(hours => :hours::int) END, :j, :seq)`,
        { replacements: { t: t[tenant], p: project, u: u[who], s: s.id, title: `Temuan ${who} ${seq}`, status, rb: reviewer ? u[reviewer] : null, hours: hours ?? null, j: j.id, seq } },
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
    expect(await stores.tna.aiReviewCounts(t.a)).toEqual({ draft: 1, approved: 1, edited: 1, rejected: 1 });
    expect(await stores.tna.aiReviewCounts(t.b)).toEqual({ draft: 1, approved: 1, edited: 0, rejected: 0 });
  });

  it('analysisDurations: sesi yang seluruh temuannya diputus orang, dalam hari, sesuai cakupan', async () => {
    const all = await stores.tna.analysisDurations(t.a, { all: true });
    expect(all.map((d) => d.userId)).toEqual([u.ani]);
    expect(all[0].days).toBeCloseTo(3, 1);
    expect(await stores.tna.analysisDurations(t.a, { userIds: [u.beni, u.cici] })).toEqual([]);
  });

  it('HR: angka seluruh tenant tanpa data tenant lain', async () => {
    const res = await request(app).get('/api/dashboard').set(as('hr'));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ scope: 'all', people: 4 }); // spv, ani, beni, cici
    expect(d.kpis.employeesAnalyzed).toBe(2); // ani dan cici punya temuan yang sudah ditinjau; beni masih draf
    expect(d.kpis.aiHrAgreement).toEqual({ percent: 33, approved: 1, reviewed: 3, targetPercent: 85 });
    expect(d.kpis.analysisDays).toEqual({ median: 3, sessions: 1, targetDays: 14 });
    expect(d.actions).toContainEqual({ key: 'review_pending', count: 1 });
    expect(d.modules.map((m) => m.key)).toEqual(['lna', 'li', 'ld', 'lim', 'cp']);
    const [log] = await q(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'dashboard.summary' ORDER BY at DESC LIMIT 1`, { t: t.a });
    expect(log.meta).toMatchObject({ scope: 'all', people: 4 });
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
