// B6 Wawancara akar masalah: ringkasan temuan diperiksa karyawan sebelum dikirim ke HR, diuji di Postgres
// (docs/designs/b6-wawancara-akar-masalah.md). Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { currentConsentVersion } = require('../../src/core/consent');
const { makeConfig } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const USAGE = (operation) => [{ operation, provider: 'stub', model: 'stub', inputTokens: 0, outputTokens: 0, latencyMs: 0 }];

/**
 * Penyedia AI tiruan yang bisa diatur: `analyze` = antrean hasil analyzeTna (fungsi, Error, atau null = stub),
 * `gate` = janji yang ditunggu sebelum menjawab (untuk menguji balapan).
 */
function scriptedAi({ analyze = [], questionGate = null, analyzeGate = null } = {}) {
  const base = createStubProvider();
  return {
    ...base,
    calls: 0,
    questionGate,
    analyzeGate,
    async nextQuestion(args) {
      if (this.questionGate) await this.questionGate;
      return base.nextQuestion(args);
    },
    async analyzeTna(args) {
      this.calls += 1;
      if (this.analyzeGate) await this.analyzeGate;
      const step = analyze.length ? analyze.shift() : null;
      if (step instanceof Error) throw step;
      if (typeof step === 'function') return { findings: step(args), usage: USAGE('analyze_tna') };
      return base.analyzeTna(args);
    },
  };
}
const deferred = () => { let release; const promise = new Promise((r) => { release = r; }); return { promise, release }; };

