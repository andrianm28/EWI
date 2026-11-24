// seed-dev (dev/staging): tenant demo menampilkan isi nyata di setiap langkah demo-alur.spec.ts, aman diulang,
// dan mengikuti aturan peran (tenant_admin ada; Super Admin tidak membaca isi karyawan).
// Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan.
const request = require('supertest');
const { Client } = require('pg');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { makeConfig, sessionSigner } = require('../helpers');
const { seedDev } = require('../../scripts/seed-dev');
const { DEMO_FLAGS } = require('../../scripts/demo-flags');

const run = process.env.DATABASE_URL ? describe : describe.skip;
// Kunci induk tetap khusus test ini: data terenkripsi tenant demo harus terbaca lagi di run jest berikutnya.
const MASTER = 'a5'.repeat(32);
const COUNTED = ['users', 'user_roles', 'lna_competencies', 'lna_assessments', 'lna_performance_records', 'lna_interview_sessions',
  'lna_findings', 'lna_analysis_jobs', 'lna_training_plan_items', 'ina_actions', 'lna_non_training_grants', 'li_modules', 'li_module_items',
  'li_module_requests', 'li_module_drafts', 'ld_trainings', 'ld_participants', 'lim_plans', 'lim_indicators', 'lim_measurements',
  'lim_reinterviews', 'cca_sources', 'cca_requirements', 'cca_assignments', 'feature_flags'];

run('seed-dev: tenant demo untuk demo langsung (Postgres)', () => {
  let db; let c; let app; let stores; let tokens; let ids;
  const tok = {};
  const get = (who, path) => request(app).get(`/api${path}`).set({ Authorization: `Bearer ${tok[who]}` });
  const counts = async () => {
    const out = {};
    for (const table of COUNTED) out[table] = (await c.query(`SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [ids.tenantId])).rows[0].n;
    return out;
  };

  beforeAll(async () => {
    const config = makeConfig({ EWI_LOCAL_MASTER_KEY: MASTER });
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db, { encryption: config.encryption });
    app = createApp({ config, stores });
    tokens = sessionSigner(config, stores.authSessions);
    c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    await c.query(`SET search_path TO "${process.env.DB_SCHEMA || 'ewi'}"`);
    ids = await seedDev(c, { password: 'sandi-uji-seed', stores, env: { NODE_ENV: 'test' } });
    const { rows } = await c.query(`SELECT id, email, role FROM users WHERE tenant_id = $1`, [ids.tenantId]);
    for (const u of rows) tok[u.email.split('@')[0]] = await tokens.sign({ id: u.id, tenantId: ids.tenantId, role: u.role, email: u.email });
  }, 60000);
  afterAll(async () => { await c?.end(); await db?.close(); });

  test('menolak produksi sebelum menyentuh database', async () => {
    const fake = { query: jest.fn() };
    await expect(seedDev(fake, { password: 'x', env: { NODE_ENV: 'production' } })).rejects.toThrow('dilarang di produksi');
    expect(fake.query).not.toHaveBeenCalled();
  });

  test('idempoten: jalan kedua tidak menambah baris', async () => {
    const before = await counts();
    await seedDev(c, { password: 'sandi-uji-seed', stores, env: { NODE_ENV: 'test' } });
    expect(await counts()).toEqual(before);
  }, 60000);

  test('flag demo menyala; tenant_admin ada; eta_admin tetap eta_admin', async () => {
    const { rows } = await c.query('SELECT key FROM feature_flags WHERE tenant_id = $1 AND enabled', [ids.tenantId]);
    expect(rows.map((r) => r.key)).toEqual(expect.arrayContaining([...DEMO_FLAGS]));
    const roles = (await c.query('SELECT email, role FROM users WHERE tenant_id = $1', [ids.tenantId])).rows;
    expect(roles).toEqual(expect.arrayContaining([{ email: 'admin@demo.test', role: 'tenant_admin' }, { email: 'eta@demo.test', role: 'eta_admin' }]));
  });

  test('HR: dashboard (Pareto, kesepakatan AI–HR), papan gap, tinjauan temuan, INA, LI, LD, LIM, CC berisi', async () => {
    const dash = (await get('hr', '/dashboard').expect(200)).body.data;
    expect(dash.pareto.rows[0].label).toBe('Analisis insiden');
    expect(dash.kpis.aiHrAgreement.reviewed).toBe(3);
    expect(dash.kpis.okrGaps).toBeGreaterThan(0);
    const gaps = (await get('hr', '/tna/gaps/competencies').expect(200)).body.data;
    expect(JSON.stringify(gaps)).toContain('Analisis insiden');
    const review = (await get('hr', '/tna/review').expect(200)).body;
    expect(review.data).toHaveLength(4);
    expect((await get('hr', '/tna/review?status=reviewed').expect(200)).body.data).toHaveLength(3);
    expect((await get('hr', '/ina/actions').expect(200)).body.data.map((a) => a.title)).toContain('Perbarui SOP eskalasi insiden');
    expect((await get('hr', '/li/modules').expect(200)).body.data.map((m) => m.name)).toEqual(expect.arrayContaining(['Root Cause Analysis', 'ITIL Foundation']));
    expect(JSON.stringify((await get('hr', '/ld/trainings').expect(200)).body.data)).toContain('ITIL Foundation');
    expect(JSON.stringify((await get('hr', '/lim/plans').expect(200)).body.data)).toContain('Pilot L1');
    expect(JSON.stringify((await get('hr', `/lim/plans/${ids.planId}/reinterviews/${ids.memberIds[0]}`).expect(200)).body.data)).toContain('Analisis insiden');
    expect(JSON.stringify((await get('hr', '/cca/overview').expect(200)).body)).toContain('Menjadi pemimpin layanan cloud.');
    const dna = (await get('hr', '/dna/development/overview').expect(200)).body.data;
    expect(dna.kpi.jobFunctions).toBe(3);
    expect(dna.stageDistribution.find((s) => s.stage === 'basic')?.count).toBeGreaterThan(0);
  });

  test('Atasan: akses INA diberikan HR, undangan wawancara untuk dirinya', async () => {
    expect((await get('spv', '/ina/actions').expect(200)).body.data.length).toBeGreaterThan(0);
    expect((await get('spv', '/dashboard').expect(200)).body.data.pareto.rows.length).toBeGreaterThan(0);
  });

  test('Karyawan demo: punya jabatan, skor, undangan, rencana belajar, dan jadwal wawancara ulang', async () => {
    const my = (await get('learner', '/my/results').expect(200)).body.data;
    expect(JSON.stringify(my)).toContain('Otomasi infrastruktur');
    expect(my.invitations.length).toBeGreaterThan(0);
    expect((await get('learner', '/my/learning-plan').expect(200)).body.data.length).toBeGreaterThan(0);
    expect((await get('learner', '/lim/me/reinterviews').expect(200)).body.data[0].status).toBe('open');
  });

  test('Super Admin tidak membaca isi karyawan walau tenant demo menyalakan semua modul', async () => {
    for (const path of ['/dashboard', '/tna/review', '/ina/access/me', '/ina/actions']) {
      const res = await get('eta', path);
      expect([path, res.status]).toEqual([path, 403]);
    }
  });
});
