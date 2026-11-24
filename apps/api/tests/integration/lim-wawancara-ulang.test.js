// B15 tahap 3 (Postgres): wawancara ulang AI oleh karyawan, penilaian, hasil HR, privasi, dan perubahan rencana saat
// wawancara berjalan. Spek: docs/designs/b15-impact-measurement.md bagian 12.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { AiError } = require('../../src/ai/errors');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const day = (offset) => new Date(Date.now() + 7 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
const CONSENT = 'lim-consent-id-v1.0';

run('B15 tahap 3 wawancara ulang AI (Postgres)', () => {
  let db; let app; let stores; let tenant; let role; let role2; let k1; let k2; let plan; const u = {}; const tok = {};
  const fail = { question: false, score: false };
  const hold = { question: null };
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const get = (path, who) => request(app).get(`/api/lim${path}`).set(as(who));
  const send = (method, path, body, who) => request(app)[method](`/api/lim${path}`).set(as(who)).send(body || {});
  const q = (sql, replacements = {}) => db.query(sql, { replacements, type: 'SELECT' });
  const flag = (key, enabled) => db.query(
    'INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled) ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled',
    { replacements: { t: tenant.id, key, enabled } });
  const me = (who, rest = '') => `/me/reinterviews/${plan.id}${rest}`;
  /** Jawab semua pertanyaan yang tersisa; return jawaban terakhir. */
  async function answerAll(who) {
    let res;
    for (let i = 0; i < 9; i += 1) {
      res = await send('post', me(who, '/turns'), { text: `Jawaban ${i + 1}` }, who);
      if (res.status !== 200 || res.body.data.done) break;
    }
    return res;
  }

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    const stub = createStubProvider();
    const ai = {
      ...stub,
      async limQuestion(x) { if (fail.question) throw new AiError('AI_UNAVAILABLE', 'uji'); if (hold.question) await hold.question; return stub.limQuestion(x); },
      async summarizeLim(x) { if (fail.score) throw new AiError('AI_UNAVAILABLE', 'uji'); return stub.summarizeLim(x); },
    };
    app = createApp({ config, stores, ai });
    const tokens = sessionSigner(config, stores.authSessions);
    const slug = `limw-${Date.now()}`;
    [[tenant]] = await db.query("INSERT INTO tenants (slug, name) VALUES (:slug, 'LIM wawancara') RETURNING id", { replacements: { slug } });
    [role] = await q("INSERT INTO lna_job_roles (tenant_id, name) VALUES (:t, 'Engineer L1') RETURNING id", { t: tenant.id });
    [role2] = await q("INSERT INTO lna_job_roles (tenant_id, name) VALUES (:t, 'Sales') RETURNING id", { t: tenant.id });
    const add = async (key, r, sup = null) => {
      const [row] = await q(`INSERT INTO users (tenant_id, email, name, employee_id, role, status, supervisor_id, job_role_id)
        VALUES (:t, :email, :key, :emp, :r, 'active', :sup, :jr) RETURNING id`, { t: tenant.id, email: `${key}@limw.test`, key, emp: `E-${key}`, r, sup, jr: role.id });
      u[key] = row.id;
      tok[key] = await tokens.sign({ id: row.id, tenantId: tenant.id, role: r, email: `${key}@limw.test` });
    };
    await add('hr', 'hr_admin');
    await add('spv', 'supervisor');
    for (const k of ['a', 'b', 'd', 'e']) await add(k, 'learner', u.spv);
    await add('c', 'learner'); // peserta tanpa jadwal
    await db.query("INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')", { replacements: { t: tenant.id } });
    await flag('module.lim', true);
    await flag('lim.reinterview', true);
    const comp = async (name) => (await q("INSERT INTO lna_competencies (tenant_id, job_role_id, kind, name, definition) VALUES (:t, :r, 'job', :name, 'Definisi') RETURNING id", { t: tenant.id, r: role.id, name }))[0].id;
    k1 = await comp('Ticket Life Cycle');
    k2 = await comp('Eskalasi Insiden');
    const [mod] = await q("INSERT INTO li_modules (tenant_id, code, name, level) VALUES (:t, 'ST-1', 'ST-1', 'basic') RETURNING id", { t: tenant.id });
    for (const c of [k1, k2]) await q('INSERT INTO li_module_competencies (tenant_id, module_id, competency_id) VALUES (:t, :m, :c) RETURNING module_id', { t: tenant.id, m: mod.id, c });
    const [tr] = await q(`INSERT INTO ld_trainings (tenant_id, title, mode, source, module_id, starts_on, ends_on, status, assessment_mode)
      VALUES (:t, 'Workshop', 'offline', 'manual', :m, '2026-10-01', '2026-10-02', 'done', 'vendor_manual') RETURNING id`, { t: tenant.id, m: mod.id });
    for (const k of ['a', 'b', 'c', 'd', 'e']) {
      await q(`INSERT INTO ld_participants (tenant_id, training_id, user_id, status, attendance, score, score_source)
        VALUES (:t, :tr, :u, 'completed', true, 85, 'vendor_manual') RETURNING id`, { t: tenant.id, tr: tr.id, u: u[k] });
    }
    const res = await send('post', '/plans', {
      title: 'Pilot L1', jobRoleId: role.id, periodFrom: '2026-09-01', periodUntil: '2026-12-31', moduleIds: [mod.id],
      businessProblem: 'x', desiredBehavior: 'x', priorityCapabilities: 'x', evidencePlan: 'x', existingMetrics: 'x',
    }, 'hr');
    plan = res.body.data;
    expect((await send('post', `/plans/${plan.id}/queue/schedule`, { userIds: [u.a, u.b, u.d, u.e], date: day(3) }, 'hr')).body.data.scheduled).toHaveLength(4);
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id = :id', { replacements: { id: tenant.id }, transaction });
    });
    await db.close();
  });

  it('flag lim.reinterview mati: rute karyawan dan hasil HR 403 FEATURE_DISABLED (sama dengan flag lain); antrean tanpa field tahap 3', async () => {
    await flag('lim.reinterview', false);
    const queue = (await get(`/plans/${plan.id}/queue`, 'hr')).body.data;
    expect(queue[0]).not.toHaveProperty('canView');
    expect((await get('/me/reinterviews', 'a')).body.error.code).toBe('FEATURE_DISABLED');
    expect((await get(`/plans/${plan.id}/reinterviews/${u.a}`, 'hr')).status).toBe(403);
    await flag('lim.reinterview', true);
  });

  it('daftar karyawan: rencana aktif dengan kompetensi terjadwal; peserta tanpa jadwal kosong', async () => {
    const res = await get('/me/reinterviews', 'a');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ planId: plan.id, planTitle: 'Pilot L1', scheduledOn: day(3), status: 'open', competencies: ['Eskalasi Insiden', 'Ticket Life Cycle'] }]);
    expect((await get('/me/reinterviews', 'c')).body.data).toEqual([]);
    expect((await get(me('c', '/session'), 'c')).status).toBe(404);
  });

  it('persetujuan: versi salah 400; versi benar membuat wawancara, mencatat audit, dan mengirim pertanyaan pertama', async () => {
    const s0 = await get(me('a', '/session'), 'a');
    expect(s0.body.data).toMatchObject({ step: 'consent', consentVersionRequired: CONSENT, questionCount: 5, answerCount: 0, turns: [] });
    expect((await send('post', me('a', '/consent'), { consentVersion: 'cca-consent-id-v1.0' }, 'a')).status).toBe(400);
    const res = await send('post', me('a', '/consent'), { consentVersion: CONSENT }, 'a');
    expect(res.status).toBe(200);
    expect(res.body.data.question).toMatchObject({ position: 1, kind: 'scenario', competency: 'Eskalasi Insiden' });
    expect(res.body.data.question.options).toHaveLength(3);
    expect((await send('post', me('a', '/consent'), { consentVersion: CONSENT }, 'a')).status).toBe(409);
    const audit = await q("SELECT 1 FROM audit_logs WHERE tenant_id = :t AND resource = 'lim.reinterview_consent'", { t: tenant.id });
    expect(audit).toHaveLength(1);
  });

  it('jawaban: giliran terenkripsi, jawaban paralel kalah 409, jawaban terakhir menilai dan menutup', async () => {
    // Pertanyaan AI berikutnya ditahan sampai salah satu jawaban selesai: tanpa ini jawaban kedua bisa datang setelah
    // jawaban pertama selesai penuh dan sah menjawab pertanyaan berikutnya (balapan bergantung waktu, gagal sesekali di CI).
    let release;
    hold.question = new Promise((resolve) => { release = resolve; });
    const calls = [1, 2].map(() => send('post', me('a', '/turns'), { text: 'Saya cek matriks eskalasi.' }, 'a').then((r) => r));
    const first = await Promise.race(calls);
    expect(first.status).toBe(409);
    hold.question = null;
    release();
    const [one, two] = await Promise.all(calls);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    const raw = await q('SELECT t.text FROM lim_reinterview_turns t JOIN lim_reinterviews r ON r.id = t.reinterview_id WHERE r.user_id = :u', { u: u.a });
    expect(raw.length).toBeGreaterThan(0);
    expect(raw.map((x) => x.text).join(' ')).not.toMatch(/matriks/);
    expect((await send('post', me('a', '/turns'), { text: 'x'.repeat(2001) }, 'a')).status).toBe(400);
    const last = await answerAll('a');
    expect(last.body.data).toEqual({ question: null, done: true });
    const s = await get(me('a', '/session'), 'a');
    expect(s.body.data).toMatchObject({ step: 'done', answerCount: 5 });
    expect(JSON.stringify(s.body.data)).not.toMatch(/"score"/);
    const rows = await q(`SELECT m.reinterview_status AS s, m.reinterview_score::int AS score, m.reinterview_session_id = r.id AS linked
      FROM lim_measurements m JOIN lim_reinterviews r ON r.plan_id = m.plan_id AND r.user_id = m.user_id WHERE m.user_id = :u`, { u: u.a });
    expect(rows).toEqual([{ s: 'done', score: 60, linked: true }, { s: 'done', score: 60, linked: true }]);
    expect((await send('post', me('a', '/turns'), { text: 'lagi' }, 'a')).status).toBe(409);
  });

  it('antrean HR: canView dan reinterviewId; hasil HR berisi skor dan alasan tanpa transkrip, dengan audit baca individu', async () => {
    const queue = (await get(`/plans/${plan.id}/queue`, 'hr')).body.data;
    const a = queue.find((x) => x.userId === u.a);
    expect(a).toMatchObject({ status: 'done', canView: true });
    expect(a.reinterviewId).toEqual(expect.any(String));
    expect(queue.find((x) => x.userId === u.b)).toMatchObject({ canView: false, reinterviewId: null });
    const res = await get(`/plans/${plan.id}/reinterviews/${u.a}`, 'hr');
    expect(res.status).toBe(200);
    const [latest] = res.body.data.reinterviews;
    expect(latest.competencies.map((c) => [c.name, c.reinterview, c.post])).toEqual([['Eskalasi Insiden', 60, 85], ['Ticket Life Cycle', 60, 85]]);
    expect(latest.competencies[0].reason).toMatch(/stub/);
    expect(latest).toMatchObject({ confidence: 'low', generatedBy: 'rules' });
    expect(latest.benchmark[0]).toMatchObject({ retention: 'retention_drop', application: 'missing' });
    expect(latest.chain).toHaveLength(6);
    expect(latest.recommendations[0]).toBe('Jadwalkan penguatan Eskalasi Insiden dan ulangi wawancara dalam 4 pekan.');
    expect(JSON.stringify(res.body)).not.toMatch(/Jawaban 1|turns/);
    const reads = await q("SELECT 1 FROM audit_logs WHERE tenant_id = :t AND resource = 'lim.reinterview' AND action = 'read'", { t: tenant.id });
    expect(reads.length).toBeGreaterThan(0);
    expect((await get(`/plans/${plan.id}/reinterviews/${u.b}`, 'hr')).status).toBe(404);
    expect((await get(`/plans/${plan.id}/reinterviews/${u.a}`, 'spv')).status).toBe(403);
    expect((await get(`/plans/${plan.id}/reinterviews/${u.a}`, 'a')).status).toBe(403);
  });

  it('Simpan hasil (mockup limFinish): HR mencatat tinjauan hasil di audit; tanpa wawancara selesai 404; non-HR 403', async () => {
    const res = await send('post', `/plans/${plan.id}/reinterviews/${u.a}/review`, {}, 'hr');
    expect(res.status).toBe(204);
    const [log] = await q("SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'lim.reinterview' AND action = 'update' ORDER BY id DESC LIMIT 1", { t: tenant.id });
    expect(log.meta).toMatchObject({ planId: plan.id, employeeIds: [u.a], reviewed: true, reinterviewId: expect.any(String) });
    // reinterviewId dari layar (yang dibaca HR) dipakai bila dikirim; id asing 404
    expect((await send('post', `/plans/${plan.id}/reinterviews/${u.a}/review`, { reinterviewId: log.meta.reinterviewId }, 'hr')).status).toBe(204);
    expect((await send('post', `/plans/${plan.id}/reinterviews/${u.a}/review`, { reinterviewId: '00000000-0000-4000-8000-000000000000' }, 'hr')).status).toBe(404);
    expect((await send('post', `/plans/${plan.id}/reinterviews/${u.b}/review`, {}, 'hr')).status).toBe(404);
    expect((await send('post', `/plans/${plan.id}/reinterviews/bukan-uuid/review`, {}, 'hr')).status).toBe(404);
    expect((await send('post', `/plans/${plan.id}/reinterviews/${u.a}/review`, {}, 'spv')).status).toBe(403);
  });

  it('HR membatalkan jadwal saat wawancara berjalan: pasangan itu dilewati; rencana diarsip: sesi 409', async () => {
    await send('post', me('b', '/consent'), { consentVersion: CONSENT }, 'b');
    const res = await send('post', `/plans/${plan.id}/queue/schedule`, { userIds: [u.b], date: null }, 'hr');
    expect(res.body.data.skipped).toEqual([{ userId: u.b, reason: 'in_progress' }]);
    await send('patch', `/plans/${plan.id}`, { status: 'archived' }, 'hr');
    expect((await send('post', me('b', '/turns'), { text: 'Jawab' }, 'b')).body.error.code).toBe('PLAN_ARCHIVED');
    await send('patch', `/plans/${plan.id}`, { status: 'active' }, 'hr');
    expect((await get('/me/reinterviews', 'b')).body.data[0].status).toBe('in_progress');
  });

  it('HR membatalkan jadwal tepat saat persetujuan (balapan): skor tetap tercatat di pasangan potret (review diff)', async () => {
    await q("UPDATE lim_measurements SET reinterview_status = 'none', reinterview_on = NULL WHERE user_id = :u RETURNING id", { u: u.b });
    const last = await answerAll('b');
    expect(last.body.data.done).toBe(true);
    const rows = await q('SELECT reinterview_status AS s FROM lim_measurements WHERE user_id = :u', { u: u.b });
    expect(rows.map((x) => x.s)).toEqual(['done', 'done']);
  });

  it('AI gagal: pertanyaan dan penilaian menjadi 502; step scoring; coba lagi tanpa text menutup sesi', async () => {
    fail.question = true;
    const r1 = await send('post', me('d', '/consent'), { consentVersion: CONSENT }, 'd');
    expect(r1.body.data).toEqual({ question: null });
    expect((await send('post', me('d', '/turns'), {}, 'd')).status).toBe(502);
    fail.question = false;
    expect((await send('post', me('d', '/turns'), {}, 'd')).body.data.question.position).toBe(1);
    fail.score = true;
    const last = await answerAll('d');
    expect(last.status).toBe(502);
    expect((await get(me('d', '/session'), 'd')).body.data.step).toBe('scoring');
    fail.score = false;
    expect((await send('post', me('d', '/turns'), {}, 'd')).body.data).toEqual({ question: null, done: true });
  });

  it('kelayakan dicek ulang saat persetujuan: karyawan yang pindah jabatan 404', async () => {
    await q('UPDATE users SET job_role_id = :r WHERE id = :u RETURNING id', { r: role2.id, u: u.e });
    expect((await send('post', me('e', '/consent'), { consentVersion: CONSENT }, 'e')).status).toBe(404);
    await q('UPDATE users SET job_role_id = :r WHERE id = :u RETURNING id', { r: role.id, u: u.e });
  });

  it('hapus karyawan menghapus wawancara ulang dan gilirannya (CASCADE)', async () => {
    const [ri] = await q('SELECT id FROM lim_reinterviews WHERE user_id = :u', { u: u.d });
    expect((await request(app).delete(`/api/employees/${u.d}`).set(as('hr'))).status).toBeLessThan(300);
    expect(await q('SELECT 1 FROM lim_reinterviews WHERE id = :id', { id: ri.id })).toEqual([]);
    expect(await q('SELECT 1 FROM lim_reinterview_turns WHERE reinterview_id = :id', { id: ri.id })).toEqual([]);
  });

  it('ekspor: karyawan menerima skor, alasan, dan transkrip; HR menerima skor tanpa alasan dan transkrip', async () => {
    const self = await request(app).get(`/api/employees/${u.a}/export`).set(as('a'));
    const mine = self.body.data.impactReinterviews;
    expect(mine[0]).toMatchObject({ planId: plan.id, status: 'completed' });
    expect(mine[0].competencies[0]).toMatchObject({ score: 60, reason: expect.any(String) });
    expect(mine[0].turns).toHaveLength(10);
    const hr = await request(app).get(`/api/employees/${u.a}/export`).set(as('hr'));
    const theirs = hr.body.data.impactReinterviews;
    expect(theirs[0].competencies[0].score).toBe(60);
    expect(theirs[0].competencies[0].reason).toBeUndefined();
    expect(theirs[0].turns).toBeUndefined();
  });
});
