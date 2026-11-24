// B10 Core Competencies dari ujung ke ujung di Postgres: persyaratan, program nilai (impor + isian agregat),
// penugasan wawancara berjenjang, dan isolasi tenant. Jalan hanya bila DATABASE_URL di-set.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('B10 Core Competencies (Postgres)', () => {
  let db; let app; let stores; let tenant; let other; const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const get = (path, who = 'hr') => request(app).get(`/api/cca${path}`).set(as(who));
  const send = (method, path, body, who = 'hr') => request(app)[method](`/api/cca${path}`).set(as(who)).send(body);
  const flag = (t, key, enabled = true) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled)
     ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t, key, enabled } });
  const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    app = createApp({ config, stores });
    const tokens = sessionSigner(config, stores.authSessions);
    const slug = `cca-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'CCA uji') RETURNING id`, { replacements: { slug } });
    [[other]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Lain') RETURNING id`, { replacements: { slug: `${slug}-x` } });
    const [[jr]] = await db.query(`INSERT INTO lna_job_roles (tenant_id, name, division) VALUES (:t, 'Engineer', 'Ops') RETURNING id`, { replacements: { t: tenant.id } });
    const add = async (key, role, { t = tenant.id, sup = null, jobRole = null } = {}) => {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status, supervisor_id, job_role_id)
         VALUES (:t, :email, :name, :emp, :role, 'active', :sup, :jobRole) RETURNING id`,
        { replacements: { t, email: `${key}@cca.test`, name: key, emp: `E-${key}`, role, sup, jobRole } });
      u[key] = row.id;
      tok[key] = await tokens.sign({ id: row.id, tenantId: t, role, email: `${key}@cca.test` });
    };
    await add('hr', 'hr_admin');
    await add('eta', 'eta_admin');
    await add('spv', 'supervisor', { jobRole: jr.id });
    await add('dir', 'pimpinan');
    await add('spv2', 'supervisor');
    await add('a', 'learner', { sup: u.spv, jobRole: jr.id });
    await add('b', 'learner', { sup: u.spv, jobRole: jr.id });
    await add('c', 'learner', { sup: u.dir });
    await add('d', 'learner', { sup: u.spv2 });
    await add('luar', 'hr_admin', { t: other.id });
    await add('luarspv', 'supervisor', { t: other.id });
    for (const t of [tenant.id, other.id]) {
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'cca')`, { replacements: { t } });
      await flag(t, 'module.cca');
    }
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.close();
  });

  describe('persyaratan kompetensi dan kesiapan', () => {
    let vision; let v1; let v4;

    it('hanya HR yang mengelola sumber dan persyaratan', async () => {
      expect((await send('post', '/sources', { kind: 'vision', title: 'x' }, 'spv')).status).toBe(403);
      expect((await get('/overview', 'a')).status).toBe(403);
      expect((await send('post', '/sources', { kind: 'slogan', title: 'x' })).status).toBe(400);
      expect((await send('post', '/sources', { kind: 'vision' })).body.error.message).toMatch(/Judul wajib/);
    });

    it('HR membuat sumber visi + persyaratan, lalu overview menghitung kesiapan dan gap', async () => {
      const s = await send('post', '/sources', { kind: 'vision', title: 'Corporate Vision', text: 'Menjadi pemimpin.', sourceRef: 'https://contoh.test/about' });
      expect(s.status).toBe(201);
      vision = s.body.data;
      v1 = (await send('post', `/sources/${vision.id}/requirements`, { name: 'Arsitektur cloud', targetScore: 80, actualScore: 63 })).body.data;
      v4 = (await send('post', `/sources/${vision.id}/requirements`, { name: 'Otomasi', targetScore: 80 })).body.data;
      expect(v1).toMatchObject({ status: 'draft', origin: 'hr', actualSource: 'manual', targetScore: 80, actualScore: 63 });
      expect(v4).toMatchObject({ actualScore: null, actualSource: null });
      expect((await send('post', `/sources/${vision.id}/requirements`, { name: 'x', targetScore: 101 })).status).toBe(400);
      await send('post', '/sources', { kind: 'value', title: 'Credible' });

      const o = (await get('/overview?group=vm')).body.data;
      expect(o.groups).toHaveLength(1);
      expect(o.groups[0]).toMatchObject({ title: 'Corporate Vision', readiness: 79, sourceRef: 'https://contoh.test/about' });
      expect(o.groups[0].rows.map((r) => [r.name, r.gap, r.classification, r.status])).toEqual([
        ['Arsitektur cloud', 17, 'perlu_ditinjau', 'draft'], ['Otomasi', null, 'belum_diukur', 'draft'],
      ]);
      expect(o.kpis).toMatchObject({ readiness: 79, biggestGap: { name: 'Arsitektur cloud', gap: 17 }, belowTarget: { count: 1, measured: 1, total: 2 }, pendingValidation: 2 });
      expect((await get('/overview?group=values')).body.data.groups.map((g) => g.title)).toEqual(['Credible']);
      expect((await get('/overview?group=apa')).status).toBe(400);
    });

    it('validasi HR tercatat; mengubah isi persyaratan tervalidasi mengembalikannya ke draft; rejected hilang dari overview', async () => {
      const ok = (await send('patch', `/requirements/${v1.id}`, { status: 'validated' })).body.data;
      expect(ok).toMatchObject({ status: 'validated', validatedBy: u.hr });
      expect(ok.validatedAt).toBeTruthy();
      const same = (await send('patch', `/requirements/${v1.id}`, { actualScore: 70 })).body.data;
      expect(same).toMatchObject({ status: 'validated', actualScore: 70 });
      const back = (await send('patch', `/requirements/${v1.id}`, { targetScore: 85 })).body.data;
      expect(back).toMatchObject({ status: 'draft', validatedBy: null, validatedAt: null, targetScore: 85 });
      await send('patch', `/requirements/${v4.id}`, { status: 'rejected' });
      const o = (await get('/overview?group=vm')).body.data;
      expect(o.groups[0].rows.map((r) => r.name)).toEqual(['Arsitektur cloud']);
      // HR tetap melihat baris rejected di daftar kelola
      expect((await get('/sources')).body.data.find((s) => s.id === vision.id).requirements).toHaveLength(2);
    });

    it('sumber yang diarsipkan hilang dari overview tetapi tidak dihapus', async () => {
      const s = (await send('post', '/sources', { kind: 'mission', title: 'Misi lama' })).body.data;
      expect((await send('patch', `/sources/${s.id}`, { status: 'archived' })).body.data.status).toBe('archived');
      expect((await get('/overview?group=vm')).body.data.groups.map((g) => g.title)).toEqual(['Corporate Vision']);
      expect((await get('/sources?archived=1')).body.data.map((x) => x.title)).toContain('Misi lama');
      // visi selalu sebelum misi, apa pun urutan abjad kind-nya
      expect((await get('/sources?archived=1')).body.data.map((x) => x.kind)).toEqual(['vision', 'mission', 'value']);
      expect((await send('post', `/sources/${s.id}/requirements`, { name: 'x', targetScore: 50 })).status).toBe(404);
    });

    it('tenant lain tidak melihat dan tidak bisa mengubah', async () => {
      expect((await get('/overview?group=vm', 'luar')).body.data.groups).toEqual([]);
      expect((await send('patch', `/sources/${vision.id}`, { title: 'bajak' }, 'luar')).status).toBe(404);
      expect((await send('patch', `/requirements/${v1.id}`, { status: 'rejected' }, 'luar')).status).toBe(404);
      expect((await send('post', `/sources/${vision.id}/requirements`, { name: 'x', targetScore: 50 }, 'luar')).status).toBe(404);
      expect((await send('patch', '/sources/bukan-uuid', { title: 'x' })).status).toBe(404);
    });
  });

  describe('program nilai korporasi', () => {
    const config = {
      values: [{ name: 'Credible' }, { name: 'Competent' }],
      components: [{ name: 'Kuis', weight: 40 }, { name: 'Asesmen akhir', weight: 60 }],
      totalActivities: 2, passScore: 70,
      bands: [{ key: 'strong', label: 'Strong Culture Alignment', min: 85, description: 'Skor akhir 85 atau lebih' }, { key: 'baseline', label: 'Baseline', min: 70 }],
    };
    const upload = (csv, who = 'hr') => request(app).post('/api/cca/imports/cca_program_results?filename=laporan.csv')
      .set(as(who)).set('Content-Type', 'application/octet-stream').send(Buffer.from(csv));
    const HEAD = 'ID Karyawan,Divisi,Kegiatan Selesai,Skor Akhir,Skor Nilai 1,Skor Nilai 2,Skor Komponen 1,Skor Komponen 2';

    it('HR mengonfigurasi program; konfigurasi salah ditolak', async () => {
      expect((await send('put', '/programs/DNA 5C', { name: 'x', config })).status).toBe(400);
      expect((await send('put', '/programs/dna-5c', { name: 'x', config: { ...config, passScore: 200 } })).status).toBe(400);
      expect((await send('put', '/programs/dna-5c', { name: 'x', config }, 'spv')).status).toBe(403);
      const res = await send('put', '/programs/dna-5c', {
        name: "Elitery's DNA 5C", provider: 'Elite Academy', cutoffDate: '2026-10-09', config,
        insight: 'Skor akhir tertahan kuis.', recommendations: [{ title: 'Selesaikan kegiatan', detail: 'Dua karyawan masih berjalan.' }],
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ key: 'dna-5c', cutoffDate: '2026-10-09', manualReport: null });
      expect((await get('/programs/tidak-ada/report')).status).toBe(404);
    });

    it('isian agregat dipakai selama belum ada hasil per karyawan', async () => {
      const report = {
        registered: 10, completed: 6, passed: 4, avgValueScore: 93.4, avgFinal: 72.1,
        statuses: { strong: 1, baseline: 3, not_passed: 2, in_progress: 4 },
        values: [{ avgCompleted: 92.5, avgAll: 70 }, { avgCompleted: 92.8, avgAll: 69.7 }],
        components: [{ done: 9, avg: 50 }, { done: 6, avg: 90 }],
        divisions: [{ name: 'Ops', participants: 10, completed: 6, passed: 4, avgFinal: 72.1, avgValueScore: 93.4 }],
      };
      expect((await send('put', '/programs/dna-5c/manual-report', { report: { ...report, registered: 11 } })).status).toBe(400);
      const saved = await send('put', '/programs/dna-5c/manual-report', { report });
      expect(saved.body.data).toMatchObject({ saved: true, shadowedByImport: false });
      const rep = (await get('/programs/dna-5c/report')).body.data;
      expect(rep).toMatchObject({ source: 'manual', kpis: { registered: 10, completedPct: 60 }, insight: 'Skor akhir tertahan kuis.' });
      expect(rep.statuses[0]).toMatchObject({ key: 'strong', description: 'Skor akhir 85 atau lebih', count: 1, pct: 10 });
      // bentuk program tidak boleh berubah setelah ada isian
      expect((await send('put', '/programs/dna-5c', { name: 'x', config: { ...config, values: [{ name: 'Satu' }] } })).body.error.code).toBe('PROGRAM_HAS_RESULTS');
    });

    it('impor per karyawan: pemetaan kolom harus pas, baris salah ditolak, hasil mengganti isian agregat', async () => {
      const csv = [HEAD,
        'E-a,,2,90,90,100,80,100',
        'E-b,ops,2,,80,90,30,80',
        'E-c,Sales,1,,70,,50,',
        'E-d,Sales,2,,,,,',
        'E-tidakada,Sales,0,,,,,',
        'E-luar,Sales,0,,,,,',
      ].join('\n');
      const up = await upload(csv);
      expect(up.status).toBe(201);
      const { id, mapping } = up.body.data;
      expect(mapping).toMatchObject({ employeeId: 'ID Karyawan', value2: 'Skor Nilai 2', component2: 'Skor Komponen 2', value3: null });

      expect((await send('post', `/imports/batches/${id}/preview`, {})).status).toBe(400); // program wajib dipilih
      expect((await send('post', `/imports/batches/${id}/preview`, { options: { programKey: 'belum-ada' } })).body.error.message).toMatch(/belum dikonfigurasi/);
      const short = await send('post', `/imports/batches/${id}/preview`, { options: { programKey: 'dna-5c' }, mapping: { ...mapping, value2: null } });
      expect(short.status).toBe(400);
      expect(short.body.error.message).toMatch(/Skor Nilai 1 = Credible; Skor Nilai 2 = Competent/);

      const prev = await send('post', `/imports/batches/${id}/preview`, { options: { programKey: 'dna-5c', cutoffDate: '2026-11-15' }, mapping });
      expect(prev.body.data).toMatchObject({ valid: 3, rejectedCount: 3 });
      expect(prev.body.data.rejected.map((r) => r.reason).join('|')).toMatch(/Skor Akhir atau skor komponen.*tidak ditemukan.*tidak ditemukan/);
      // impor ini mengganti seluruh hasil lama, jadi baris yang ditolak menahan penyimpanan
      const blocked = await send('post', `/imports/batches/${id}/commit`, {});
      expect(blocked.status).toBe(400);
      expect(blocked.body.error.message).toMatch(/semua baris harus valid.*3 baris/);
      const clean = await upload(csv.split('\n').slice(0, 4).join('\n'));
      const done = await send('post', `/imports/batches/${clean.body.data.id}/commit`, { options: { programKey: 'dna-5c', cutoffDate: '2026-11-15' } });
      expect(done.body.data.result).toMatchObject({ imported: 3, participants: 3, removed: 0 });

      const rep = (await get('/programs/dna-5c/report')).body.data;
      expect(rep.source).toBe('results');
      expect(rep.program.cutoffDate).toBe('2026-11-15');
      expect(rep.kpis).toEqual({ registered: 3, completed: 2, completedPct: 67, passed: 1, passedPct: 33, avgValueScore: 90 });
      // E-b: skor akhir kosong -> 30*0,4 + 80*0,6 = 60 -> belum lulus; divisi kosong -> divisi job role; "ops" = "Ops"
      expect(rep.statuses.map((s) => [s.key, s.count])).toEqual([['strong', 1], ['baseline', 0], ['not_passed', 1], ['in_progress', 1]]);
      expect(rep.divisions.map((d) => [d.name, d.participants, d.completed])).toEqual([['Ops', 2, 2], ['Sales', 1, 0]]);
      expect(JSON.stringify(rep)).not.toContain(u.a);
      expect((await get('/programs')).body.data[0]).toMatchObject({ key: 'dna-5c', participants: 3 });
    });

    it('impor ulang adalah potret baru: karyawan yang tidak ada di berkas dikeluarkan', async () => {
      const up = await upload([HEAD, 'E-a,Ops,2,95,90,100,90,100'].join('\n'));
      const done = await send('post', `/imports/batches/${up.body.data.id}/commit`, { options: { programKey: 'dna-5c' } });
      expect(done.body.data.result).toMatchObject({ participants: 1, removed: 2 });
      const rep = (await get('/programs/dna-5c/report')).body.data;
      expect(rep.kpis).toMatchObject({ registered: 1, passed: 1 });
      expect(rep.program.cutoffDate).toBe('2026-11-15');
    });

    it('template lengkap bisa diunggah apa adanya; kolom di luar jumlah program harus kosong', async () => {
      const tpl = await request(app).get('/api/cca/imports/templates/cca_program_results.csv').set(as('hr'));
      const head = tpl.text.replace(/^\uFEFF/, '').split(/\r?\n/)[0];
      const cols = head.split(',');
      const row = (fill) => cols.map((c) => fill[c.replace(/^"|"$/g, '')] ?? '').join(',');
      const base = { 'ID Karyawan': 'E-a', 'Kegiatan Selesai': 2, 'Skor Akhir': 95, 'Skor Nilai 1': 90, 'Skor Nilai 2': 100, 'Skor Komponen 1': 90, 'Skor Komponen 2': 100 };
      const ok = await upload([head, row(base)].join('\n'));
      const prev = await send('post', `/imports/batches/${ok.body.data.id}/preview`, { options: { programKey: 'dna-5c' } });
      expect(prev.body.data).toMatchObject({ valid: 1, rejectedCount: 0 });
      const extra = await upload([head, row({ ...base, 'Skor Nilai 3': 80 })].join('\n'));
      const bad = await send('post', `/imports/batches/${extra.body.data.id}/preview`, { options: { programKey: 'dna-5c' } });
      expect(bad.status).toBe(400);
      expect(bad.body.error.message).toMatch(/Kolom Skor Nilai lain harus kosong/);
      const long = await upload([HEAD, `E-a,${'x'.repeat(300)},2,95,90,100,90,100`].join('\n'));
      const longPrev = await send('post', `/imports/batches/${long.body.data.id}/preview`, { options: { programKey: 'dna-5c' } });
      expect(longPrev.body.data.rejected[0].reason).toMatch(/Divisi maksimal 255/);
    });

    it('mengubah program tanpa mengirim field opsional mempertahankan nilai lama; menukar urutan min band diterima', async () => {
      const swapped = { ...config, passScore: 60, bands: [{ key: 'strong', label: 'Strong', min: 60 }, { key: 'baseline', label: 'Baseline', min: 70 }] };
      const res = await send('put', '/programs/dna-5c', { name: "Elitery's DNA 5C", config: swapped });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ cutoffDate: '2026-11-15', provider: 'Elite Academy', insight: 'Skor akhir tertahan kuis.' });
      expect(res.body.data.recommendations).toHaveLength(1);
      const back = await send('put', '/programs/dna-5c', { name: "Elitery's DNA 5C", config, insight: null });
      expect(back.body.data).toMatchObject({ insight: null, cutoffDate: '2026-11-15' });
    });

    it('laporan dan impor hanya untuk HR, dan tertutup bagi tenant lain', async () => {
      expect((await get('/programs/dna-5c/report', 'spv')).status).toBe(403);
      expect((await get('/programs/dna-5c/report', 'a')).status).toBe(403);
      expect((await upload(HEAD, 'spv')).status).toBe(403);
      expect((await get('/programs/dna-5c/report', 'luar')).status).toBe(404);
      expect((await get('/programs', 'luar')).body.data).toEqual([]);
      // jenis impor karyawan tersedia untuk tenant yang hanya berlangganan CCA
      expect((await get('/imports/templates')).body.data.map((k) => k.key)).toEqual(['dna_job_levels', 'employees', 'cca_program_results']);
    });
  });

  describe('penugasan wawancara berjenjang', () => {
    let spvAssignment;

    it('ditahan di balik flag cca.interview', async () => {
      const res = await get('/assignments');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FEATURE_DISABLED');
      await flag(tenant.id, 'cca.interview');
      await flag(other.id, 'cca.interview');
    });

    it('HR melihat semua calon pimpinan, lalu menugaskan; karyawan dan tenant lain ditolak', async () => {
      const before = (await get('/assignments')).body.data;
      expect(before.role).toBe('hr');
      expect(before.kpis).toEqual({ leadersEligible: 3, leadersAssigned: 0, leadersCompleted: 0, employeesAssigned: 0, employeesCompleted: 0 });
      expect(before.leaders.find((l) => l.userId === u.spv)).toMatchObject({ status: 'none', division: 'Ops', teamTotal: 2, teamAssigned: 0, teamDone: 0 });

      expect((await send('post', '/assignments', { assigneeIds: [u.spv], dueDate: '2020-01-01' })).status).toBe(400);
      expect((await send('post', '/assignments', { assigneeIds: [u.spv] })).status).toBe(400);
      expect((await send('post', '/assignments', { assigneeIds: [], dueDate: future })).status).toBe(400);
      const res = await send('post', '/assignments', { assigneeIds: [u.spv, u.dir, u.a, u.luarspv, 'bukan-uuid'], dueDate: future, durationMinutes: 15 });
      expect(res.status).toBe(201);
      expect(res.body.data.tier).toBe('leader');
      expect(res.body.data.assigned.map((a) => a.assigneeId).sort()).toEqual([u.spv, u.dir].sort());
      expect(res.body.data.rejected.sort()).toEqual([u.a, u.luarspv, 'bukan-uuid'].sort());
      spvAssignment = res.body.data.assigned.find((a) => a.assigneeId === u.spv);
      expect(spvAssignment).toMatchObject({ status: 'assigned', dueDate: future, durationMinutes: 15 });

      const again = await send('post', '/assignments', { assigneeIds: [u.spv], dueDate: future });
      expect(again.body.data).toMatchObject({ assigned: [], skipped: [u.spv] });
      expect((await send('post', '/assignments', { assigneeIds: [u.b], dueDate: future }, 'a')).status).toBe(403);
    });

    it('pimpinan tidak bisa meneruskan sebelum wawancaranya selesai', async () => {
      const view = (await get('/assignments', 'spv')).body.data;
      expect(view).toMatchObject({ role: 'leader', canAssign: false, mine: { leader: { status: 'assigned' }, employee: null } });
      expect(view.team.map((m) => [m.name, m.status])).toEqual([['a', 'none'], ['b', 'none']]);
      const res = await send('post', '/assignments', { assigneeIds: [u.a], dueDate: future }, 'spv');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('LEADER_INTERVIEW_REQUIRED');
    });

    it('setelah selesai, pimpinan menugaskan hanya bawahan langsungnya (supervisor maupun pimpinan)', async () => {
      await stores.cca.completeAssignment(tenant.id, spvAssignment.id, { summary: 'Ringkasan pimpinan: fokus otomasi.' });
      const dirAssignment = (await get('/assignments', 'dir')).body.data.mine.leader;
      await stores.cca.completeAssignment(tenant.id, dirAssignment.id, { summary: 'Ringkasan direktur.' });

      const res = await send('post', '/assignments', { assigneeIds: [u.a, u.b, u.c, u.spv], dueDate: future }, 'spv');
      expect(res.status).toBe(201);
      expect(res.body.data.tier).toBe('employee');
      expect(res.body.data.assigned.map((a) => a.assigneeId).sort()).toEqual([u.a, u.b].sort());
      expect(res.body.data.rejected.sort()).toEqual([u.c, u.spv].sort());

      const dir = await send('post', '/assignments', { assigneeIds: [u.c, u.a], dueDate: future }, 'dir');
      expect(dir.body.data.assigned.map((a) => a.assigneeId)).toEqual([u.c]);
      expect(dir.body.data.rejected).toEqual([u.a]);
      expect((await get('/assignments', 'dir')).body.data.team.map((m) => [m.name, m.status])).toEqual([['c', 'assigned']]);
    });

    it('karyawan melihat penugasannya sendiri; pimpinan hanya melihat status; HR melihat hitungan tim', async () => {
      const mine = (await get('/assignments', 'a')).body.data;
      expect(mine).toEqual({ role: 'employee', mine: { leader: null, employee: expect.objectContaining({ tier: 'employee', status: 'assigned', dueDate: future }) } });
      await stores.cca.completeAssignment(tenant.id, mine.mine.employee.id, { summary: 'Jawaban karyawan a.' });

      const spv = (await get('/assignments', 'spv')).body.data;
      expect(spv.canAssign).toBe(true);
      expect(spv.team).toEqual([
        { userId: u.a, name: 'a', jobRoleName: 'Engineer', status: 'completed' },
        { userId: u.b, name: 'b', jobRoleName: 'Engineer', status: 'assigned' },
      ]);
      expect(JSON.stringify(spv)).not.toContain('Jawaban');

      const hr = (await get('/assignments')).body.data;
      expect(hr.kpis).toEqual({ leadersEligible: 3, leadersAssigned: 2, leadersCompleted: 2, employeesAssigned: 3, employeesCompleted: 1 });
      expect(hr.leaders.find((l) => l.userId === u.spv)).toMatchObject({ status: 'completed', teamTotal: 2, teamAssigned: 2, teamDone: 1 });
      expect(hr.leaders.find((l) => l.userId === u.spv2)).toMatchObject({ status: 'none', assignmentId: null });
      expect(JSON.stringify(hr)).not.toContain(u.a);
    });

    it('ringkasan: peserta sendiri dan HR untuk tier pimpinan; ringkasan karyawan tidak dibuka per orang; baca dicatat audit', async () => {
      const a = (await get('/assignments', 'a')).body.data.mine.employee;
      const own = await get(`/assignments/${a.id}/summary`, 'a');
      expect(own.body.data.themes).toEqual([{ theme: null, question: null, answer: 'Jawaban karyawan a.' }]);
      const hrOnEmployee = await get(`/assignments/${a.id}/summary`);
      expect(hrOnEmployee.status).toBe(403);
      expect(hrOnEmployee.body.error.code).toBe('SUMMARY_RESTRICTED');
      expect((await get(`/assignments/${a.id}/summary`, 'spv')).status).toBe(404);
      expect((await get(`/assignments/${a.id}/summary`, 'b')).status).toBe(404);
      expect((await get(`/assignments/${a.id}/summary`, 'luar')).status).toBe(404);

      const leader = await get(`/assignments/${spvAssignment.id}/summary`);
      expect(leader.body.data).toMatchObject({ tier: 'leader', themes: [{ theme: null, question: null, answer: 'Ringkasan pimpinan: fokus otomasi.' }] });
      const b = (await get('/assignments', 'b')).body.data.mine.employee;
      expect((await get(`/assignments/${b.id}/summary`, 'b')).status).toBe(404); // belum selesai

      const [raw] = await db.query('SELECT summary FROM cca_assignments WHERE id = :id', { replacements: { id: spvAssignment.id }, type: 'SELECT' });
      expect(raw.summary).not.toContain('otomasi');
      const audits = await db.query(`SELECT user_id AS "userId", meta FROM audit_logs WHERE tenant_id = :t AND resource = 'cca.interview_summary'`, { replacements: { t: tenant.id }, type: 'SELECT' });
      expect(audits.map((x) => [x.userId, x.meta.employeeIds[0]]).sort()).toEqual([[u.a, u.a], [u.hr, u.spv]].sort());
    });

    it('pembatalan hanya oleh penugas atau HR dan hanya sebelum dimulai; setelah selesai boleh putaran baru', async () => {
      const b = (await get('/assignments', 'b')).body.data.mine.employee;
      expect((await send('patch', `/assignments/${b.id}`, { status: 'completed' }, 'spv')).status).toBe(400);
      expect((await send('patch', `/assignments/${b.id}`, { status: 'cancelled' }, 'dir')).status).toBe(404);
      expect((await send('patch', `/assignments/${b.id}`, { status: 'cancelled' }, 'luar')).status).toBe(404);
      // HR tidak membatalkan penugasan karyawan yang dibuat atasan
      expect((await send('patch', `/assignments/${b.id}`, { status: 'cancelled' })).status).toBe(404);
      expect((await send('patch', `/assignments/${b.id}`, { status: 'cancelled' }, 'spv')).body.data.status).toBe('cancelled');
      expect((await get('/assignments', 'b')).body.data.mine.employee).toBeNull();
      expect((await send('patch', `/assignments/${spvAssignment.id}`, { status: 'cancelled' })).body.error.code).toBe('INVALID_STATE');

      const round2 = await send('post', '/assignments', { assigneeIds: [u.spv], dueDate: future });
      expect(round2.body.data.assigned).toHaveLength(1);
      // putaran baru belum selesai, jadi pimpinan belum bisa meneruskan lagi
      expect((await get('/assignments', 'spv')).body.data).toMatchObject({ canAssign: false, mine: { leader: { status: 'assigned' } } });
    });

    it('ekspor data karyawan memuat hasil program dan penugasannya; ringkasan hanya untuk dirinya; hapus karyawan menghapus semuanya', async () => {
      const exp = (who) => request(app).get(`/api/employees/${u.a}/export`).set(as(who));
      const self = (await exp('a')).body.data.coreCompetencies;
      expect(self.programResults).toEqual([expect.objectContaining({
        programKey: 'dna-5c', finalScore: 95, totalActivities: 2,
        values: [{ name: 'Credible', score: 90 }, { name: 'Competent', score: 100 }],
        components: [{ name: 'Kuis', score: 90 }, { name: 'Asesmen akhir', score: 100 }],
      })]);
      expect(self.interviewAssignments).toEqual([expect.objectContaining({ tier: 'employee', status: 'completed', summary: { themes: [{ theme: null, question: null, answer: 'Jawaban karyawan a.' }], stances: [] } })]);
      const byHr = (await exp('hr')).body.data.coreCompetencies;
      expect(byHr.interviewAssignments).toHaveLength(1);
      expect(JSON.stringify(byHr)).not.toContain('Jawaban');

      expect((await request(app).delete(`/api/employees/${u.a}`).set(as('hr')).send({ reason: 'uji' })).status).toBe(200);
      const [{ n }] = await db.query(
        `SELECT (SELECT count(*) FROM cca_program_results WHERE user_id = :id)::int + (SELECT count(*) FROM cca_assignments WHERE assignee_id = :id)::int AS n`,
        { replacements: { id: u.a }, type: 'SELECT' });
      expect(n).toBe(0);
    });

    it('tenant lain punya daftar sendiri', async () => {
      const hr = (await get('/assignments', 'luar')).body.data;
      expect(hr.kpis).toMatchObject({ leadersEligible: 1, leadersAssigned: 0, employeesAssigned: 0 });
      expect(hr.leaders.map((l) => l.userId)).toEqual([u.luarspv]);
    });
  });

  describe('gerbang, peran, dan audit (review diff egm)', () => {
    it('group yang bukan milik objek (toString) dijawab 400, bukan 500', async () => {
      expect((await get('/overview?group=toString')).status).toBe(400);
      expect((await get('/overview?group=constructor')).status).toBe(400);
    });

    it('eta_admin ditolak (keputusan user 24 Nov: Super Admin tidak membaca isi data karyawan)', async () => {
      for (const path of ['/overview?group=vm', '/assignments']) {
        expect((await get(path, 'eta')).body.error.code).toBe('EMPLOYEE_CONTENT_PRIVATE');
      }
    });

    it('perubahan data tercatat audit.record untuk sumber, persyaratan, program, dan penugasan', async () => {
      const rows = await db.query(`SELECT DISTINCT resource FROM audit_logs WHERE tenant_id = :t AND action IN ('create','update')`, { replacements: { t: tenant.id }, type: 'SELECT' });
      const resources = rows.map((r) => r.resource);
      for (const r of ['cca.source', 'cca.requirement', 'cca.program', 'cca.assignment']) expect(resources).toContain(r);
    });

    it('flag cca.interview mati menutup semua rute penugasan; module.cca mati menutup seluruh modul', async () => {
      await flag(tenant.id, 'cca.interview', false);
      const id = '00000000-0000-4000-8000-000000000000';
      for (const res of [await get('/assignments'), await send('post', '/assignments', { assigneeIds: [u.spv], dueDate: future }),
        await send('patch', `/assignments/${id}`, { status: 'cancelled' }), await get(`/assignments/${id}/summary`)]) {
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FEATURE_DISABLED');
      }
      await flag(tenant.id, 'cca.interview', true);
      await flag(tenant.id, 'module.cca', false);
      for (const res of [await get('/overview?group=vm'), await get('/programs'), await get('/assignments')]) expect(res.status).toBe(403);
      await flag(tenant.id, 'module.cca', true);
    });

    it('penugasan menolak durasi di luar 5-60 menit dan lebih dari 200 penerima', async () => {
      expect((await send('post', '/assignments', { assigneeIds: [u.spv2], dueDate: future, durationMinutes: 4 })).status).toBe(400);
      expect((await send('post', '/assignments', { assigneeIds: [u.spv2], dueDate: future, durationMinutes: 61 })).status).toBe(400);
      const many = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
      expect((await send('post', '/assignments', { assigneeIds: many, dueDate: future })).status).toBe(400);
    });
  });
});
