// B16 Career & Promotion dari ujung ke ujung di Postgres (spek: docs/designs/b16-career-promotion.md).
// Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan (CI menyiapkannya).
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { makeConfig } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('B16 Career & Promotion (Postgres)', () => {
  let db; let app; let tokens; let tenant; let otherTenant; const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const get = (path, who) => request(app).get(`/api/dna/career${path}`).set(as(who));
  const post = (path, who, body) => request(app).post(`/api/dna/career${path}`).set(as(who)).send(body);
  const dna = (path, who, body) => request(app).post(`/api/dna${path}`).set(as(who)).send(body);
  const q = (sql, replacements = {}) => db.query(sql, { replacements }).then(([rows]) => rows);
  const okr = (who, actual, { period = '2026-11', name = 'Resolusi tiket', type = 'okr' } = {}) => q(
    `INSERT INTO lna_performance_records (tenant_id, user_id, metric_type, name, target, actual, is_met, period, direction)
     VALUES (:t, :u, :type, :name, 100, :actual, :met, :period, 'higher')`, { t: tenant.id, u: u[who], type, name, actual, met: actual >= 100, period });
  const pass = (who, ...tiers) => Promise.all(tiers.map((programTier) => dna('/program-completions', 'hr', { userId: u[who], programTier, status: 'passed' }).expect(201)));
  const place = (who, level) => q('UPDATE users SET job_role_id = :r, career_level_id = :l WHERE id = :u', { r: role.id, l: level, u: u[who] });
  const rowOf = (res, who) => res.body.data.find((d) => d.employee.id === u[who]);
  let role; let L;

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    app = createApp({ config, stores: createStores(db) });
    tokens = createTokenService(config.jwt);
    const slug = `b16-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'ELGOS B16') RETURNING id`, { replacements: { slug } });
    [[otherTenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Lain') RETURNING id`, { replacements: { slug: `${slug}-x` } });
    const add = async (key, role, t = tenant.id) => {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, :email, :name, :emp, :role, 'active') RETURNING id`,
        { replacements: { t, email: `${key}@b16.test`, name: key, emp: `E-${key}`, role } },
      );
      u[key] = row.id;
      tok[key] = tokens.sign({ id: row.id, tenantId: t, role, email: `${key}@b16.test` });
    };
    for (const [k, r] of [['hr', 'hr_admin'], ['hr2', 'hr_admin'], ['eta', 'eta_admin'], ['spv', 'supervisor'], ['spv2', 'supervisor'], ['lead', 'role_leader'],
      ['ani', 'learner'], ['budi', 'learner'], ['cici', 'learner'], ['dedi', 'learner'], ['eko', 'learner'], ['fani', 'learner'], ['gita', 'learner'], ['hadi', 'learner'], ['ika', 'learner']]) await add(k, r);
    await add('luar', 'hr_admin', otherTenant.id);
    await q('UPDATE users SET supervisor_id = :spv WHERE id IN (:ids)', { spv: u.spv, ids: [u.ani, u.budi, u.cici, u.eko, u.gita, u.hadi] });
    await q('UPDATE users SET supervisor_id = :spv WHERE id = :id', { spv: u.spv2, id: u.dedi });
    await q('UPDATE users SET supervisor_id = :spv WHERE id = :id', { spv: u.lead, id: u.fani });
    await q(`UPDATE users SET status = 'disabled' WHERE id = :id`, { id: u.hadi });
    for (const t of [tenant.id, otherTenant.id]) {
      await q(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'dna')`, { t });
      await q(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'module.dna', true)`, { t });
    }
    role = (await dna('/job-roles', 'hr', { name: 'Engineer Service Delivery', division: 'IT Service Delivery',
      levels: [{ name: 'Junior', programTier: 'basic' }, { name: 'Senior', programTier: 'intermediate' }, { name: 'Team Leader' }] })).body.data;
    L = { junior: role.levels[0].id, senior: role.levels[1].id, lead: role.levels[2].id };
    await dna('/competencies/bulk', 'hr', { items: [
      { kind: 'job', jobRoleId: role.id, name: 'Fondasi layanan', code: 'ST-B1', programTier: 'basic' },
      { kind: 'job', jobRoleId: role.id, name: 'Automation', code: 'TC-I1', programTier: 'intermediate' },
      { kind: 'job', jobRoleId: role.id, name: 'Observability', code: 'TC-I2', programTier: 'intermediate' },
    ] }).expect(201);
    // ani: memenuhi syarat; budi: program lulus, OKR rendah; cici: masih menuju; dedi: memenuhi (atasan spv2);
    // eko: Senior, jenjang berikutnya tanpa syarat program; fani: memenuhi tetapi atasannya bukan peran supervisor; gita: tanpa jabatan
    for (const who of ['ani', 'budi', 'cici', 'dedi', 'fani', 'hadi', 'spv', 'ika']) await place(who, L.junior);
    await place('eko', L.senior);
    await pass('ani', 'basic', 'intermediate'); await pass('budi', 'basic', 'intermediate'); await pass('cici', 'basic');
    await pass('dedi', 'basic', 'intermediate'); await pass('eko', 'basic', 'intermediate'); await pass('fani', 'basic', 'intermediate');
    await pass('spv', 'basic', 'intermediate');
    await okr('ani', 40, { period: '2026-10' }); await okr('ani', 90); await okr('ani', 100, { name: 'CSAT' }); await okr('ani', 10, { type: 'kpi', name: 'KPI lain' });
    await okr('budi', 70); await okr('cici', 95); await okr('dedi', 85); await okr('fani', 90); await okr('spv', 95);
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, otherTenant.id] }, transaction });
    });
    await db.close();
  });

  it('flag promotion.recommendation mati menutup semua endpoint', async () => {
    for (const p of ['/map', '/paths', '/decisions', `/employees/${u.ani}/evidence`]) {
      const res = await get(p, 'hr');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FEATURE_DISABLED');
    }
    expect((await post(`/decisions/${u.ani}/supervisor`, 'spv', { decision: 'recommend' })).body.error.code).toBe('FEATURE_DISABLED');
    await q(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'promotion.recommendation', true)`, { t: tenant.id });
    await q(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'promotion.recommendation', true)`, { t: otherTenant.id });
  });

  it('peta: KPI, status tiap karyawan, filter divisi; karyawan nonaktif dan HR tidak ikut', async () => {
    const res = await get('/map', 'hr');
    expect(res.status).toBe(200);
    const { kpi, employees, divisions, okrMin } = res.body.data;
    expect(okrMin).toBe(80);
    expect(divisions).toEqual(['IT Service Delivery']);
    const by = Object.fromEntries(employees.map((e) => [e.name, e]));
    expect(Object.keys(by).sort()).toEqual(['ani', 'budi', 'cici', 'dedi', 'eko', 'fani', 'gita', 'ika', 'lead', 'spv', 'spv2']);
    expect(by.ika.status).toBe('below_current');
    expect(by.ani).toMatchObject({ status: 'eligible', division: 'IT Service Delivery', jobRoleName: 'Engineer Service Delivery', level: { id: L.junior, name: 'Junior' },
      nextLevel: { id: L.senior, name: 'Senior', requiredProgramTier: 'intermediate' }, okr: { achievement: 95, period: '2026-11', count: 2 }, decisionState: 'none' });
    expect(by.ani.programs).toEqual([{ tier: 'basic', passed: true }, { tier: 'intermediate', passed: true }, { tier: 'advanced', passed: false }]);
    expect(by.budi.status).toBe('program_passed_okr_low');
    expect(by.cici.status).toBe('on_track');
    expect(by.eko.status).toBe('next_no_requirement');
    expect(by.gita).toMatchObject({ status: 'no_path', level: null, nextLevel: null, programs: [], okr: null, division: null });
    expect(kpi).toEqual({ employees: 11, divisions: 1, eligible: 4, awaitingDecision: 4, belowCurrent: 1 });
    const filtered = (await get('/map?division=IT%20Service%20Delivery', 'hr')).body.data;
    expect(filtered.employees.map((e) => e.name)).not.toContain('gita');
    expect(filtered.kpi.employees).toBe(11);
    expect((await get('/map?division=Tidak%20ada', 'hr')).body.data.employees).toEqual([]);
  });

  it('visibilitas: atasan hanya bawahan langsung dan tidak melihat dirinya; karyawan 403; tenant lain kosong', async () => {
    const spv = (await get('/map', 'spv')).body.data;
    expect(spv.employees.map((e) => e.name).sort()).toEqual(['ani', 'budi', 'cici', 'eko', 'gita']);
    expect(spv.kpi.employees).toBe(5);
    for (const p of ['/map', '/paths', '/decisions', `/employees/${u.ani}/evidence`]) expect((await get(p, 'ani')).status).toBe(403);
    expect((await get('/map', 'lead')).status).toBe(403);
    expect((await get('/map', 'luar')).body.data.employees).toEqual([]);
    expect((await get(`/employees/${u.ani}/evidence`, 'luar')).status).toBe(404);
    expect((await get(`/employees/${u.dedi}/evidence`, 'spv')).status).toBe(404);
    expect((await get(`/employees/${u.spv}/evidence`, 'spv')).status).toBe(404);
    expect((await get(`/employees/${u.hadi}/evidence`, 'hr')).status).toBe(404);
    expect((await get(`/employees/${u.hr2}/evidence`, 'hr')).status).toBe(404); // HR bukan subjek promosi
    expect((await get('/employees/bukan-uuid/evidence', 'hr')).status).toBe(404);
    expect((await get('/map', 'eta')).status).toBe(200);
  });

  it('promotionVisibleTo tanpa supervisor menutup modul untuk atasan', async () => {
    await q(`UPDATE tenants SET settings = '{"dna":{"promotionVisibleTo":["hr_admin"]}}'::jsonb WHERE id = :t`, { t: tenant.id });
    const res = await get('/map', 'spv');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    expect((await get('/map', 'hr')).status).toBe(200);
    await q(`UPDATE tenants SET settings = '{}'::jsonb WHERE id = :t`, { t: tenant.id });
    expect((await get('/map', 'spv')).status).toBe(200);
  });

  it('konfigurasi promosi yang rusak memakai default, bukan meloloskan semua atau 500', async () => {
    await q(`UPDATE tenants SET settings = '{"dna":{"promotionVisibleTo":"hr_admin","promotion":{"okrMin":null,"metricTypes":null}}}'::jsonb WHERE id = :t`, { t: tenant.id });
    const res = await get('/map', 'hr');
    expect(res.status).toBe(200);
    expect(res.body.data.okrMin).toBe(80);
    expect(res.body.data.employees.find((e) => e.name === 'budi').status).toBe('program_passed_okr_low');
    await q(`UPDATE tenants SET settings = '{"dna":{"promotion":{"okrMin":"abc"}}}'::jsonb WHERE id = :t`, { t: tenant.id });
    expect((await get('/map', 'hr')).body.data.okrMin).toBe(80);
    await q(`UPDATE tenants SET settings = '{"dna":{"promotion":{"okrMin":60}}}'::jsonb WHERE id = :t`, { t: tenant.id });
    expect((await get('/map', 'hr')).body.data.employees.find((e) => e.name === 'budi').status).toBe('eligible');
    await q(`UPDATE tenants SET settings = '{}'::jsonb WHERE id = :t`, { t: tenant.id });
  });

  it('bukti satu karyawan', async () => {
    const res = await get(`/employees/${u.ani}/evidence`, 'spv');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      person: { id: u.ani, name: 'ani', division: 'IT Service Delivery', jobRoleName: 'Engineer Service Delivery', level: { id: L.junior, name: 'Junior' } },
      status: 'eligible', nextLevel: { id: L.senior, name: 'Senior' }, okr: { achievement: 95, min: 80, met: true, period: '2026-11', count: 2 },
      reinterview: null, supervisorRecommendation: null,
    });
    expect(res.body.data.programsPassed.sort()).toEqual(['basic', 'intermediate']);
    expect((await get(`/employees/${u.gita}/evidence`, 'hr')).body.data).toMatchObject({ status: 'no_path', okr: null, programsPassed: [] });
  });

  it('jalur jenjang: modul per tingkat, jumlah karyawan, dan yang siap naik dalam scope', async () => {
    const res = await get('/paths', 'hr');
    expect(res.body.data.jobRole).toEqual({ id: role.id, name: 'Engineer Service Delivery' });
    expect(res.body.data.levels).toEqual([
      { id: L.junior, order: 0, name: 'Junior', requiredProgramTier: 'basic', moduleCount: 1, employees: 7, readyForNext: 4 },
      { id: L.senior, order: 1, name: 'Senior', requiredProgramTier: 'intermediate', moduleCount: 2, employees: 1, readyForNext: 0 },
      { id: L.lead, order: 2, name: 'Team Leader', requiredProgramTier: null, moduleCount: 0, employees: 0, readyForNext: 0 },
    ]);
    expect((await get('/paths', 'spv')).body.data.levels[0]).toMatchObject({ employees: 3, readyForNext: 1 });
    expect((await get(`/paths?jobRoleId=${role.id}`, 'hr')).status).toBe(200);
    expect((await get('/paths?jobRoleId=bukan-uuid', 'hr')).status).toBe(400);
    expect((await get('/paths', 'luar')).body.data).toEqual({ jobRole: null, okrMin: 80, levels: [] });
  });

  it('daftar keputusan: kandidat, syarat, dan tindakan per peran', async () => {
    const hr = await get('/decisions', 'hr');
    expect(hr.body.data.map((d) => d.employee.name).sort()).toEqual(['ani', 'budi', 'dedi', 'fani', 'spv']);
    expect(rowOf(hr, 'ani')).toMatchObject({ fromLevel: { id: L.junior, name: 'Junior' }, toLevel: { id: L.senior, name: 'Senior' }, eligible: true,
      requirement: { programPassed: true, okr: { achievement: 95, min: 80, met: true } }, supervisor: null, hr: null, actions: [], blockedReason: 'waiting_supervisor' });
    expect(rowOf(hr, 'budi')).toMatchObject({ eligible: false, actions: [], blockedReason: 'not_eligible' });
    expect(rowOf(hr, 'fani')).toMatchObject({ eligible: true, actions: [], blockedReason: 'no_supervisor' });
    expect(rowOf(hr, 'spv').blockedReason).toBe('no_supervisor');
    const spv = await get('/decisions', 'spv');
    expect(spv.body.data.map((d) => d.employee.name).sort()).toEqual(['ani', 'budi']);
    expect(rowOf(spv, 'ani').actions).toEqual(['recommend', 'hold']);
    expect(rowOf(await get('/decisions', 'eta'), 'ani').blockedReason).toBe('view_only');
  });

  it('tahap atasan: hanya atasan langsung berperan supervisor, hanya untuk yang memenuhi syarat', async () => {
    const path = `/decisions/${u.ani}/supervisor`;
    for (const who of ['hr', 'eta']) {
      const res = await post(path, who, { decision: 'recommend' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    }
    expect((await post(path, 'ani', { decision: 'recommend' })).status).toBe(403);
    expect((await post(path, 'spv2', { decision: 'recommend' })).status).toBe(404);
    expect((await post(`/decisions/${u.spv}/supervisor`, 'spv', { decision: 'recommend' })).status).toBe(404);
    expect((await post(`/decisions/${u.hadi}/supervisor`, 'spv', { decision: 'recommend' })).status).toBe(404);
    expect((await post(path, 'spv', { decision: 'setuju' })).status).toBe(400);
    expect((await post(path, 'spv', { decision: 'hold', note: 'x'.repeat(2001) })).status).toBe(400);
    expect((await post(path, 'spv', { decision: 'hold', note: { a: 1 } })).status).toBe(400);
    const low = await post(`/decisions/${u.budi}/supervisor`, 'spv', { decision: 'recommend' });
    expect(low.status).toBe(409);
    expect(low.body.error.code).toBe('NOT_ELIGIBLE');
    // HR sebelum atasan
    const early = await post(`/decisions/${u.ani}/hr`, 'hr', { decision: 'approve' });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('WAITING_SUPERVISOR');
  });

  it('tanpa atasan sah: HR tidak bisa memutuskan; token atasan yang perannya sudah dicabut ditolak', async () => {
    const res = await post(`/decisions/${u.fani}/hr`, 'hr', { decision: 'hold' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WAITING_SUPERVISOR');
    await q(`UPDATE users SET role = 'role_leader' WHERE id = :id`, { id: u.spv2 });
    const stale = await post(`/decisions/${u.dedi}/supervisor`, 'spv2', { decision: 'recommend' });
    expect(stale.status).toBe(403);
    expect(stale.body.error.code).toBe('ROLE_FORBIDDEN');
    await q(`UPDATE users SET role = 'supervisor' WHERE id = :id`, { id: u.spv2 });
  });

  it('atasan menunda lalu mengganti menjadi rekomendasi: satu baris, catatan terenkripsi, audit bermeta nama', async () => {
    const hold = await post(`/decisions/${u.ani}/supervisor`, 'spv', { decision: 'hold', note: 'Tunggu evaluasi kuartal' });
    expect(hold.status).toBe(200);
    expect(hold.body.data).toMatchObject({ supervisor: { decision: 'hold', byName: 'spv', note: 'Tunggu evaluasi kuartal' }, hr: null });
    // atasan menunda: HR tidak bisa menyetujui, tetapi boleh menunda (diuji pada dedi di bawah)
    const no = await post(`/decisions/${u.ani}/hr`, 'hr', { decision: 'approve' });
    expect(no.status).toBe(409);
    expect(no.body.error.code).toBe('SUPERVISOR_NOT_RECOMMEND');
    expect(rowOf(await get('/decisions', 'hr'), 'ani').actions).toEqual(['hold']);

    const [a, b] = await Promise.all([1, 2].map(() => post(`/decisions/${u.ani}/supervisor`, 'spv', { decision: 'recommend', note: 'Siap naik' })));
    expect([a.status, b.status]).toEqual([200, 200]);
    const rows = await q('SELECT supervisor_decision, supervisor_note, okr_achievement::float AS okr FROM lna_promotion_decisions WHERE tenant_id = :t AND user_id = :u', { t: tenant.id, u: u.ani });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ supervisor_decision: 'recommend', okr: 95 });
    expect(rows[0].supervisor_note).not.toContain('Siap naik');
    const list = await get('/decisions', 'hr');
    expect(rowOf(list, 'ani')).toMatchObject({ supervisor: { decision: 'recommend', byName: 'spv', note: 'Siap naik' }, actions: ['approve', 'hold'], blockedReason: null });
    expect(rowOf(await get('/decisions', 'spv'), 'ani').supervisor.note).toBe('Siap naik');
    expect(rowOf(await get('/decisions', 'eta'), 'ani').supervisor).toMatchObject({ decision: 'recommend', note: null });
    expect((await get('/map', 'hr')).body.data.employees.find((e) => e.name === 'ani').decisionState).toBe('supervisor_recommend');
    expect((await get(`/employees/${u.ani}/evidence`, 'hr')).body.data.supervisorRecommendation).toMatchObject({ decision: 'recommend', byName: 'spv' });
    const audits = await q(`SELECT user_id, action, meta FROM audit_logs WHERE tenant_id = :t AND resource = 'dna.promotion_decision' ORDER BY id`, { t: tenant.id });
    expect(audits).toHaveLength(3);
    expect(audits[2]).toMatchObject({ user_id: u.spv, action: 'update', meta: { event: 'supervisor_decision', decision: 'recommend', employeeId: u.ani, fromLevelId: L.junior, toLevelId: L.senior, decidedByName: 'spv', role: 'supervisor' } });
    expect(audits[2].meta.decisionId).toBeTruthy();
    expect(JSON.stringify(audits[2].meta)).not.toContain('Siap naik');
  });

  it('tahap HR: hanya hr_admin; menyetujui tidak mengubah jenjang; setelah disetujui tidak ada tindakan lagi', async () => {
    for (const who of ['spv', 'eta']) {
      const res = await post(`/decisions/${u.ani}/hr`, who, { decision: 'approve' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    }
    expect((await post(`/decisions/${u.ani}/hr`, 'luar', { decision: 'approve' })).status).toBe(404);
    expect((await post(`/decisions/${u.ani}/hr`, 'hr', { decision: 'tolak' })).status).toBe(400);
    const [a, b] = await Promise.all([post(`/decisions/${u.ani}/hr`, 'hr', { decision: 'approve', note: 'SK menyusul' }), post(`/decisions/${u.ani}/hr`, 'hr2', { decision: 'approve' })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((a.status === 409 ? a : b).body.error.code).toBe('ALREADY_DECIDED');
    const row = rowOf(await get('/decisions', 'hr'), 'ani');
    // pemenang balapan tidak tentu: catatan mengikuti permintaan yang 200
    const winnerNote = a.status === 200 ? 'SK menyusul' : null;
    expect(row).toMatchObject({ hr: { decision: 'approved', note: winnerNote }, actions: [], blockedReason: 'approved' });
    const [{ hr_note: hrNote }] = await q(`SELECT hr_note FROM lna_promotion_decisions WHERE user_id = :u AND hr_decision = 'approved'`, { u: u.ani });
    if (winnerNote) expect(hrNote).not.toContain('SK menyusul');
    // balapan atasan setelah approved: siklus terbuka baru yang tersisip tetap tidak bisa diputuskan HR
    await q(`INSERT INTO lna_promotion_decisions (tenant_id, user_id, from_level_id, to_level_id, supervisor_decision, supervisor_by, supervisor_at)
             VALUES (:t, :u, :f, :to, 'recommend', :s, now())`, { t: tenant.id, u: u.ani, f: L.junior, to: L.senior, s: u.spv });
    const second = await post(`/decisions/${u.ani}/hr`, 'hr', { decision: 'approve' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALREADY_DECIDED');
    await q(`DELETE FROM lna_promotion_decisions WHERE user_id = :u AND hr_decision IS NULL`, { u: u.ani });
    const [{ career_level_id: level }] = await q('SELECT career_level_id FROM users WHERE id = :u', { u: u.ani });
    expect(level).toBe(L.junior);
    const again = await post(`/decisions/${u.ani}/supervisor`, 'spv', { decision: 'hold' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_DECIDED');
    expect((await post(`/decisions/${u.ani}/hr`, 'hr', { decision: 'hold' })).body.error.code).toBe('ALREADY_DECIDED');
    const audits = await q(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'dna.promotion_decision' AND meta->>'event' = 'hr_decision'`, { t: tenant.id });
    expect(audits).toHaveLength(1);
    expect(audits[0].meta).toMatchObject({ decision: 'approved', employeeId: u.ani, role: 'hr_admin' });
    const kpi = (await get('/map', 'hr')).body.data.kpi;
    expect(kpi).toMatchObject({ eligible: 4, awaitingDecision: 3 });
  });

  it('HR menunda menutup siklus; atasan boleh mengajukan lagi sebagai siklus baru', async () => {
    await post(`/decisions/${u.dedi}/supervisor`, 'spv2', { decision: 'hold' }).expect(200);
    const held = await post(`/decisions/${u.dedi}/hr`, 'hr', { decision: 'hold', note: 'Formasi belum ada' });
    expect(held.status).toBe(200);
    expect(held.body.data).toMatchObject({ hr: { decision: 'hold', byName: 'hr', note: 'Formasi belum ada' }, blockedReason: 'held' });
    expect(rowOf(await get('/decisions', 'spv2'), 'dedi').actions).toEqual(['recommend', 'hold']);
    await post(`/decisions/${u.dedi}/supervisor`, 'spv2', { decision: 'recommend' }).expect(200);
    const rows = await q('SELECT hr_decision FROM lna_promotion_decisions WHERE tenant_id = :t AND user_id = :u ORDER BY created_at', { t: tenant.id, u: u.dedi });
    expect(rows.map((r) => r.hr_decision)).toEqual(['hold', null]);
    expect(rowOf(await get('/decisions', 'hr'), 'dedi')).toMatchObject({ supervisor: { decision: 'recommend' }, hr: null, actions: ['approve', 'hold'] });
  });

  it('OKR turun setelah rekomendasi: HR tidak bisa menyetujui; posisi berubah membuat siklus lama tidak berlaku', async () => {
    await okr('dedi', 10, { period: '2026-12' });
    const res = await post(`/decisions/${u.dedi}/hr`, 'hr', { decision: 'approve' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_ELIGIBLE');
    // atasan tetap bisa menarik rekomendasinya (tunda), tetapi tidak bisa merekomendasi
    expect((await post(`/decisions/${u.dedi}/supervisor`, 'spv2', { decision: 'recommend' })).body.error.code).toBe('NOT_ELIGIBLE');
    expect((await post(`/decisions/${u.dedi}/supervisor`, 'spv2', { decision: 'hold' })).status).toBe(200);
    await q(`DELETE FROM lna_performance_records WHERE user_id = :u AND period = '2026-12'`, { u: u.dedi });
    await post(`/decisions/${u.dedi}/supervisor`, 'spv2', { decision: 'recommend' }).expect(200);
    // pemisahan tugas: yang merekomendasi tidak boleh menyetujui (mis. peran diubah menjadi HR)
    await q(`UPDATE users SET role = 'hr_admin' WHERE id = :id`, { id: u.spv2 });
    tok.spv2hr = tokens.sign({ id: u.spv2, tenantId: tenant.id, role: 'hr_admin', email: 'spv2@b16.test' });
    const self = await post(`/decisions/${u.dedi}/hr`, 'spv2hr', { decision: 'approve' });
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('ROLE_FORBIDDEN');
    await q(`UPDATE users SET role = 'supervisor' WHERE id = :id`, { id: u.spv2 });
    const [openRow] = await q('SELECT id FROM lna_promotion_decisions WHERE user_id = :u AND hr_decision IS NULL', { u: u.dedi });
    await place('dedi', L.senior);
    // balapan: rute sudah membaca siklus sebelum posisi berubah; store menolak di bawah kunci karena jenjang asal tidak cocok lagi (C9)
    expect(await createStores(db).promotion.hrDecide(tenant.id, { id: openRow.id, decision: 'approved', by: u.hr }, { event: 'hr_decision' })).toBe(false);
    const stale = await post(`/decisions/${u.dedi}/hr`, 'hr', { decision: 'hold' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('WAITING_SUPERVISOR');
    expect((await get('/map', 'hr')).body.data.employees.find((e) => e.name === 'dedi')).toMatchObject({ status: 'next_no_requirement', decisionState: 'none' });
  });

  it('endpoint lama (kandidat program saja) tetap hanya untuk HR; atasan memakai /cp (C14)', async () => {
    const res = await request(app).get('/api/dna/promotion-candidates').set(as('spv'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    const list = (await request(app).get('/api/dna/employees').set(as('spv'))).body.data;
    expect(list.find((p) => p.name === 'ani').career.promotionCandidate).toBeUndefined();
    const hr = await request(app).get('/api/dna/promotion-candidates').set(as('hr'));
    expect(hr.status).toBe(200);
    expect(hr.body.data.map((p) => p.name)).toEqual(expect.arrayContaining(['ani', 'budi']));
  });

  it('endpoint lama tidak 500 bila promotionVisibleTo rusak (string, null, objek)', async () => {
    for (const bad of ['"hr_admin,supervisor"', 'null', '{"a":1}']) {
      await q(`UPDATE tenants SET settings = jsonb_build_object('dna', jsonb_build_object('promotionVisibleTo', CAST(:bad AS jsonb))) WHERE id = :t`, { t: tenant.id, bad });
      expect((await request(app).get('/api/dna/employees').set(as('hr'))).status).toBe(200);
      expect((await request(app).get('/api/dna/promotion-candidates').set(as('spv'))).status).toBe(403);
    }
    await q(`UPDATE tenants SET settings = '{}'::jsonb WHERE id = :t`, { t: tenant.id });
  });

  it('audit baca: peta, bukti, dan daftar keputusan dicatat', async () => {
    const reads = await q(`SELECT DISTINCT resource FROM audit_logs WHERE tenant_id = :t AND action = 'read' AND resource LIKE 'dna.%' ORDER BY resource`, { t: tenant.id });
    expect(reads.map((r) => r.resource)).toEqual(expect.arrayContaining(['dna.career_evidence', 'dna.career_map', 'dna.promotion_decisions']));
  });
});