run('B6 ringkasan wawancara akar masalah (Postgres)', () => {
  let db; let stores; let tokens; let config; let tenant; let other; let projectId;
  const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const q = (sql, replacements = {}) => db.query(sql, { replacements, type: 'SELECT' });
  const flag = (tenantId, key, enabled) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled)
     ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t: tenantId, key, enabled } },
  );
  const api = (app, sid) => ({
    get: (who) => request(app).get(`/api/tna/sessions/${sid}`).set(as(who)),
    summary: (who) => request(app).post(`/api/tna/sessions/${sid}/summary`).set(as(who)),
    read: (who) => request(app).get(`/api/tna/sessions/${sid}/summary`).set(as(who)),
    confirm: (who, body) => request(app).post(`/api/tna/sessions/${sid}/summary/confirm`).set(as(who)).send(body),
    restart: (who) => request(app).post(`/api/tna/sessions/${sid}/restart`).set(as(who)),
    turn: (who, text) => request(app).post(`/api/tna/sessions/${sid}/turns`).set(as(who)).send({ text }),
    complete: (who) => request(app).post(`/api/tna/sessions/${sid}/complete`).set(as(who)),
    consent: (who) => request(app).post(`/api/tna/sessions/${sid}/consent`).set(as(who)).send({ consentVersion: currentConsentVersion('tna') }),
  });
  const reviewOf = async (app, sid) => (await request(app).get('/api/tna/review').set(as('hr'))).body.data.filter((f) => f.sessionId === sid);
  const turnCount = async (sid) => (await q('SELECT count(*)::int AS n FROM lna_interview_turns WHERE session_id = :sid', { sid }))[0].n;
  const raw = async (sid) => (await q(
    `SELECT status, summary_findings::text AS findings, summary_at AS "summaryAt", summary_confirmed_at AS "confirmedAt", summary_disputed AS disputed,
            summary_note AS note, restart_count AS "restartCount", consent_at AS "consentAt"
       FROM lna_interview_sessions WHERE id = :sid`, { sid }))[0];

  async function addUser(t, key, role, sup = null) {
    const [[row]] = await db.query(
      `INSERT INTO users (tenant_id, email, name, employee_id, role, status, supervisor_id) VALUES (:t, :email, :name, :emp, :role, 'active', :sup) RETURNING id`,
      { replacements: { t, email: `${key}@b6.test`, name: key, emp: `B6-${key}`, role, sup } },
    );
    u[key] = row.id;
    tok[key] = tokens.sign({ id: row.id, tenantId: t, role, email: `${key}@b6.test` });
  }
  async function addRecord(who, name = 'Respons tiket') {
    const [[rec]] = await db.query(
      `INSERT INTO lna_performance_records (tenant_id, project_id, user_id, metric_type, name, target, actual, is_met, period, direction)
       VALUES (:t, :p, :u, 'sla', :name, 85, 70, false, '2026-11', 'higher') RETURNING id`,
      { replacements: { t: tenant.id, p: projectId, u: u[who], name } },
    );
    return rec.id;
  }
  /** Sesi TNA yang sudah berjalan dengan satu jawaban. */
  async function openSession(who, { answered = true, recordIds } = {}) {
    const triggerRecordIds = recordIds || [await addRecord(who)];
    const s = await stores.interviews.create(tenant.id, { projectId, submodule: 'tna', intervieweeId: u[who], triggerRecordIds });
    await stores.interviews.update(tenant.id, s.id, { status: 'in_progress', consentAt: new Date(), startedAt: new Date() });
    await stores.interviews.addTurn(tenant.id, s.id, 'ai', 'Apa penyebab target belum tercapai?');
    if (answered) await stores.interviews.addTurn(tenant.id, s.id, 'human', 'Saya belum paham SLA di kontrak, dan tools tiket lambat.');
    return s.id;
  }

  beforeAll(async () => {
    config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    tokens = createTokenService(config.jwt);
    const mk = async (key) => {
      const [[t]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'B6 uji') RETURNING id`, { replacements: { slug: `b6-${key}-${Date.now()}` } });
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t: t.id } });
      await flag(t.id, 'module.tna', true);
      return t;
    };
    tenant = await mk('a'); other = await mk('b');
    await addUser(tenant.id, 'hr', 'hr_admin');
    await addUser(tenant.id, 'eta', 'eta_admin');
    await addUser(tenant.id, 'spv', 'supervisor');
    for (const k of ['ani', 'beni', 'cici', 'dedi', 'eka', 'fani', 'gita', 'hadi', 'indra', 'joko', 'kiki', 'lia']) await addUser(tenant.id, k, 'learner', u.spv);
    await addUser(other.id, 'hrLain', 'hr_admin');
    await flag(other.id, 'tna.interview_summary', true);
    const [[p]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'B6') RETURNING id`, { replacements: { t: tenant.id } });
    projectId = p.id;
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.close();
  });

  it('flag mati: ringkasan, konfirmasi, dan ulangi 403; /complete lama tetap jalan', async () => {
    const app = createApp({ config, stores });
    const sid = await openSession('ani');
    const a = api(app, sid);
    for (const res of [await a.summary('ani'), await a.read('ani'), await a.confirm('ani'), await a.restart('ani')]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FEATURE_DISABLED');
    }
    expect((await a.complete('ani')).status).toBe(202);
    await app.locals.analysis.drain();
    // sesi selesai tanpa diperiksa karyawan
    expect((await reviewOf(app, sid)).every((f) => f.summaryState === 'unchecked')).toBe(true);
    await flag(tenant.id, 'tna.interview_summary', true);
  });

  it('alur utuh: ringkasan, kunci percakapan, konfirmasi, dan temuan HR sama dengan yang dilihat karyawan', async () => {
    const ai = scriptedAi();
    const app = createApp({ config, stores, ai });
    const sid = await openSession('beni');
    const a = api(app, sid);

    expect((await a.get('beni')).body.data).toMatchObject({ step: 'chat', summaryState: 'not_applicable', answerCount: 1, questionLimit: 8, restartCount: 0, restartsLeft: 2, aiLabel: 'ELGOS-AI' });

    const made = await a.summary('beni');
    expect(made.status).toBe(201);
    expect(made.body.data.state).toBe('pending');
    expect(made.body.data.findings).toHaveLength(2);
    expect(made.body.data.findings[0]).toEqual({ title: 'Kesulitan mencapai target Respons tiket', detail: expect.any(String), category: 'training', confidence: 0.2 });
    expect(JSON.stringify(made.body.data)).not.toMatch(/competencyId|performanceRecordId/);
    expect(ai.calls).toBe(1);
    const row = await raw(sid);
    expect(row.findings).not.toMatch(/Kesulitan|Respons tiket/); // terenkripsi
    expect(row.status).toBe('in_progress');

    // aman diulang: isi sama, tanpa panggilan AI baru
    const again = await a.summary('beni');
    expect(again.status).toBe(200);
    expect(again.body.data.findings).toEqual(made.body.data.findings);
    expect((await a.read('beni')).body.data.findings).toEqual(made.body.data.findings);
    expect(ai.calls).toBe(1);

    const locked = await a.turn('beni', 'Tambahan jawaban');
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('SUMMARY_PENDING');
    const direct = await a.complete('beni');
    expect(direct.status).toBe(409);
    expect(direct.body.error.code).toBe('SUMMARY_REQUIRED');
    expect((await a.get('beni')).body.data).toMatchObject({ step: 'summary', summaryState: 'pending' });

    const sent = await a.confirm('beni', {});
    expect(sent.status).toBe(202);
    expect(sent.body.data).toEqual({ status: 'completed', analysis: { status: 'queued' }, summaryState: 'confirmed' });
    await app.locals.analysis.drain();
    expect(ai.calls).toBe(2); // ringkasan + penilaian kedua

    const hrRows = await reviewOf(app, sid);
    expect(hrRows.map((f) => f.title)).toEqual(made.body.data.findings.map((f) => f.title));
    expect(hrRows.map((f) => f.detail)).toEqual(made.body.data.findings.map((f) => f.detail));
    expect(hrRows.every((f) => f.summaryState === 'confirmed' && f.summaryNote === null && f.reviewStatus === 'draft')).toBe(true);
    for (const k of ['sessionStatus', 'summaryAt', 'summaryConfirmedAt', 'summaryDisputed']) expect(hrRows[0]).not.toHaveProperty(k);

    // karyawan tetap bisa membaca apa yang ia kirim
    const after = await a.read('beni');
    expect(after.status).toBe(200);
    expect(after.body.data).toMatchObject({ state: 'confirmed', confirmedAt: expect.any(String) });
    expect((await a.get('beni')).body.data).toMatchObject({ step: 'done', summaryState: 'confirmed', sessionCode: sid.slice(0, 8).toUpperCase() });
    // sesudah selesai tidak ada jalan lagi
    expect((await a.summary('beni')).status).toBe(409);
    expect((await a.confirm('beni', {})).status).toBe(409);
    expect((await a.restart('beni')).status).toBe(409);

    const audits = await q(`SELECT action, meta FROM audit_logs WHERE tenant_id = :t AND resource = 'tna.interview_summary' AND meta->'objectIds' ? :sid ORDER BY id`, { t: tenant.id, sid });
    expect(audits.map((x) => x.action)).toEqual(expect.arrayContaining(['create', 'read', 'update']));
    expect(audits.find((x) => x.action === 'update').meta).toMatchObject({ decision: 'confirmed', findings: 2 });
  });

  it('privasi: hanya orang yang diwawancarai; peran lain melihat status saja', async () => {
    const app = createApp({ config, stores });
    const sid = await openSession('cici');
    const a = api(app, sid);
    await a.summary('cici').expect(201);
    for (const who of ['hr', 'eta', 'spv']) {
      for (const res of [await a.summary(who), await a.read(who)]) {
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('SUMMARY_PRIVATE');
      }
      for (const res of [await a.confirm(who, {}), await a.restart(who)]) {
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('NOT_INTERVIEWEE');
      }
      const seen = (await a.get(who)).body.data;
      expect(seen).toMatchObject({ step: 'summary', summaryState: 'pending', transcriptVisible: false });
      for (const k of ['summaryFindings', 'summaryNote', 'summaryAt', 'summaryDisputed', 'restartCount', 'answerCount', 'turns']) expect(seen[k]).toBeUndefined();
    }
    // karyawan lain dan tenant lain: sesi tidak terlihat
    for (const who of ['ani', 'hrLain']) {
      for (const res of [await a.summary(who), await a.read(who), await a.confirm(who, {}), await a.restart(who)]) expect(res.status).toBe(404);
    }
    expect((await raw(sid)).status).toBe('in_progress');
  });

  it('AI gagal saat membuat ringkasan: tidak ada yang tersimpan dan bisa diulang; tanpa jawaban 400', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const ai = scriptedAi({ analyze: [Object.assign(new Error('sibuk'), { code: 'AI_THROTTLED' })] });
    const app = createApp({ config, stores, ai });
    const sid = await openSession('dedi');
    const a = api(app, sid);
    expect((await a.summary('dedi')).status).toBeGreaterThanOrEqual(500);
    expect((await raw(sid)).summaryAt).toBeNull();
    expect((await a.read('dedi')).status).toBe(404);
    expect((await a.confirm('dedi', {})).body.error.code).toBe('SUMMARY_MISSING');
    expect((await a.summary('dedi')).status).toBe(201);
    spy.mockRestore();

    const empty = await openSession('dedi', { answered: false });
    expect((await api(app, empty).summary('dedi')).status).toBe(400);
  });

  it('HR menutup sesi orang lain: temuan bertanda tidak diperiksa; HR sebagai peserta tetap lewat ringkasan', async () => {
    const app = createApp({ config, stores });
    const sid = await openSession('eka');
    expect((await api(app, sid).complete('hr')).status).toBe(202);
    await app.locals.analysis.drain();
    const rows = await reviewOf(app, sid);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((f) => f.summaryState === 'unchecked')).toBe(true);

    const own = await openSession('hr');
    const mine = await api(app, own).complete('hr');
    expect(mine.status).toBe(409);
    expect(mine.body.error.code).toBe('SUMMARY_REQUIRED');
  });

  it('ulangi wawancara: jawaban dan ringkasan terhapus, persetujuan diulang, paling banyak dua kali, ditolak bila undangan lewat', async () => {
    const app = createApp({ config, stores });
    const sid = await openSession('fani');
    const a = api(app, sid);
    await a.summary('fani').expect(201);
    const first = await a.restart('fani');
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ status: 'scheduled', restartCount: 1, restartsLeft: 1 });
    expect(await turnCount(sid)).toBe(0);
    expect(await raw(sid)).toMatchObject({ status: 'scheduled', findings: null, summaryAt: null, consentAt: null, restartCount: 1 });
    expect((await a.get('fani')).body.data).toMatchObject({ step: 'consent', restartsLeft: 1, turns: [] });
    expect((await a.turn('fani', 'belum setuju')).status).toBe(409);
    expect((await a.read('fani')).status).toBe(404);
    const [audit] = await q(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND action = 'delete' AND resource = 'tna.interview_transcript' AND meta->'objectIds' ? :sid`, { t: tenant.id, sid });
    expect(audit.meta).toMatchObject({ reason: 'restart', turns: 2, restartCount: 1, employeeIds: [u.fani] });

    // putaran kedua: ulangi sebelum ringkasan dibuat juga boleh
    await a.consent('fani').expect(200);
    await a.turn('fani', 'Jawaban baru tentang SOP').expect(200);
    expect((await a.restart('fani')).body.data).toMatchObject({ restartCount: 2, restartsLeft: 0 });

    // putaran ketiga: undangan lewat menolak sebelum menghapus; jatah habis menolak
    await a.consent('fani').expect(200);
    await a.turn('fani', 'Jawaban terakhir').expect(200);
    const before = await turnCount(sid);
    const limit = await a.restart('fani');
    expect(limit.status).toBe(409);
    expect(limit.body.error.code).toBe('RESTART_LIMIT');
    expect(await turnCount(sid)).toBe(before);

    const sid2 = await openSession('fani');
    await db.query(`UPDATE lna_interview_sessions SET invite_expires_at = now() - interval '1 hour' WHERE id = :sid`, { replacements: { sid: sid2 } });
    const expired = await api(app, sid2).restart('fani');
    expect(expired.status).toBe(409);
    expect(expired.body.error.code).toBe('INVITATION_EXPIRED');
    expect(await turnCount(sid2)).toBe(2);
    // sesi yang undangannya lewat masih bisa dikirim
    await api(app, sid2).summary('fani').expect(201);
    expect((await api(app, sid2).confirm('fani', {})).status).toBe(202);
    await app.locals.analysis.drain();
  });

  it('kirim dengan catatan "tidak sesuai": HR melihat tanda dan catatan; catatan terenkripsi', async () => {
    const app = createApp({ config, stores });
    const sid = await openSession('gita');
    const a = api(app, sid);
    await a.summary('gita').expect(201);
    expect((await a.confirm('gita', { accurate: false })).status).toBe(400);
    expect((await a.confirm('gita', { accurate: false, note: 'pendek' })).status).toBe(400);
    expect((await raw(sid)).status).toBe('in_progress');
    const note = 'Temuan kedua tidak sesuai, saya tidak menyebut tools.';
    const sent = await a.confirm('gita', { accurate: false, note });
    expect(sent.status).toBe(202);
    expect(sent.body.data.summaryState).toBe('disputed');
    await app.locals.analysis.drain();
    const rows = await reviewOf(app, sid);
    expect(rows.length).toBe(2);
    expect(rows.every((f) => f.summaryState === 'disputed' && f.summaryNote === note)).toBe(true);
    const row = await raw(sid);
    expect(row.disputed).toBe(true);
    expect(row.note).not.toContain('tools');
    expect((await a.get('gita')).body.data.summaryState).toBe('disputed');
    expect((await a.get('spv')).body.data).toMatchObject({ summaryState: 'disputed' });
    expect((await a.get('spv')).body.data.summaryNote).toBeUndefined();
  });

  it('dua konfirmasi bersamaan: satu diterima, satu ditolak, satu job', async () => {
    const app = createApp({ config, stores });
    const sid = await openSession('hadi');
    const a = api(app, sid);
    await a.summary('hadi').expect(201);
    const [r1, r2] = await Promise.all([a.confirm('hadi', {}), a.confirm('hadi', {})]);
    expect([r1.status, r2.status].sort()).toEqual([202, 409]);
    await app.locals.analysis.drain();
    expect((await q('SELECT count(*)::int AS n FROM lna_analysis_jobs WHERE session_id = :sid', { sid }))[0].n).toBe(1);
    expect(await reviewOf(app, sid)).toHaveLength(2);
  });

  it('penilaian kedua berbeda: isi dan urutan untuk HR mengikuti ringkasan; hanya keyakinan yang berubah', async () => {
    let recId;
    const ai = scriptedAi({ analyze: [
      ({ triggers }) => { recId = triggers[0].id; return [
        { category: 'non_training', title: 'SOP eskalasi belum diperbarui', detail: 'Karyawan menyebut SOP lama.', confidence: 0.8 },
        { category: 'training', title: 'Belum paham SLA kontrak', detail: 'Karyawan tidak tahu batas waktu.', performanceRecordId: triggers[0].id, confidence: 0.9 },
      ]; },
      ({ triggers }) => [
        { category: 'training', title: 'Judul versi kedua', detail: 'Rincian versi kedua.', performanceRecordId: triggers[0].id, confidence: 0.7 },
        { category: 'training', title: 'Hanya di penilaian kedua', detail: 'x', confidence: 0.9 },
      ],
    ] });
    const app = createApp({ config, stores, ai });
    const sid = await openSession('indra');
    const a = api(app, sid);
    const seen = (await a.summary('indra')).body.data.findings;
    expect(seen.map((f) => f.confidence)).toEqual([0.8, 0.9]);
    await a.confirm('indra', {}).expect(202);
    await app.locals.analysis.drain();
    expect(ai.calls).toBe(2);
    const rows = await reviewOf(app, sid);
    expect(rows.map((f) => [f.category, f.title, f.detail])).toEqual(seen.map((f) => [f.category, f.title, f.detail]));
    expect(rows[0]).toMatchObject({ confidence: 0.4, scoringAgreement: false }); // tidak muncul lagi: setengah
    expect(rows[1]).toMatchObject({ confidence: 0.8, scoringAgreement: true, performanceRecordId: recId }); // rata-rata 0,9 dan 0,7
    const job = (await request(app).get(`/api/tna/sessions/${sid}/analysis`).set(as('hr'))).body.data;
    expect(job.result).toEqual({ findings: 2, agreed: 1, onlySecond: 1 });
  });

  it('balapan: ringkasan ganda, jawaban yang masih menunggu AI, dan ulangi saat ringkasan dibuat', async () => {
    // dua POST /summary bersamaan: satu yang tersimpan, keduanya mengembalikan isi yang sama
    const app = createApp({ config, stores });
    const sid = await openSession('joko');
    const a = api(app, sid);
    const [s1, s2] = await Promise.all([a.summary('joko'), a.summary('joko')]);
    expect([s1.status, s2.status].sort()).toEqual([200, 201]);
    expect(s1.body.data.findings).toEqual(s2.body.data.findings);
    expect(s1.body.data.createdAt).toBe(s2.body.data.createdAt);

    // /turns masih menunggu AI ketika ringkasan selesai dibuat: jawaban itu tidak tersimpan
    const gate = deferred();
    const slowQ = scriptedAi();
    const appQ = createApp({ config, stores, ai: slowQ });
    const sidQ = await openSession('joko');
    slowQ.questionGate = gate.promise;
    const pendingTurn = api(appQ, sidQ).turn('joko', 'Jawaban yang terlambat').then((r) => r);
    await new Promise((r) => setTimeout(r, 100));
    await api(app, sidQ).summary('joko').expect(201);
    gate.release();
    const late = await pendingTurn;
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_STATE');
    expect(await turnCount(sidQ)).toBe(2);

    // /summary masih menunggu AI ketika wawancara diulang: hasilnya dibuang
    const gate2 = deferred();
    const slowA = scriptedAi({ analyzeGate: gate2.promise });
    const appA = createApp({ config, stores, ai: slowA });
    const sidA = await openSession('joko');
    const pendingSummary = api(appA, sidA).summary('joko').then((r) => r);
    await new Promise((r) => setTimeout(r, 100));
    await api(app, sidA).restart('joko').expect(200);
    gate2.release();
    const dropped = await pendingSummary;
    expect(dropped.status).toBe(409);
    expect(await raw(sidA)).toMatchObject({ status: 'scheduled', findings: null, summaryAt: null });

    // jawaban masuk ketika ringkasan sedang dibuat: ringkasan itu dibuang agar karyawan tidak mengonfirmasi ringkasan tanpa jawabannya
    const gate3 = deferred();
    const slowS = scriptedAi({ analyzeGate: gate3.promise });
    const appS = createApp({ config, stores, ai: slowS });
    const sidS = await openSession('joko');
    const pendingS = api(appS, sidS).summary('joko').then((r) => r);
    await new Promise((r) => setTimeout(r, 100));
    expect((await api(app, sidS).turn('joko', 'Tambahan: saya juga belum dilatih tools baru')).status).toBe(200);
    gate3.release();
    const stale = await pendingS;
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('INVALID_STATE');
    expect(await raw(sidS)).toMatchObject({ status: 'in_progress', findings: null, summaryAt: null });
    expect((await api(app, sidS).summary('joko')).status).toBe(201);
  });

  it('durasi 15 menit berhenti di 5 pertanyaan; fokus kompetensi muncul di pertanyaan pembuka', async () => {
    const app = createApp({ config, stores });
    const recordIds = [];
    for (let i = 1; i <= 6; i += 1) recordIds.push(await addRecord('kiki', `Target ${i}`));
    const s = await stores.interviews.create(tenant.id, { projectId, submodule: 'tna', intervieweeId: u.kiki, triggerRecordIds: recordIds });
    await db.query(`UPDATE lna_interview_sessions SET duration_minutes = 15 WHERE id = :id`, { replacements: { id: s.id } });
    const a = api(app, s.id);
    expect((await a.consent('kiki')).body.data.question.text).toMatch(/Target 1/);
    let asked = 1; let done = false;
    while (!done && asked < 12) {
      const res = await a.turn('kiki', `Jawaban ${asked}`);
      expect(res.status).toBe(200);
      done = res.body.data.done;
      if (!done) asked += 1;
    }
    expect(asked).toBe(5);
    expect((await a.get('kiki')).body.data).toMatchObject({ questionLimit: 5, answerCount: 5, durationMinutes: 15 });

    const f = await stores.interviews.create(tenant.id, { projectId, submodule: 'tna', intervieweeId: u.kiki, triggerRecordIds: [] });
    await db.query(`UPDATE lna_interview_sessions SET focus_kind = 'competency', focus_label = 'Analisis insiden', duration_minutes = 30 WHERE id = :id`, { replacements: { id: f.id } });
    expect((await api(app, f.id).consent('kiki')).body.data.question.text).toMatch(/Analisis insiden/);
  });

  it('kompetensi dihapus di antara ringkasan dan konfirmasi: job tetap selesai, tautan dikosongkan', async () => {
    const [[comp]] = await db.query(`INSERT INTO lna_competencies (tenant_id, kind, name) VALUES (:t, 'core', 'Sementara') RETURNING id`, { replacements: { t: tenant.id } });
    const finding = () => [{ category: 'training', title: 'Perlu pelatihan', detail: 'rincian', competencyId: comp.id, confidence: 0.6 }];
    const ai = scriptedAi({ analyze: [finding, finding] });
    const app = createApp({ config, stores, ai });
    const sid = await openSession('lia');
    const a = api(app, sid);
    await a.summary('lia').expect(201);
    await db.query('DELETE FROM lna_competencies WHERE id = :id', { replacements: { id: comp.id } });
    await a.confirm('lia', {}).expect(202);
    await app.locals.analysis.drain();
    expect((await stores.analysis.forSession(tenant.id, sid)).status).toBe('done');
    const rows = await reviewOf(app, sid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'Perlu pelatihan', competencyId: null, scoringAgreement: true });
  });

  it('flag dimatikan setelah ringkasan dibuat: percakapan tetap terkunci, /complete lama menutup tanpa konfirmasi', async () => {
    const ai = scriptedAi();
    const app = createApp({ config, stores, ai });
    const sid = await openSession('lia');
    const a = api(app, sid);
    await a.summary('lia').expect(201);
    await flag(tenant.id, 'tna.interview_summary', false);
    expect((await a.turn('lia', 'tambahan')).body.error.code).toBe('SUMMARY_PENDING');
    expect((await a.confirm('lia', {})).status).toBe(403);
    expect((await a.complete('lia')).status).toBe(202);
    await app.locals.analysis.drain();
    expect(ai.calls).toBe(3); // ringkasan + dua penilaian (ringkasan tidak dikonfirmasi)
    expect((await reviewOf(app, sid)).every((f) => f.summaryState === 'unchecked')).toBe(true);
    await flag(tenant.id, 'tna.interview_summary', true);
  });

  it('sesi DNA tidak punya langkah ringkasan', async () => {
    await flag(tenant.id, 'module.dna', true);
    await flag(tenant.id, 'dna.ai_interview', true);
    const app = createApp({ config, stores });
    const s = await stores.interviews.create(tenant.id, { projectId, submodule: 'dna', intervieweeId: u.ani });
    expect((await request(app).post(`/api/dna/sessions/${s.id}/summary`).set(as('ani'))).status).toBe(404);
    expect((await request(app).post(`/api/dna/sessions/${s.id}/restart`).set(as('ani'))).status).toBe(404);
    expect((await request(app).get(`/api/dna/sessions/${s.id}`).set(as('ani'))).body.data).toMatchObject({ step: 'consent', summaryState: 'not_applicable' });
  });
});
