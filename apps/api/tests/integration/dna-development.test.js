// B4 Developmental Needs dari ujung ke ujung di Postgres (spek: docs/designs/b4-developmental-needs.md).
// Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan (CI menyiapkannya).
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { makeConfig } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('B4 Developmental Needs (Postgres)', () => {
  let db; let app; let tokens; let tenant; let otherTenant; const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const get = (path, who) => request(app).get(`/api/dna${path}`).set(as(who));
  const post = (path, who, body) => request(app).post(`/api/dna${path}`).set(as(who)).send(body);
  const audits = async (resource) => (await db.query('SELECT user_id, action, meta FROM audit_logs WHERE tenant_id = :t AND resource = :resource ORDER BY id',
    { replacements: { t: tenant.id, resource } }))[0];

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    app = createApp({ config, stores: createStores(db) });
    tokens = createTokenService(config.jwt);
    const slug = `b4-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'ELGOS B4') RETURNING id`, { replacements: { slug } });
    [[otherTenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Lain') RETURNING id`, { replacements: { slug: `${slug}-x` } });
    const add = async (key, role, t = tenant.id) => {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, :email, :name, :emp, :role, 'active') RETURNING id`,
        { replacements: { t, email: `${key}@b4.test`, name: key, emp: `E-${key}`, role } },
      );
      u[key] = row.id;
      tok[key] = tokens.sign({ id: row.id, tenantId: t, role, email: `${key}@b4.test` });
    };
    await add('hr', 'hr_admin');
    await add('spv', 'supervisor');
    await add('spv2', 'supervisor');
    await add('ani', 'learner');
    await add('budi', 'learner');
    await add('cici', 'learner');
    await add('luar', 'hr_admin', otherTenant.id);
    await db.query('UPDATE users SET supervisor_id = :spv WHERE id IN (:ids)', { replacements: { spv: u.spv, ids: [u.ani, u.budi] } });
    for (const t of [tenant.id, otherTenant.id]) {
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'dna')`, { replacements: { t } });
      await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'module.dna', true)`, { replacements: { t } });
    }
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, otherTenant.id] }, transaction });
    });
    await db.close();
  });

  let role; let emptyRole; let otherRole; const c = {}; const jf = {};

  it('HR menyusun jabatan, kamus berkode dengan tingkat BIA, dan job function', async () => {
    role = (await post('/job-roles', 'hr', { name: 'Engineer Service Delivery', division: 'IT Service Delivery', levels: [{ name: 'Junior', programTier: 'basic' }, { name: 'Senior', programTier: 'intermediate' }] })).body.data;
    emptyRole = (await post('/job-roles', 'hr', { name: 'Solution Architect' })).body.data;
    otherRole = (await post('/job-roles', 'luar', { name: 'Jabatan tenant lain' })).body.data;

    const bulk = await post('/competencies/bulk', 'hr', {
      items: [
        { kind: 'job', jobRoleId: role.id, name: 'Fondasi layanan', code: 'ST-B1', stream: 'Specific Technical', programTier: 'basic' },
        { kind: 'job', jobRoleId: role.id, name: 'Ticket life cycle', code: 'ST-B4', stream: 'Specific Technical', programTier: 'basic' },
        { kind: 'job', jobRoleId: role.id, careerLevelId: role.levels[1].id, name: 'Automation & IaC', code: 'TC-I1', stream: 'Technical', programTier: 'intermediate' },
        { kind: 'job', jobRoleId: role.id, name: 'RCA', code: 'ST-A2', stream: 'Specific Technical', programTier: 'advanced', requiredScore: 4 },
        { kind: 'job', jobRoleId: role.id, name: 'Tanpa tingkat' },
        { kind: 'core', name: 'Integritas' },
      ],
    });
    expect(bulk.status).toBe(201);
    for (const row of bulk.body.data) c[row.code || row.name] = row;
    expect(c['ST-B1']).toMatchObject({ code: 'ST-B1', stream: 'Specific Technical', programTier: 'basic' });

    const f1 = await post(`/job-roles/${role.id}/job-functions`, 'hr', { name: 'Penanganan insiden', competencyIds: [c['ST-B4'].id, c['ST-A2'].id] });
    expect(f1.status).toBe(201);
    expect(f1.body.data).toMatchObject({ order: 1, name: 'Penanganan insiden', jobRoleId: role.id });
    expect(f1.body.data.competencyIds.sort()).toEqual([c['ST-B4'].id, c['ST-A2'].id].sort());
    const f2 = await post(`/job-roles/${role.id}/job-functions`, 'hr', { name: 'Change management' });
    expect(f2.body.data.order).toBe(2);
    jf.insiden = f1.body.data; jf.change = f2.body.data;
  });

  it('menolak kode ganda, nama/nomor job function ganda (409), dan kode tanpa jabatan (400)', async () => {
    expect((await post('/competencies', 'hr', { kind: 'job', jobRoleId: role.id, name: 'Lain', code: 'st-b1' })).status).toBe(409);
    const dupBatch = await post('/competencies/bulk', 'hr', { items: [
      { kind: 'job', jobRoleId: role.id, name: 'X1', code: 'DUP-1' }, { kind: 'job', jobRoleId: role.id, name: 'X2', code: 'dup-1' }] });
    expect(dupBatch.status).toBe(409);
    expect((await get(`/competencies?jobRoleId=${role.id}`, 'hr')).body.data.some((x) => x.name === 'X1')).toBe(false);
    expect((await post('/competencies', 'hr', { kind: 'core', name: 'Inti berkode', code: 'C-1' })).status).toBe(400);
    expect((await post('/competencies', 'hr', { kind: 'job', jobRoleId: role.id, name: 'Tier salah', programTier: 'expert' })).status).toBe(400);
    expect((await post(`/job-roles/${role.id}/job-functions`, 'hr', { name: 'penanganan INSIDEN' })).status).toBe(409);
    expect((await post(`/job-roles/${role.id}/job-functions`, 'hr', { name: 'Baru', order: 1 })).status).toBe(409);
    expect((await post(`/job-roles/${role.id}/job-functions`, 'hr', { name: '' })).status).toBe(400);
  });

  it('tenant: job role, job function, dan kompetensi tenant lain tidak bisa dipakai', async () => {
    expect((await post('/competencies', 'hr', { kind: 'job', jobRoleId: otherRole.id, name: 'Menumpang' })).status).toBe(404);
    expect((await post(`/job-roles/${otherRole.id}/job-functions`, 'hr', { name: 'Menumpang' })).status).toBe(404);
    expect((await get(`/job-roles/${otherRole.id}/dictionary`, 'hr')).status).toBe(404);
    expect((await get(`/job-roles/${role.id}/dictionary`, 'luar')).status).toBe(404);
    expect((await get(`/job-roles/${role.id}/curriculum`, 'luar')).status).toBe(404);
    expect((await get('/job-roles/bukan-uuid/dictionary', 'hr')).status).toBe(404);
    const foreign = (await post('/competencies', 'luar', { kind: 'job', jobRoleId: otherRole.id, name: 'Milik lain' })).body.data;
    const put = await request(app).put(`/api/dna/job-functions/${jf.change.id}/competencies`).set(as('hr')).send({ competencyIds: [foreign.id] });
    expect(put.status).toBe(400);
    expect((await request(app).put(`/api/dna/job-functions/${jf.change.id}/competencies`).set(as('luar')).send({ competencyIds: [] })).status).toBe(404);
    expect((await request(app).put(`/api/dna/job-functions/${jf.change.id}/competencies`).set(as('hr')).send({ competencyIds: [c.Integritas.id] })).status).toBe(400);
  });

  it('HR mengubah pemetaan, nama job function, dan melengkapi kompetensi; karyawan dan atasan tidak boleh menulis', async () => {
    const put = await request(app).put(`/api/dna/job-functions/${jf.change.id}/competencies`).set(as('hr')).send({ competencyIds: [c['ST-B1'].id] });
    expect(put.status).toBe(200);
    expect(put.body.data.competencyIds).toEqual([c['ST-B1'].id]);
    const patch = await request(app).patch(`/api/dna/job-functions/${jf.change.id}`).set(as('hr')).send({ name: 'Change management & rilis' });
    expect(patch.body.data).toMatchObject({ name: 'Change management & rilis', order: 2 });
    expect((await request(app).patch(`/api/dna/job-functions/${jf.change.id}`).set(as('hr')).send({ order: 1 })).status).toBe(409);

    const tmp = (await post(`/job-roles/${role.id}/job-functions`, 'hr', { name: 'Sementara' })).body.data;
    expect((await request(app).delete(`/api/dna/job-functions/${tmp.id}`).set(as('hr'))).status).toBe(204);
    expect((await request(app).delete(`/api/dna/job-functions/${tmp.id}`).set(as('hr'))).status).toBe(404);

    const edited = await request(app).patch(`/api/dna/competencies/${c['Tanpa tingkat'].id}`).set(as('hr')).send({ code: 'NT-X', stream: 'Non-Technical' });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ code: 'NT-X', stream: 'Non-Technical', programTier: null, approvedAt: null });
    expect((await request(app).patch(`/api/dna/competencies/${c['Tanpa tingkat'].id}`).set(as('hr')).send({ code: 'ST-B1' })).status).toBe(409);
    expect((await request(app).patch(`/api/dna/competencies/${c['Tanpa tingkat'].id}`).set(as('hr')).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/dna/competencies/${c['Tanpa tingkat'].id}`).set(as('luar')).send({ code: 'Z' })).status).toBe(404);

    for (const who of ['ani', 'spv']) {
      expect((await post(`/job-roles/${role.id}/job-functions`, who, { name: 'Tidak boleh' })).status).toBe(403);
      expect((await post(`/job-roles/${role.id}/dictionary/approve`, who)).status).toBe(403);
      expect((await request(app).patch(`/api/dna/competencies/${c['ST-B1'].id}`).set(as(who)).send({ stream: 'x' })).status).toBe(403);
    }
  });

  it('kamus per job function dengan filter tingkat; kurikulum per tingkat', async () => {
    const all = await get(`/job-roles/${role.id}/dictionary`, 'spv');
    expect(all.status).toBe(200);
    expect(all.body.data.jobFunctions.map((f) => [f.order, f.name, f.competencyCount])).toEqual([[1, 'Penanganan insiden', 2], [2, 'Change management & rilis', 1]]);
    expect(all.body.data.competencies.map((x) => x.code)).toEqual(['NT-X', 'ST-A2', 'ST-B1', 'ST-B4', 'TC-I1']); // inti tidak ikut
    expect(all.body.data.competencies.find((x) => x.code === 'ST-B4').jobFunctionIds).toEqual([jf.insiden.id]);
    expect(all.body.data.dictionary).toMatchObject({ status: 'available', tool1: true, tool2: true, tool3: true, competencyCount: 5, approvedCount: 0, approved: false });

    const byJf = await get(`/job-roles/${role.id}/dictionary?jobFunctionId=${jf.insiden.id}&tier=basic`, 'hr');
    expect(byJf.body.data.competencies.map((x) => x.code)).toEqual(['ST-B4']);
    expect(byJf.body.data.jobFunctions).toHaveLength(2);
    expect((await get(`/job-roles/${role.id}/dictionary?tier=expert`, 'hr')).status).toBe(400);
    expect((await get(`/job-roles/${role.id}/dictionary?jobFunctionId=${role.id}`, 'hr')).status).toBe(400);

    const cur = await get(`/job-roles/${role.id}/curriculum`, 'hr');
    expect(cur.body.data.tiers.map((t) => [t.tier, t.count, t.modules.map((m) => m.code)])).toEqual([
      ['basic', 2, ['ST-B1', 'ST-B4']], ['intermediate', 1, ['TC-I1']], ['advanced', 1, ['ST-A2']]]);
    expect(cur.body.data.untiered).toBe(1);
    expect((await get(`/job-roles/${role.id}/dictionary`, 'ani')).status).toBe(403);
    expect((await get(`/job-roles/${role.id}/curriculum`, 'ani')).status).toBe(403);
  });

  it('HR mengesahkan kamus sekali jalan dan tercatat di audit', async () => {
    const res = await post(`/job-roles/${role.id}/dictionary/approve`, 'hr');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ approved: 5 });
    expect((await post(`/job-roles/${role.id}/dictionary/approve`, 'hr')).body.data).toEqual({ approved: 0 });
    const d = (await get(`/job-roles/${role.id}/dictionary`, 'hr')).body.data.dictionary;
    expect(d).toMatchObject({ approvedCount: 5, approved: true });
    const rows = await audits('dna.dictionary');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ user_id: u.hr, action: 'update' });
    expect(rows[0].meta).toMatchObject({ event: 'approve', jobRoleId: role.id, approved: 5 });
    expect((await post(`/job-roles/${otherRole.id}/dictionary/approve`, 'hr')).status).toBe(404);
  });

  it('tahap, daftar kebutuhan, dan rencana pengembangan per pegawai', async () => {
    for (const k of ['ani', 'budi', 'cici']) {
      await request(app).put(`/api/dna/employees/${u[k]}/position`).set(as('hr')).send({ jobRoleId: role.id, careerLevelId: role.levels[0].id }).expect(200);
    }
    const score = async (who, code, s) => db.query(
      `INSERT INTO lna_assessments (tenant_id, user_id, competency_id, score, source) VALUES (:t, :u, :c, :s, 'manual_interview')`,
      { replacements: { t: tenant.id, u: u[who], c: c[code].id, s } });
    await score('ani', 'ST-B1', 3); await score('ani', 'ST-B4', 2); await score('ani', 'TC-I1', 1);
    await score('budi', 'ST-B1', 3); await score('budi', 'ST-B4', 3); await score('budi', 'TC-I1', 3); await score('budi', 'ST-A2', 4);

    const list = await get(`/development/employees?jobRoleId=${role.id}`, 'hr');
    expect(list.status).toBe(200);
    expect(list.body.data.map((p) => [p.name, p.stage, p.met, p.assessed, p.total, p.focus])).toEqual([
      ['ani', 'basic', 1, 3, 4, ['ST-B4']], ['budi', 'done', 4, 4, 4, []], ['cici', 'not_assessed', 0, 0, 4, []]]);
    expect((await get('/development/employees', 'hr')).body.data).toHaveLength(3); // default = jabatan berkamus pertama
    expect((await get(`/development/employees?jobRoleId=${otherRole.id}`, 'hr')).status).toBe(400);

    const plan = await get(`/employees/${u.ani}/development-plan`, 'spv');
    expect(plan.status).toBe(200);
    expect(plan.body.data).toMatchObject({ person: { id: u.ani, name: 'ani', jobRoleId: role.id, jobRoleName: 'Engineer Service Delivery' }, stage: 'basic', met: 1, assessed: 3, total: 4, untiered: 1, focus: ['ST-B4'] });
    expect(plan.body.data.advice).toMatch(/^Fokus pada modul Basic yang belum tercapai: ST-B4\./);
    const mods = Object.fromEntries(plan.body.data.tiers.flatMap((t) => t.modules).map((m) => [m.code, m]));
    expect(mods['ST-B1']).toMatchObject({ status: 'met', score: 3, target: 3, mastery: 'mastered' });
    expect(mods['ST-B4']).toMatchObject({ status: 'develop', mastery: 'partial' });
    expect(mods['TC-I1']).toMatchObject({ status: 'locked', mastery: 'not_yet' }); // modul jenjang Senior tetap masuk roadmap
    expect(mods['ST-A2']).toMatchObject({ status: 'not_assessed', score: null, target: 4, mastery: null });
  });

  it('visibilitas: atasan hanya timnya, karyawan hanya rencananya sendiri, tenant lain 404', async () => {
    const team = await get(`/development/employees?jobRoleId=${role.id}`, 'spv');
    expect(team.body.data.map((p) => p.name)).toEqual(['ani', 'budi']);
    expect((await get(`/development/employees?jobRoleId=${role.id}`, 'spv2')).body.data).toEqual([]);
    expect((await get('/development/employees', 'ani')).status).toBe(403);
    expect((await get(`/employees/${u.cici}/development-plan`, 'spv')).status).toBe(404);
    expect((await get(`/employees/${u.budi}/development-plan`, 'ani')).status).toBe(404);
    expect((await get(`/employees/${u.ani}/development-plan`, 'ani')).status).toBe(200);
    expect((await get(`/employees/${u.ani}/development-plan`, 'luar')).status).toBe(404);
    expect((await get('/employees/bukan-uuid/development-plan', 'hr')).status).toBe(404);
    // pegawai tanpa jabatan: rencana kosong, bukan galat
    const noRole = await get(`/employees/${u.spv}/development-plan`, 'spv');
    expect(noRole.body.data).toMatchObject({ stage: 'not_assessed', total: 0 });
  });

  it('ringkasan: jabatan dan status kamus, KPI, distribusi tahap dalam scope pemanggil', async () => {
    const hr = await get('/development/overview', 'hr');
    expect(hr.status).toBe(200);
    expect(hr.body.data.jobs.map((j) => [j.name, j.dictionary, j.competencyCount])).toEqual([['Engineer Service Delivery', 'available', 5], ['Solution Architect', 'none', 0]]);
    expect(hr.body.data.selectedJobRoleId).toBe(role.id);
    expect(hr.body.data.kpi).toEqual({ employees: 3, jobFunctions: 2, competencies: 5, jobsWithDictionary: 1, jobsTotal: 2 });
    expect(hr.body.data.stageDistribution).toEqual([
      { stage: 'basic', count: 1, percent: 33 }, { stage: 'intermediate', count: 0, percent: 0 }, { stage: 'advanced', count: 0, percent: 0 },
      { stage: 'done', count: 1, percent: 33 }, { stage: 'not_assessed', count: 1, percent: 33 }]);
    expect(hr.body.data.dictionary).toMatchObject({ tool1: true, tool3: true, approved: true, assessedCompetencyCount: 4 });

    const spv = await get(`/development/overview?jobRoleId=${role.id}`, 'spv');
    expect(spv.body.data.kpi.employees).toBe(2);
    expect(spv.body.data.stageDistribution.find((s) => s.stage === 'not_assessed').count).toBe(0);

    const empty = await get(`/development/overview?jobRoleId=${emptyRole.id}`, 'hr');
    expect(empty.body.data.kpi).toMatchObject({ employees: 0, jobFunctions: 0, competencies: 0 });
    expect(empty.body.data.dictionary).toMatchObject({ status: 'none', approved: false });
    expect((await get(`/development/overview?jobRoleId=${otherRole.id}`, 'hr')).status).toBe(400);
    expect((await get('/development/overview', 'ani')).status).toBe(403);
    const luar = await get('/development/overview', 'luar');
    expect(luar.body.data.jobs.map((j) => j.name)).toEqual(['Jabatan tenant lain']);
  });

  it('audit baca: daftar dan rencana selalu dicatat; ringkasan dicatat hanya untuk atasan', async () => {
    const needs = await audits('dna.development_needs');
    expect(needs.length).toBeGreaterThanOrEqual(3);
    expect(needs[0].meta).toMatchObject({ objectType: 'dna_development' });
    expect(needs[0].meta.employeeIds.sort()).toEqual([u.ani, u.budi, u.cici].sort());
    const plans = await audits('dna.development_plan');
    expect(plans.some((r) => r.user_id === u.ani && r.meta.self === true)).toBe(true);
    expect(plans.some((r) => r.user_id === u.spv && r.meta.employeeIds[0] === u.ani)).toBe(true);
    const overview = await audits('dna.development_overview');
    expect(overview.length).toBe(1);
    expect(overview[0].user_id).toBe(u.spv);
  });

  it('mengubah kompetensi mereset pengesahan kamus', async () => {
    await request(app).patch(`/api/dna/competencies/${c['ST-B1'].id}`).set(as('hr')).send({ requiredScore: 2 }).expect(200);
    const d = (await get(`/job-roles/${role.id}/dictionary`, 'hr')).body.data.dictionary;
    expect(d).toMatchObject({ approvedCount: 4, approved: false });
  });

  it('flag module.dna mati menutup semua endpoint baru', async () => {
    await db.query(`UPDATE feature_flags SET enabled = false WHERE tenant_id = :t AND key = 'module.dna'`, { replacements: { t: tenant.id } });
    for (const path of ['/development/overview', `/job-roles/${role.id}/dictionary`, `/job-roles/${role.id}/curriculum`, '/development/employees', `/employees/${u.ani}/development-plan`]) {
      const res = await get(path, 'hr');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FEATURE_DISABLED');
    }
  });
});
