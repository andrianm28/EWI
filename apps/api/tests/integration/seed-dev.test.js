// seed-dev (dev/staging): tenant demo menampilkan isi nyata di setiap langkah demo-alur.spec.ts, aman diulang,
// dan mengikuti aturan peran (tenant_admin ada; Super Admin tidak membaca isi karyawan).
// Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan.
const crypto = require('crypto');
const request = require('supertest');
const { Client } = require('pg');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { makeConfig, sessionSigner } = require('../helpers');
const { seedDev } = require('../../scripts/seed-dev');
const { DEMO_FLAGS } = require('../../scripts/demo-flags');
// Sandi acak per run (pola db-app-role.test.js): tidak ada sandi literal di repo
const SANDI = crypto.randomBytes(12).toString('hex');

const run = process.env.DATABASE_URL ? describe : describe.skip;
// Tenant baru per run (slug unik): kunci induk acak bawaan test aman, dan sisa run lain tidak memengaruhi hasil.
const SLUG = `demo-uji-${Date.now()}`;
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
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db, { encryption: config.encryption });
    app = createApp({ config, stores });
    tokens = sessionSigner(config, stores.authSessions);
    c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    await c.query(`SET search_path TO "${process.env.DB_SCHEMA || 'ewi'}"`);
    ids = await seedDev(c, { password: SANDI, stores, slug: SLUG, env: { NODE_ENV: 'test' } });
    const { rows } = await c.query(`SELECT id, email, role FROM users WHERE tenant_id = $1`, [ids.tenantId]);
    for (const u of rows) tok[u.email.split('@')[0]] = await tokens.sign({ id: u.id, tenantId: ids.tenantId, role: u.role, email: u.email });
  }, 60000);
  afterAll(async () => { await c?.end(); await db?.close(); });

  test('menolak produksi sebelum menyentuh database', async () => {
    const fake = { query: jest.fn() };
    await expect(seedDev(fake, { password: SANDI, env: { NODE_ENV: 'production' } })).rejects.toThrow('dilarang di produksi');
    expect(fake.query).not.toHaveBeenCalled();
  });

  test('idempoten: jalan kedua tidak menambah baris', async () => {
    const before = await counts();
    await seedDev(c, { password: SANDI, stores, slug: SLUG, env: { NODE_ENV: 'test' } });
    expect(await counts()).toEqual(before);
  }, 60000);

  test('kolom terenkripsi tersimpan terenkripsi (bukan teks biasa)', async () => {
    const raw = async (sql) => (await c.query(sql, [ids.tenantId])).rows.map((r) => r.v);
    const columns = {
      'lna_assessments.evidence': await raw('SELECT evidence AS v FROM lna_assessments WHERE tenant_id = $1 AND evidence IS NOT NULL'),
      'lna_findings.title': await raw('SELECT title AS v FROM lna_findings WHERE tenant_id = $1'),
      'lna_findings.detail': await raw('SELECT detail AS v FROM lna_findings WHERE tenant_id = $1 AND detail IS NOT NULL'),
      'ina_actions.title': await raw('SELECT title AS v FROM ina_actions WHERE tenant_id = $1'),
      'ina_actions.detail': await raw('SELECT detail AS v FROM ina_actions WHERE tenant_id = $1 AND detail IS NOT NULL'),
      'cca_assignments.summary': await raw('SELECT summary AS v FROM cca_assignments WHERE tenant_id = $1 AND summary IS NOT NULL'),
      'lim_reinterviews.summary': await raw('SELECT summary AS v FROM lim_reinterviews WHERE tenant_id = $1 AND summary IS NOT NULL'),
    };
    for (const [col, values] of Object.entries(columns)) {
      expect([col, values.length > 0]).toEqual([col, true]);
      expect([col, values.filter((v) => !stores.cipher.isEncrypted(v))]).toEqual([col, []]);
    }
  });

  test('hanya kompetensi seed yang disahkan; draf lain di tenant tetap draf', async () => {
    const { rows: [draft] } = await c.query(
      `INSERT INTO lna_competencies (tenant_id, kind, name, source, importance) VALUES ($1, 'core', 'Draf staging', 'hr_rule', 3) RETURNING id`, [ids.tenantId]);
    await seedDev(c, { password: SANDI, stores, slug: SLUG, env: { NODE_ENV: 'test' } });
    const { rows: [row] } = await c.query('SELECT approved_at, approved_by, program_tier FROM lna_competencies WHERE id = $1', [draft.id]);
    expect(row).toEqual({ approved_at: null, approved_by: null, program_tier: null });
    await c.query('DELETE FROM lna_competencies WHERE id = $1', [draft.id]);
  }, 60000);

  test('flag demo menyala; tenant_admin ada; eta_admin tetap eta_admin', async () => {
    const { rows } = await c.query('SELECT key FROM feature_flags WHERE tenant_id = $1 AND enabled', [ids.tenantId]);
    expect(rows.map((r) => r.key)).toEqual(expect.arrayContaining([...DEMO_FLAGS]));
    const roles = (await c.query('SELECT email, role FROM users WHERE tenant_id = $1', [ids.tenantId])).rows;
    expect(roles).toEqual(expect.arrayContaining([{ email: 'admin@demo.test', role: 'tenant_admin' }, { email: 'eta@demo.test', role: 'eta_admin' }]));
  });

  test('HR: dashboard (Pareto, kesepakatan AI–HR), papan gap, tinjauan temuan, INA, LI, LD, LIM, CC berisi', async () => {
    const dash = (await get('hr', '/dashboard').expect(200)).body.data;
    expect(dash.pareto.rows.map((r) => r.competencyId)).toContain(ids.competencyIds['Analisis insiden']);
    expect(dash.kpis.aiHrAgreement.reviewed).toBe(ids.reviewedFindingIds.length);
    expect(dash.kpis.okrGaps).toBeGreaterThan(0);
    const gaps = (await get('hr', '/tna/gaps/competencies').expect(200)).body.data;
    expect(JSON.stringify(gaps)).toContain('Analisis insiden');
    const idsOf = (body) => body.data.map((f) => f.id);
    expect(idsOf((await get('hr', '/tna/review').expect(200)).body)).toEqual(expect.arrayContaining(ids.draftFindingIds));
    expect(idsOf((await get('hr', '/tna/review?status=reviewed').expect(200)).body)).toEqual(expect.arrayContaining(ids.reviewedFindingIds));
    const actions = (await get('hr', '/ina/actions').expect(200)).body.data;
    expect(actions.map((a) => a.id)).toEqual(expect.arrayContaining(ids.inaActionIds));
    expect(actions.map((a) => a.title)).toContain('Perbarui SOP eskalasi insiden');
    expect((await get('hr', '/li/modules').expect(200)).body.data.map((m) => m.name)).toEqual(expect.arrayContaining(['Root Cause Analysis', 'ITIL Foundation']));
    expect(JSON.stringify((await get('hr', '/ld/trainings').expect(200)).body.data)).toContain('ITIL Foundation');
    expect(JSON.stringify((await get('hr', '/lim/plans').expect(200)).body.data)).toContain('Pilot L1');
    expect(JSON.stringify((await get('hr', `/lim/plans/${ids.planId}/reinterviews/${ids.memberIds[0]}`).expect(200)).body.data)).toContain('Analisis insiden');
    // gladi 25 Nov: hasil Dimas harus terjangkau dari tab Pengukuran AI (antrean butuh skor post dari LD)
    const antrean = (await get('hr', `/lim/plans/${ids.planId}/queue`).expect(200)).body.data;
    expect(antrean.map((x) => x.userId)).toEqual(expect.arrayContaining(ids.memberIds));
    expect(antrean.find((x) => x.userId === ids.memberIds[0])).toMatchObject({ status: 'done', canView: true });
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
    const mine = (await get('learner', '/lim/me/reinterviews').expect(200)).body.data;
    expect(mine.find((x) => x.planId === ids.planId)?.status).toBe('open');
  });

  // ---------- Gap demo 25 Nov (daftar-gap-25nov.md, kelompok B) ----------
  test('B1: draf SD-B1 berbentuk kontrak generateDraft (tujuan {kind,text} terukur, asesmen dengan cakupan)', async () => {
    const drafts = (await get('hr', '/li/drafts').expect(200)).body.data;
    const rca = drafts.find((d) => d.moduleCode === 'SD-B1');
    const d = (await get('hr', `/li/drafts/${rca.id}`).expect(200)).body.data;
    expect(d.objectives.length).toBeGreaterThan(0);
    for (const o of d.objectives) {
      expect(['K', 'S', 'A']).toContain(o.kind);
      expect(o.text).toMatch(/\d/); // terukur: tidak ada galat merah "belum terukur"
    }
    for (const a of d.assessments) {
      expect(['K', 'S', 'A']).toContain(a.kind);
      expect(Number.isInteger(a.objectives)).toBe(true); // bukan "undefined tujuan tercakup"
    }
    // simpan ulang isi yang sama diterima API (sebelumnya 400 "Tipe tujuan harus K, S, atau A")
    await request(app).put(`/api/li/drafts/${d.id}`).set({ Authorization: `Bearer ${tok.hr}` })
      .send({ objectives: d.objectives, sessions: d.sessions, assessments: d.assessments }).expect(200);
  });

  test('B1/B5: seed ulang memperbaiki data seed lama di staging (draf berisi string, Budi sudah ditugaskan)', async () => {
    const { rows: [d] } = await c.query(`SELECT d.id FROM li_module_drafts d JOIN li_modules m ON m.id = d.module_id WHERE d.tenant_id = $1 AND m.code = 'SD-B1'`, [ids.tenantId]);
    await c.query(`UPDATE li_module_drafts SET objectives = '["Menjelaskan langkah 5 Whys pada insiden P2"]'::jsonb WHERE id = $1`, [d.id]);
    const { rows: [lead] } = await c.query(`SELECT id FROM cca_assignments WHERE tenant_id = $1 AND assignee_id = $2 AND tier = 'leader'`, [ids.tenantId, ids.spvId]);
    await c.query(`INSERT INTO cca_assignments (tenant_id, assignee_id, assigned_by, tier, parent_id, due_date, status, created_at)
                   VALUES ($1, $2, $3, 'employee', $4, '2026-12-01', 'assigned', '2026-11-24T10:00:00Z')`, [ids.tenantId, ids.memberIds[2], ids.spvId, lead.id]);
    await seedDev(c, { password: SANDI, stores, slug: SLUG, env: { NODE_ENV: 'test' } });
    const draft = (await get('hr', `/li/drafts/${d.id}`).expect(200)).body.data;
    expect(draft.objectives.every((o) => typeof o === 'object' && ['K', 'S', 'A'].includes(o.kind))).toBe(true);
    const team = (await get('spv', '/cca/assignments').expect(200)).body.data.team;
    expect(team.find((m) => m.name === 'Budi').status).toBe('none');
  }, 60000);

  test('B2: HR dan Atasan bisa beralih ke Karyawan (saya); Admin Tenant ke HR dan Karyawan', async () => {
    const views = async (who) => (await get(who, '/me/access').expect(200)).body.roles.map((r) => r.view).sort();
    expect(await views('hr')).toEqual(['hr', 'karyawan']);
    expect(await views('spv')).toEqual(['atasan', 'karyawan']);
    expect(await views('admin')).toEqual(['admin', 'hr', 'karyawan']);
  });

  test('B3: keputusan promosi berisi satu menunggu HR (Setujui), satu menunggu atasan (Rekomendasikan), satu belum memenuhi', async () => {
    const hr = (await get('hr', '/dna/career/decisions').expect(200)).body.data;
    const byName = (rows, name) => rows.find((x) => x.employee.name === name);
    expect(byName(hr, 'Learner Demo')).toMatchObject({ eligible: true, actions: ['approve', 'hold'] });
    expect(byName(hr, 'Budi')).toMatchObject({ eligible: true, actions: [], blockedReason: 'waiting_supervisor' });
    expect(byName(hr, 'Rina')).toMatchObject({ eligible: false });
    const spv = (await get('spv', '/dna/career/decisions').expect(200)).body.data;
    expect(byName(spv, 'Budi')).toMatchObject({ actions: ['recommend', 'hold'] });
    // rekomendasi Learner Demo berasal dari atasannya sendiri (RG-3: atasan melihat timnya)
    expect(byName(spv, 'Learner Demo')).toMatchObject({ supervisor: { decision: 'recommend' } });
  });

  test('B4/B5/B7: CC punya pimpinan belum ditugaskan, anggota tim belum ditugaskan dan belum mulai, persyaratan Misi, indikator Integritas, program nilai', async () => {
    const hr = (await get('hr', '/cca/assignments').expect(200)).body.data;
    expect(hr.leaders.some((l) => l.status === 'none')).toBe(true);
    const spv = (await get('spv', '/cca/assignments').expect(200)).body.data;
    expect(spv.canAssign).toBe(true);
    const status = Object.fromEntries(spv.team.map((m) => [m.name, m.status]));
    expect(status).toMatchObject({ Budi: 'none', Rina: 'assigned', Dimas: 'completed' });
    expect(JSON.stringify((await get('hr', '/cca/overview').expect(200)).body)).toContain('Keandalan pemulihan layanan');
    expect(JSON.stringify((await get('hr', '/cca/overview?group=values').expect(200)).body)).toContain('Melaporkan insiden apa adanya');
    const programs = (await get('hr', '/cca/programs').expect(200)).body.data;
    expect(programs.map((p) => p.key)).toContain('nilai-2026');
    const report = (await get('hr', '/cca/programs/nilai-2026/report').expect(200)).body.data;
    expect(report.kpis.registered).toBe(4);
    expect(report.kpis.completed).toBeLessThan(4); // ada yang belum selesai: tombol "Wawancarai karyawan yang belum selesai"
  });

  test('B6: Program & Course punya course Advanced, satu untuk Kembangkan dan satu untuk Minta', async () => {
    const adv = (await get('hr', '/li/programs?level=advanced').expect(200)).body.data;
    const mods = adv.groups.flatMap((g) => g.modules);
    expect(mods.length).toBeGreaterThanOrEqual(2);
    const open = mods.filter((m) => m.status.key === 'none');
    expect(open.map((m) => m.recommendation).sort()).toEqual(expect.arrayContaining(['dev', 'vendor']));
  });

  test('B8/C6: LD punya data Kirim pengingat, Kirim ajakan, Minta konfirmasi, Lihat program; LIM punya jadwal belum mulai', async () => {
    const dash = (await get('hr', '/ld/dashboard').expect(200)).body.data;
    expect(dash.actions.some((a) => a.kind === 'remind')).toBe(true);
    const trainings = JSON.stringify((await get('hr', '/ld/trainings').expect(200)).body.data);
    expect(trainings).toContain('Komunikasi insiden ke pelanggan');
    expect(trainings).toContain('Root Cause Analysis (angkatan 2)');
    expect(trainings).toContain('ITIL Foundation (angkatan 2)');
    const antrean = (await get('hr', `/lim/plans/${ids.planId}/queue`).expect(200)).body.data;
    expect(antrean.find((x) => x.userId === ids.memberIds[1])).toMatchObject({ status: 'scheduled' });
  });

  test('Super Admin tidak membaca isi karyawan walau tenant demo menyalakan semua modul', async () => {
    for (const path of ['/dashboard', '/tna/review', '/ina/access/me', '/ina/actions']) {
      const res = await get('eta', path);
      expect([path, res.status]).toEqual([path, 403]);
    }
  });
});
