// B10 tahap 2 (spek bagian 11): percakapan wawancara Core Competencies, ringkasan, konfirmasi, sintesis pimpinan vs
// karyawan, dan pengisian nilai aktual dari sintesis. Jalan hanya bila DATABASE_URL di-set.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { AI_ERRORS } = require('../../src/ai/errors');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const CONSENT = 'cca-consent-id-v1.0';

run('B10 tahap 2: wawancara dan sintesis Core Competencies (Postgres)', () => {
  let db; let app; let tenant; let other; const u = {}; const tok = {}; const req = {};
  // penyedia AI tiruan yang merekam argumen dan bisa digagalkan
  const stub = createStubProvider();
  const calls = []; const fail = { question: false, summary: false };
  const ai = {
    ...stub,
    async ccaQuestion(args) {
      calls.push({ op: 'question', args });
      if (fail.question) throw AI_ERRORS.unavailable();
      return stub.ccaQuestion(args);
    },
    async summarizeCca(args) {
      calls.push({ op: 'summary', args });
      if (fail.summary) throw AI_ERRORS.unavailable();
      return stub.summarizeCca(args);
    },
  };
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const get = (path, who) => request(app).get(`/api/cca${path}`).set(as(who));
  const send = (method, path, body, who) => request(app)[method](`/api/cca${path}`).set(as(who)).send(body);
  const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const stores = createStores(db);
    app = createApp({ config, stores, ai });
    const tokens = sessionSigner(config, stores.authSessions);
    const slug = `ccaw-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'CCA wawancara') RETURNING id`, { replacements: { slug } });
    [[other]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Lain') RETURNING id`, { replacements: { slug: `${slug}-x` } });
    const add = async (key, role, { t = tenant.id, sup = null } = {}) => {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status, supervisor_id)
         VALUES (:t, :email, :name, :emp, :role, 'active', :sup) RETURNING id`,
        { replacements: { t, email: `${key}@ccaw.test`, name: `Nama ${key}`, emp: `E-${key}`, role, sup } });
      u[key] = row.id;
      tok[key] = await tokens.sign({ id: row.id, tenantId: t, role, email: `${key}@ccaw.test` });
    };
    await add('hr', 'hr_admin');
    await add('eta', 'eta_admin');
    await add('dir', 'pimpinan');
    await add('spv3', 'supervisor');
    await add('spv', 'supervisor', { sup: u.dir });
    for (let i = 1; i <= 9; i += 1) await add(`k${i}`, 'learner', { sup: u.spv });
    await add('luar', 'hr_admin', { t: other.id });
    for (const t of [tenant.id, other.id]) {
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'cca')`, { replacements: { t } });
      for (const key of ['module.cca', 'cca.interview']) {
        await db.query('INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, true)', { replacements: { t, key } });
      }
    }
    const src = async (kind, title, text) => (await send('post', '/sources', { kind, title, text }, 'hr')).body.data;
    const vision = await src('vision', 'Corporate Vision', 'Menjadi mitra transformasi digital terpercaya.');
    const value = await src('value', 'Credible', 'Dapat dipercaya.');
    const mk = async (key, source, name, status = 'validated') => {
      req[key] = (await send('post', `/sources/${source.id}/requirements`, { name, targetScore: 80 }, 'hr')).body.data;
      if (status !== 'draft') await send('patch', `/requirements/${req[key].id}`, { status }, 'hr');
    };
    await mk('kolaborasi', vision, 'Kolaborasi lintas tim');
    await mk('pelanggan', vision, 'Fokus pelanggan');
    await mk('integritas', value, 'Integritas data');
    await mk('draf', vision, 'Persyaratan draf', 'draft');
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.close();
  });

  /** Jalankan wawancara penuh sebagai `who` dengan empat jawaban; berhenti sebelum konfirmasi bila confirm false. */
  async function wawancara(who, assignmentId, answers, { confirm = true } = {}) {
    expect((await send('post', `/assignments/${assignmentId}/consent`, { consentVersion: CONSENT }, who)).status).toBe(200);
    for (const text of answers) expect((await send('post', `/assignments/${assignmentId}/turns`, { text }, who)).status).toBe(200);
    expect((await send('post', `/assignments/${assignmentId}/summary`, {}, who)).status).toBe(201);
    if (confirm) expect((await send('post', `/assignments/${assignmentId}/summary/confirm`, {}, who)).status).toBe(200);
  }
  const milik = async (who, tier) => (await get('/assignments', who)).body.data.mine[tier];

  describe('sesi peserta', () => {
    let leaderId;

    it('pimpinan: persetujuan, empat pertanyaan, ringkasan per tema, konfirmasi; setelah itu bisa menugaskan tim', async () => {
      await send('post', '/assignments', { assigneeIds: [u.dir], dueDate: future }, 'hr');
      leaderId = (await milik('dir', 'leader')).id;

      let s = (await get(`/assignments/${leaderId}/session`, 'dir')).body.data;
      expect(s).toMatchObject({ step: 'consent', consentVersionRequired: CONSENT, turns: [], answerCount: 0, questionCount: 4, summary: null });

      const c = await send('post', `/assignments/${leaderId}/consent`, { consentVersion: CONSENT }, 'dir');
      expect(c.status).toBe(200);
      expect(c.body.data.question).toMatchObject({ position: 1, theme: 'vision' });
      expect(c.body.data.question.text).toMatch(/Corporate Vision/);
      expect(c.body.data.question.options.length).toBeLessThanOrEqual(3);

      const jawaban = ['Kolaborasi lintas tim sangat penting bagi kami.', 'Misi kami menuntut fokus pelanggan.', 'Integritas data adalah dasar.', 'Saya memberi contoh dengan rapat lintas divisi.'];
      const tema = [];
      for (let i = 0; i < 4; i += 1) {
        const r = await send('post', `/assignments/${leaderId}/turns`, { text: jawaban[i] }, 'dir');
        expect(r.status).toBe(200);
        if (i < 3) tema.push(r.body.data.question.theme);
        else expect(r.body.data).toEqual({ question: null, done: true });
      }
      expect(tema).toEqual(['mission', 'values', 'behavior']);

      s = (await get(`/assignments/${leaderId}/session`, 'dir')).body.data;
      expect(s).toMatchObject({ step: 'chat', answerCount: 4 });
      expect(s.turns).toHaveLength(8);
      expect(s.turns[1]).toMatchObject({ role: 'participant', theme: 'vision', text: jawaban[0] });

      const sum = await send('post', `/assignments/${leaderId}/summary`, {}, 'dir');
      expect(sum.status).toBe(201);
      expect(sum.body.data.themes.map((t) => t.theme)).toEqual(['vision', 'mission', 'values', 'behavior']);
      expect(sum.body.data).not.toHaveProperty('stances');
      expect((await get(`/assignments/${leaderId}/session`, 'dir')).body.data.step).toBe('summary');

      expect((await send('post', '/assignments', { assigneeIds: [u.spv], dueDate: future }, 'dir')).status).toBe(409);
      const ok = await send('post', `/assignments/${leaderId}/summary/confirm`, {}, 'dir');
      expect(ok.status).toBe(200);
      expect(ok.body.data).toEqual({ status: 'completed' });
      expect((await get(`/assignments/${leaderId}/session`, 'dir')).body.data.step).toBe('done');
      expect((await send('post', '/assignments', { assigneeIds: [u.spv], dueDate: future }, 'dir')).body.data.assigned).toHaveLength(1);
    });

    it('orang lain mendapat 404 di semua rute sesi; HR membaca ringkasan pimpinan per tema tanpa sikap, bukan transkrip', async () => {
      const id = leaderId;
      for (const who of ['spv', 'hr', 'k1', 'luar']) {
        expect((await get(`/assignments/${id}/session`, who)).status).toBe(404);
        for (const path of ['consent', 'turns', 'summary', 'summary/confirm', 'restart']) {
          expect((await send('post', `/assignments/${id}/${path}`, { consentVersion: CONSENT, text: 'x' }, who)).status).toBe(404);
        }
      }
      expect((await get('/assignments/bukan-uuid/session', 'dir')).status).toBe(404);
      const r = await get(`/assignments/${id}/summary`, 'hr');
      expect(r.status).toBe(200);
      expect(r.body.data.themes.map((t) => t.theme)).toEqual(['vision', 'mission', 'values', 'behavior']);
      expect(r.body.data.themes[0].question).toMatch(/Corporate Vision/);
      expect(r.body.data).not.toHaveProperty('stances');
      expect(r.body.data).not.toHaveProperty('turns');
    });

    it('konteks AI tanpa nama atau email; ringkasan memakai potret persyaratan saat persetujuan', async () => {
      await send('post', '/assignments', { assigneeIds: [u.spv], dueDate: future }, 'hr');
      const id = (await milik('spv', 'leader')).id;
      calls.length = 0;
      expect((await send('post', `/assignments/${id}/consent`, { consentVersion: CONSENT }, 'spv')).status).toBe(200);
      // pertanyaan diarahkan ke nama persyaratan potret (D-3), tanpa ID
      expect(calls[0].args.requirements).toEqual(expect.arrayContaining([{ name: 'Kolaborasi lintas tim' }, { name: 'Integritas data' }]));
      expect(calls[0].args.requirements).toHaveLength(3);
      // persyaratan yang ditolak setelah persetujuan tetap ikut ringkasan putaran ini (potret); R-4 menyaringnya di sintesis
      await send('patch', `/requirements/${req.integritas.id}`, { status: 'rejected' }, 'hr');
      // persyaratan baru setelah persetujuan tidak ikut ringkasan putaran ini
      const vision = (await get('/sources', 'hr')).body.data.find((x) => x.kind === 'vision');
      req.inovasi = (await send('post', `/sources/${vision.id}/requirements`, { name: 'Inovasi layanan', targetScore: 70 }, 'hr')).body.data;
      await send('patch', `/requirements/${req.inovasi.id}`, { status: 'validated' }, 'hr');
      for (let i = 0; i < 4; i += 1) await send('post', `/assignments/${id}/turns`, { text: 'Saya belum yakin.' }, 'spv');
      expect((await send('post', `/assignments/${id}/summary`, {}, 'spv')).status).toBe(201);
      const payload = JSON.stringify(calls);
      for (const key of Object.keys(u)) {
        expect(payload).not.toContain(`Nama ${key}`);
        expect(payload).not.toContain(`${key}@ccaw.test`);
      }
      const summaryCall = calls.find((c) => c.op === 'summary');
      expect(summaryCall.args.requirements.map((x) => x.name).sort()).toEqual(['Fokus pelanggan', 'Integritas data', 'Kolaborasi lintas tim']);
      expect(calls.filter((c) => c.op === 'question')).toHaveLength(4);
      await send('patch', `/requirements/${req.integritas.id}`, { status: 'validated' }, 'hr');
      expect((await send('post', `/assignments/${id}/summary/confirm`, {}, 'spv')).status).toBe(200);
      // pemakaian AI tercatat tanpa sesi B6
      const [usage] = await db.query(
        `SELECT count(*)::int AS n, count(session_id)::int AS sessions FROM ai_usage_logs WHERE tenant_id = :t AND submodule = 'cca'`,
        { replacements: { t: tenant.id }, type: 'SELECT' });
      expect(usage.n).toBeGreaterThanOrEqual(10);
      expect(usage.sessions).toBe(0);
    });

    it('keadaan: versi persetujuan, AI gagal, jawaban paralel, ringkasan ada, ulangi sekali, konfirmasi ganda', async () => {
      const id = (await milik('spv', 'employee')).id;
      expect((await send('post', `/assignments/${id}/turns`, { text: 'x' }, 'spv')).status).toBe(409);
      const bad = await send('post', `/assignments/${id}/consent`, { consentVersion: 'tna-consent-id-v1.0' }, 'spv');
      expect([bad.status, bad.body.error.code]).toEqual([400, 'CONSENT_VERSION_INVALID']);

      fail.question = true;
      const c = await send('post', `/assignments/${id}/consent`, { consentVersion: CONSENT }, 'spv');
      expect(c.status).toBe(200);
      expect(c.body.data.question).toBeNull();
      expect((await get(`/assignments/${id}/session`, 'spv')).body.data).toMatchObject({ step: 'chat', turns: [] });
      expect((await send('post', `/assignments/${id}/turns`, {}, 'spv')).body.error.code).toBe('AI_UNAVAILABLE');
      fail.question = false;
      const q1 = await send('post', `/assignments/${id}/turns`, {}, 'spv');
      expect(q1.body.data.question).toMatchObject({ position: 1, theme: 'vision' });
      expect((await send('post', `/assignments/${id}/turns`, {}, 'spv')).status).toBe(409); // pertanyaan masih menunggu jawaban
      expect((await send('post', `/assignments/${id}/turns`, { text: '  ' }, 'spv')).status).toBe(400);
      expect((await send('post', `/assignments/${id}/turns`, { text: 'x'.repeat(2001) }, 'spv')).status).toBe(400);

      // dua jawaban paralel untuk pertanyaan yang sama: satu diterima, satu 409, tanpa 500
      const both = await Promise.all([1, 2].map(() => send('post', `/assignments/${id}/turns`, { text: 'Saya belum yakin.' }, 'spv')));
      expect(both.map((x) => x.status).sort()).toEqual([200, 409]);

      // AI gagal setelah jawaban: jawaban tetap tersimpan, pertanyaan diminta ulang
      fail.question = true;
      const r = await send('post', `/assignments/${id}/turns`, { text: 'Saya belum yakin.' }, 'spv');
      expect([r.status, r.body.error.code]).toEqual([502, 'AI_UNAVAILABLE']);
      fail.question = false;
      expect((await get(`/assignments/${id}/session`, 'spv')).body.data.answerCount).toBe(2);
      expect((await send('post', `/assignments/${id}/turns`, {}, 'spv')).body.data.question.theme).toBe('values');
      expect((await send('post', `/assignments/${id}/summary`, {}, 'spv')).status).toBe(409); // belum empat jawaban
      for (let i = 0; i < 2; i += 1) await send('post', `/assignments/${id}/turns`, { text: 'Saya belum yakin.' }, 'spv');
      const fifth = await send('post', `/assignments/${id}/turns`, { text: 'kelima' }, 'spv');
      expect([fifth.status, fifth.body.error.code]).toEqual([409, 'INVALID_STATE']);
      expect((await send('post', `/assignments/${id}/turns`, { text: '' }, 'spv')).status).toBe(409);

      fail.summary = true;
      const gagal = await send('post', `/assignments/${id}/summary`, {}, 'spv');
      expect([gagal.status, gagal.body.error.code]).toEqual([502, 'AI_UNAVAILABLE']);
      expect(gagal.body.error.message).not.toMatch(/Bedrock|IAM|region/i);
      expect((await get(`/assignments/${id}/session`, 'spv')).body.data).toMatchObject({ step: 'chat', summary: null });
      fail.summary = false;
      expect((await send('post', `/assignments/${id}/summary`, {}, 'spv')).status).toBe(201);
      expect((await send('post', `/assignments/${id}/summary`, {}, 'spv')).status).toBe(200); // sudah ada: tanpa model
      expect((await send('post', `/assignments/${id}/turns`, { text: 'x' }, 'spv')).body.error.code).toBe('SUMMARY_EXISTS');

      const again = await send('post', `/assignments/${id}/restart`, {}, 'spv');
      expect(again.body.data).toEqual({ restartsLeft: 0 });
      expect((await get(`/assignments/${id}/session`, 'spv')).body.data).toMatchObject({ step: 'chat', turns: [], summary: null });
      expect((await send('post', `/assignments/${id}/restart`, {}, 'spv')).body.error.code).toBe('RESTART_LIMIT');

      expect((await send('post', `/assignments/${id}/turns`, {}, 'spv')).body.data.question.position).toBe(1);
      for (let i = 0; i < 4; i += 1) await send('post', `/assignments/${id}/turns`, { text: 'Saya belum yakin.' }, 'spv');
      await send('post', `/assignments/${id}/summary`, {}, 'spv');
      const confirms = await Promise.all([1, 2].map(() => send('post', `/assignments/${id}/summary/confirm`, {}, 'spv')));
      expect(confirms.map((x) => x.status).sort()).toEqual([200, 409]);
      expect((await send('post', `/assignments/${id}/turns`, { text: 'x' }, 'spv')).status).toBe(409);
      expect((await send('post', `/assignments/${id}/consent`, { consentVersion: CONSENT }, 'spv')).status).toBe(409);
      expect((await get(`/assignments/${id}/session`, 'spv')).body.data.step).toBe('done');

      const audits = await db.query(`SELECT action, resource FROM audit_logs WHERE tenant_id = :t AND meta->>'assignmentId' = :id`,
        { replacements: { t: tenant.id, id }, type: 'SELECT' });
      expect(audits.map((x) => `${x.action} ${x.resource}`)).toEqual(expect.arrayContaining([
        'create cca.interview_consent', 'create cca.interview_summary', 'delete cca.interview_transcript', 'update cca.assignment',
      ]));
    });
  });

  describe('sintesis HR', () => {
    it('angka karyawan baru tampil dari 5 responden dan hanya diperbarui per 5 penyelesaian; gap 20 ditandai; HR mengisi nilai aktual', async () => {
      // spv (pimpinan menengah) sudah selesai di tier pimpinan, jadi bisa menugaskan timnya
      const tim = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'];
      const assigned = await send('post', '/assignments', { assigneeIds: tim.map((k) => u[k]), dueDate: future }, 'spv');
      expect(assigned.body.data.assigned).toHaveLength(9);
      const jawaban = { k1: 'Kolaborasi antar divisi penting.', k2: 'Kolaborasi antar divisi penting.', k3: 'Kolaborasi antar divisi penting.', k4: 'Saya paham vision perusahaan.', k5: 'Saya paham vision perusahaan.' };
      const selesai = async (ks) => { for (const k of ks) await wawancara(k, (await milik(k, 'employee')).id, Array(4).fill(jawaban[k] || 'Saya belum yakin.')); };
      const kolaborasi = async () => (await get('/synthesis', 'hr')).body.data.themes.find((x) => x.requirementId === req.kolaborasi.id);

      // spv (tier karyawan, tes sebelumnya) + k1-k4 = batch pertama; baru 4 yang menyinggung persyaratan: angka disembunyikan
      await selesai(['k1', 'k2', 'k3', 'k4']);
      expect(await kolaborasi()).toMatchObject({ employeeAligned: null, employeeRespondents: '<5', gap: null, hot: false });

      // k5 sudah menyinggung, tetapi batch kedua belum penuh (2 dari 5): angka belum berubah (keputusan user 23 Nov)
      await selesai(['k5', 'k6']);
      expect(await kolaborasi()).toMatchObject({ employeeAligned: null, employeeRespondents: '<5', gap: null });

      await selesai(['k7', 'k8', 'k9']);
      let s = (await get('/synthesis', 'hr')).body.data;
      expect(s.minRespondents).toBe(5);
      expect(s.employeeBatch).toBe(5);
      // pimpinan: direktur setuju (spv tidak menyinggung) = 100; karyawan: 3 sejalan + 2 partial dari 5 = 80
      expect(s.themes.find((x) => x.requirementId === req.kolaborasi.id)).toMatchObject({
        name: 'Kolaborasi lintas tim', sourceTitle: 'Corporate Vision', leaderAgree: 100, leaderRespondents: 1,
        employeeAligned: 80, employeeRespondents: '5–9', gap: 20, hot: true, actualScore: null,
      });
      expect(s.themes.find((x) => x.requirementId === req.pelanggan.id)).toMatchObject({ leaderAgree: 100, employeeAligned: null, gap: null });
      expect(s.themes.map((x) => x.requirementId)).not.toContain(req.draf.id);
      expect(s.kpis).toEqual({ themes: 3, leadersCompleted: 2, employeesCompleted: '10–19' });

      const ap = await send('post', '/synthesis/apply', { requirementIds: [req.kolaborasi.id, req.pelanggan.id, req.draf.id] }, 'hr');
      expect(ap.status).toBe(200);
      expect(ap.body.data.applied).toEqual([{ requirementId: req.kolaborasi.id, previous: { actualScore: null, actualSource: null } }]);
      expect(ap.body.data.skipped.map((x) => x.requirementId)).toEqual([req.pelanggan.id, req.draf.id]);
      const row = (await get('/overview?group=vm', 'hr')).body.data.groups[0].rows.find((x) => x.id === req.kolaborasi.id);
      expect(row).toMatchObject({ actualScore: 80, actualSource: 'synthesis' });
      const again = await send('post', '/synthesis/apply', { requirementIds: [req.kolaborasi.id] }, 'hr');
      expect(again.body.data.applied[0].previous).toEqual({ actualScore: 80, actualSource: 'synthesis' });
      expect((await send('post', '/synthesis/apply', { requirementIds: [] }, 'hr')).status).toBe(400);
    });

    it('hanya HR; tenant lain kosong; pratinjau memakai pertanyaan bawaan tanpa AI', async () => {
      expect((await get('/synthesis', 'spv')).status).toBe(403);
      expect((await send('post', '/synthesis/apply', { requirementIds: [req.kolaborasi.id] }, 'dir')).status).toBe(403);
      expect((await get('/synthesis', 'luar')).body.data.themes).toEqual([]);
      expect((await send('post', '/synthesis/apply', { requirementIds: [req.kolaborasi.id] }, 'luar')).body.data.applied).toEqual([]);

      calls.length = 0;
      const p = (await get('/interview/preview?tier=employee', 'hr')).body.data;
      expect(p.questions.map((q) => q.theme)).toEqual(['vision', 'mission', 'values', 'support']);
      expect(p.questions[0].text).toMatch(/Corporate Vision/);
      expect(p.questions[2].text).toMatch(/Credible/);
      expect(calls).toHaveLength(0);
      expect((await get('/interview/preview?tier=x', 'hr')).status).toBe(400);
      expect((await get('/interview/preview', 'k1')).status).toBe(403);
      expect((await get('/synthesis', 'eta')).status).toBe(200);
    });

    it('penugasan batal: sesi terbaca sebagai cancelled dan semua rute tulis 409; flag mati menutup rute tahap 2', async () => {
      await send('post', '/assignments', { assigneeIds: [u.spv3], dueDate: future }, 'hr');
      const id = (await milik('spv3', 'leader')).id;
      expect((await send('patch', `/assignments/${id}`, { status: 'cancelled' }, 'hr')).status).toBe(200);
      expect((await get(`/assignments/${id}/session`, 'spv3')).body.data.step).toBe('cancelled');
      for (const path of ['consent', 'turns', 'summary', 'summary/confirm', 'restart']) {
        expect((await send('post', `/assignments/${id}/${path}`, { consentVersion: CONSENT, text: 'x' }, 'spv3')).status).toBe(409);
      }

      await db.query("UPDATE feature_flags SET enabled = false WHERE tenant_id = :t AND key = 'cca.interview'", { replacements: { t: tenant.id } });
      try {
        for (const r of [await get(`/assignments/${id}/session`, 'spv3'), await get('/synthesis', 'hr'), await get('/interview/preview', 'hr'),
          await send('post', '/synthesis/apply', { requirementIds: [req.kolaborasi.id] }, 'hr')]) {
          expect([r.status, r.body.error.code]).toEqual([403, 'FEATURE_DISABLED']);
        }
      } finally {
        await db.query("UPDATE feature_flags SET enabled = true WHERE tenant_id = :t AND key = 'cca.interview'", { replacements: { t: tenant.id } });
      }
    });

    it('ekspor karyawan sendiri memuat tema dan sikap; HR tidak; hapus karyawan menghapus giliran dan sikap', async () => {
      const exp = (who) => request(app).get(`/api/employees/${u.k1}/export`).set(as(who));
      const [own] = (await exp('k1')).body.data.coreCompetencies.interviewAssignments;
      expect(own.summary.themes).toHaveLength(4);
      expect(own.summary.stances).toEqual(expect.arrayContaining([{ requirementId: req.kolaborasi.id, stance: 'aligned' }]));
      expect((await exp('hr')).body.data.coreCompetencies.interviewAssignments[0]).not.toHaveProperty('summary');

      const count = async (ids) => (await db.query(
        `SELECT (SELECT count(*) FROM cca_interview_turns WHERE assignment_id IN (:ids))::int AS turns,
                (SELECT count(*) FROM cca_interview_stances WHERE assignment_id IN (:ids))::int AS stances`,
        { replacements: { ids }, type: 'SELECT' }))[0];
      const ids = [own.id];
      expect(await count(ids)).toEqual({ turns: 8, stances: 1 });
      expect((await request(app).delete(`/api/employees/${u.k1}`).set(as('hr')).send({ reason: 'uji' })).status).toBe(200);
      expect(await count(ids)).toEqual({ turns: 0, stances: 0 });
    });
  });
});
