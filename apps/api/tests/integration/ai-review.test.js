// PK-14: review hasil AI oleh HR (PD-14 ★A, PD-13 ★A, PM-3 ★A, PM-5 ★A).
// Bukti selesai: temuan draf tersembunyi dari atasan, karyawan, dan dashboard; permintaan ganda tidak
// menggandakan temuan; job analisis aman diulang; jejak review tercatat.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

/** Penyedia AI tiruan yang hasil analisis TNA-nya diatur per panggilan. */
function scriptedAi(plan) {
  const base = createStubProvider();
  const usage = [{ operation: 'analyze_tna', provider: 'stub', model: 'stub', inputTokens: 0, outputTokens: 0, latencyMs: 0 }];
  return {
    ...base,
    calls: 0,
    async analyzeTna(args) {
      this.calls += 1;
      const step = plan.length ? plan.shift() : null;
      if (step instanceof Error) throw step;
      if (typeof step === 'function') return { findings: step(args), usage };
      return base.analyzeTna(args);
    },
  };
}

run('PK-14 review hasil AI (Postgres)', () => {
  let db; let stores; let tokens; let config; let tenant; let projectId; let recordId; const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });

  beforeAll(async () => {
    config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    tokens = sessionSigner(config, stores.authSessions);
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Review uji') RETURNING id`, { replacements: { slug: `rv-${Date.now()}` } });
    const add = async (key, role) => {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, :email, :name, :emp, :role, 'active') RETURNING id`,
        { replacements: { t: tenant.id, email: `${key}@rv.test`, name: key, emp: `E-${key}`, role } },
      );
      u[key] = row.id;
      tok[key] = await tokens.sign({ id: row.id, tenantId: tenant.id, role, email: `${key}@rv.test` });
    };
    await add('hr', 'hr_admin');
    await add('spv', 'supervisor');
    await add('ani', 'learner');
    await add('beni', 'learner');
    await db.query('UPDATE users SET supervisor_id = :spv WHERE id IN (:ids)', { replacements: { spv: u.spv, ids: [u.ani, u.beni] } });
    await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t: tenant.id } });
    await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'module.tna', true), (:t, 'tna.training_request', true)`, { replacements: { t: tenant.id } });
    const [[p]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'Review') RETURNING id`, { replacements: { t: tenant.id } });
    projectId = p.id;
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id = :id', { replacements: { id: tenant.id }, transaction });
    });
    await db.close();
  });

  /** Sesi TNA yang sudah berjalan dengan satu jawaban, siap ditutup. */
  async function openSession(who) {
    const [[rec]] = await db.query(
      `INSERT INTO lna_performance_records (tenant_id, project_id, user_id, metric_type, name, target, actual, is_met, period, direction)
       VALUES (:t, :p, :u, 'sla', 'Respons tiket', 85, 70, false, '2026-11', 'higher') RETURNING id`,
      { replacements: { t: tenant.id, p: projectId, u: u[who] } },
    );
    recordId = rec.id;
    const s = await stores.interviews.create(tenant.id, { projectId, submodule: 'tna', intervieweeId: u[who], triggerRecordIds: [rec.id] });
    await stores.interviews.update(tenant.id, s.id, { status: 'in_progress', consentAt: new Date(), startedAt: new Date() });
    await stores.interviews.addTurn(tenant.id, s.id, 'ai', 'Apa penyebab target belum tercapai?');
    await stores.interviews.addTurn(tenant.id, s.id, 'human', 'Saya belum paham SLA di kontrak, dan tools tiket lambat.');
    return s.id;
  }
  const countFindings = async (sid) => (await db.query('SELECT count(*)::int AS n FROM lna_findings WHERE session_id = :sid', { replacements: { sid }, type: 'SELECT' }))[0].n;

  let sid; let draft;

  it('permintaan ganda menutup sesi sekali; job diulang tidak menggandakan temuan', async () => {
    const app = createApp({ config, stores });
    sid = await openSession('ani');
    const [a, b] = await Promise.all([
      request(app).post(`/api/tna/sessions/${sid}/complete`).set(as('ani')),
      request(app).post(`/api/tna/sessions/${sid}/complete`).set(as('ani')),
    ]);
    expect([a.status, b.status].sort()).toEqual([202, 409]);
    await app.locals.analysis.drain();
    const first = await countFindings(sid);
    expect(first).toBe(2); // satu training + satu non-training (stub)

    // job yang sama diproses lagi, lewat penyapu, dan lewat enqueue ulang: tidak ada temuan tambahan
    const job = await stores.analysis.forSession(tenant.id, sid);
    expect(job).toMatchObject({ status: 'done', attempts: 1 });
    expect(await app.locals.analysis.processJob(tenant.id, job.id)).toEqual({ skipped: true });
    await stores.analysis.enqueue(tenant.id, { sessionId: sid, submodule: 'tna' });
    await app.locals.analysis.sweep();
    expect(await countFindings(sid)).toBe(first);
    const [[{ n }]] = await db.query('SELECT count(*)::int AS n FROM lna_analysis_jobs WHERE session_id = :sid', { replacements: { sid } });
    expect(n).toBe(1);
  });

  it('PM-5: draf tidak terlihat karyawan, atasan, HR di luar antrean, Pareto, dan dashboard', async () => {
    const app = createApp({ config, stores });
    for (const who of ['ani', 'spv', 'hr']) {
      expect((await request(app).get('/api/tna/findings').set(as(who))).body.data).toHaveLength(0);
    }
    expect((await request(app).get('/api/tna/pareto').set(as('spv'))).body.data).toHaveLength(0);
    const dashSpv = (await request(app).get('/api/tna/dashboard').set(as('spv'))).body.data;
    expect(dashSpv.trainingFindings).toBe(0);
    expect(dashSpv.reviewPending).toBeUndefined();
    const dashHr = (await request(app).get('/api/tna/dashboard').set(as('hr'))).body.data;
    expect(dashHr).toMatchObject({ trainingFindings: 0, reviewPending: 2 });

    // antrean hanya untuk HR
    expect((await request(app).get('/api/tna/review').set(as('spv'))).status).toBe(403);
    expect((await request(app).get('/api/tna/review').set(as('ani'))).status).toBe(403);
    const q = await request(app).get('/api/tna/review').set(as('hr'));
    expect(q.status).toBe(200);
    expect(q.body.counts).toMatchObject({ draft: 2, approved: 0 });
    draft = q.body.data.find((f) => f.category === 'training');
    expect(draft).toMatchObject({ reviewStatus: 'draft', userName: 'ani', metricName: 'Respons tiket', scoringAgreement: true, confidence: 0.2 });
    expect(draft.title).not.toMatch(/^enc:/);

    // rencana dan permintaan training tidak bisa dibuat dari draf
    const plan = await request(app).post(`/api/tna/findings/${draft.id}/plan`).set(as('hr')).send({});
    expect(plan.status).toBe(409);
    expect(plan.body.error.code).toBe('REVIEW_PENDING');
    expect((await request(app).post('/api/tna/training-requests').set(as('ani')).send({ findingId: draft.id })).status).toBe(404);
  });

  it('PD-14: HR menyetujui, mengubah, atau menolak; jejak siapa dan kapan; versi asli AI disimpan', async () => {
    const app = createApp({ config, stores });
    expect((await request(app).post(`/api/tna/findings/${draft.id}/review`).set(as('spv')).send({ decision: 'approve' })).status).toBe(403);
    expect((await request(app).post(`/api/tna/findings/${draft.id}/review`).set(as('hr')).send({ decision: 'ok' })).status).toBe(400);
    const originalTitle = draft.title;
    const edited = await request(app).post(`/api/tna/findings/${draft.id}/review`).set(as('hr'))
      .send({ decision: 'edit', title: 'Belum memahami batas SLA di kontrak pelanggan', note: 'Diperjelas' });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      reviewStatus: 'edited', title: 'Belum memahami batas SLA di kontrak pelanggan', originalTitle, reviewedBy: u.hr, reviewedByName: 'hr', reviewNote: 'Diperjelas',
    });
    expect(edited.body.data.reviewedAt).toBeTruthy();
    const again = await request(app).post(`/api/tna/findings/${draft.id}/review`).set(as('hr')).send({ decision: 'approve' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_REVIEWED');

    const other = (await request(app).get('/api/tna/review').set(as('hr'))).body.data[0];
    expect(other.category).toBe('non_training');
    expect((await request(app).post(`/api/tna/findings/${other.id}/review`).set(as('hr')).send({ decision: 'reject' })).status).toBe(400); // alasan wajib
    const rejected = await request(app).post(`/api/tna/findings/${other.id}/review`).set(as('hr')).send({ decision: 'reject', note: 'Bukan kendala nyata' });
    expect(rejected.body.data.reviewStatus).toBe('rejected');

    // tersimpan terenkripsi, termasuk versi asli dan catatan
    const [raw] = await db.query('SELECT title, original_title AS "o", review_note AS "n" FROM lna_findings WHERE id = :id', { replacements: { id: draft.id }, type: 'SELECT' });
    expect([raw.title, raw.o, raw.n].every((v) => v.startsWith('enc:v1:'))).toBe(true);

    // audit tulis untuk setiap putusan
    const logs = await db.query(`SELECT action, meta FROM audit_logs WHERE tenant_id = :t AND resource = 'tna.finding_review' ORDER BY id`, { replacements: { t: tenant.id }, type: 'SELECT' });
    expect(logs.map((l) => l.meta.decision)).toEqual(['edited', 'rejected']);
    expect(logs[0].meta.employeeIds).toEqual([u.ani]);

    // sesudah review: yang disetujui terlihat karyawan dan atasan, yang ditolak tidak
    const mine = (await request(app).get('/api/tna/findings').set(as('ani'))).body.data;
    expect(mine.map((f) => f.title)).toEqual(['Belum memahami batas SLA di kontrak pelanggan']);
    expect((await request(app).get('/api/tna/findings').set(as('spv'))).body.data).toHaveLength(1);
    expect((await request(app).get('/api/tna/dashboard').set(as('hr'))).body.data).toMatchObject({ trainingFindings: 1, reviewPending: 0 });
    expect((await request(app).post(`/api/tna/findings/${draft.id}/plan`).set(as('hr')).send({})).status).toBe(201);
  });

  it('PD-13: dua kali penilaian; yang tidak muncul lagi diberi keyakinan setengah', async () => {
    const ai = scriptedAi([
      ({ triggers }) => [
        { category: 'training', title: 'SLA', competencyId: null, performanceRecordId: triggers[0].id, confidence: 0.9 },
        { category: 'non_training', title: 'Tools', confidence: 0.8 },
      ],
      ({ triggers }) => [{ category: 'training', title: 'SLA lagi', competencyId: null, performanceRecordId: triggers[0].id, confidence: 0.7 }],
    ]);
    const app = createApp({ config, stores, ai });
    const s2 = await openSession('beni');
    expect((await request(app).post(`/api/tna/sessions/${s2}/complete`).set(as('beni'))).status).toBe(202);
    await app.locals.analysis.drain();
    expect(ai.calls).toBe(2);
    const rows = (await request(app).get(`/api/tna/review`).set(as('hr'))).body.data.filter((f) => f.sessionId === s2);
    expect(rows.find((f) => f.category === 'training')).toMatchObject({ confidence: 0.8, scoringAgreement: true, title: 'SLA', performanceRecordId: recordId });
    expect(rows.find((f) => f.category === 'non_training')).toMatchObject({ confidence: 0.4, scoringAgreement: false });
    const job = (await request(app).get(`/api/tna/sessions/${s2}/analysis`).set(as('hr'))).body.data;
    expect(job.result).toEqual({ findings: 2, agreed: 1, onlySecond: 0 });
  });

  it('job gagal tidak menyimpan apa pun, diulang otomatis, lalu HR bisa mengulang setelah batas percobaan', async () => {
    const boom = () => Object.assign(new Error('sibuk'), { code: 'AI_THROTTLED' });
    const ai = scriptedAi([boom(), null, null, boom(), boom(), boom()]);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp({ config, stores, ai });

    const s3 = await openSession('ani');
    await stores.interviews.close(tenant.id, s3);
    const job = await stores.analysis.enqueue(tenant.id, { sessionId: s3, submodule: 'tna' });
    expect(await app.locals.analysis.processJob(tenant.id, job.id)).toEqual({ failed: true, code: 'AI_THROTTLED' });
    expect(await countFindings(s3)).toBe(0);
    let state = await stores.analysis.forSession(tenant.id, s3);
    expect(state).toMatchObject({ status: 'failed', attempts: 1, lastError: 'AI_THROTTLED' });
    // karyawan hanya melihat status, bukan kode galat
    expect((await request(app).get(`/api/tna/sessions/${s3}/analysis`).set(as('ani'))).body.data).toEqual({ status: 'failed' });

    // belum waktunya diulang: penyapu tidak menjalankan
    expect(await app.locals.analysis.sweep()).toBe(0);
    await db.query('UPDATE lna_analysis_jobs SET locked_until = now() - interval \'1 second\' WHERE id = :id', { replacements: { id: job.id } });
    expect(await app.locals.analysis.sweep()).toBe(1);
    state = await stores.analysis.forSession(tenant.id, s3);
    expect(state).toMatchObject({ status: 'done', attempts: 2 });
    expect(await countFindings(s3)).toBe(2);

    // sesi lain: tiga percobaan gagal -> berhenti otomatis, HR mengulang manual
    const s4 = await openSession('beni');
    await stores.interviews.close(tenant.id, s4);
    const j4 = await stores.analysis.enqueue(tenant.id, { sessionId: s4, submodule: 'tna' });
    for (let i = 0; i < 3; i += 1) {
      await db.query('UPDATE lna_analysis_jobs SET locked_until = now() - interval \'1 second\' WHERE id = :id AND locked_until IS NOT NULL', { replacements: { id: j4.id } });
      await app.locals.analysis.processJob(tenant.id, j4.id);
    }
    state = await stores.analysis.forSession(tenant.id, s4);
    expect(state).toMatchObject({ status: 'failed', attempts: 3 });
    expect(await app.locals.analysis.sweep()).toBe(0);
    expect((await request(app).post(`/api/tna/sessions/${s4}/analysis/retry`).set(as('ani'))).status).toBe(403);
    expect((await request(app).post(`/api/tna/sessions/${s4}/analysis/retry`).set(as('hr'))).status).toBe(202);
    await app.locals.analysis.drain();
    expect(await stores.analysis.forSession(tenant.id, s4)).toMatchObject({ status: 'done', attempts: 1 });
    expect((await request(app).post(`/api/tna/sessions/${s4}/analysis/retry`).set(as('hr'))).status).toBe(409); // sudah selesai
    // log galat hanya memuat kode, bukan isi transkrip
    expect(spy.mock.calls.flat().join(' ')).not.toMatch(/SLA di kontrak/);
    spy.mockRestore();
  });
});
