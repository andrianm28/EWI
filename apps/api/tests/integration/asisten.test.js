// B17 Asisten ELGOS: jawaban dari fakta yang boleh dilihat peran penanya. Model hanya melihat kode samaran.
// Spek: docs/designs/b17-asisten-elgos.md
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { AiError } = require('../../src/ai/errors');
const { runJob } = require('../../src/jobs');
const { makeConfig } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('B17 Asisten ELGOS (Postgres)', () => {
  let db; let stores; let tokens; let config; let tenant; let other; let projectId; let roleId; let compSla; let compKom;
  const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const setFlag = (key, enabled, t = tenant.id) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled)
     ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t, key, enabled } });
  const sql = async (q, replacements) => db.query(q, { replacements, type: 'SELECT' });
  const resetLogs = () => db.query('DELETE FROM assistant_logs WHERE tenant_id IN (:ids)', { replacements: { ids: [tenant.id, other.id] } });

  /** Penyedia perekam: menyimpan argumen tiap panggilan; jawaban bisa diganti per test. */
  function recorder(reply) {
    const base = createStubProvider();
    const ai = {
      ...base,
      calls: [],
      async assistantReply(args) {
        ai.calls.push(args);
        if (reply) return reply(args);
        return base.assistantReply(args);
      },
    };
    return ai;
  }
  const app = (ai) => createApp({ config, stores, ai });
  const ask = (a, who, question, view) => request(a).post('/api/assistant/ask').set(as(who)).send({ question, view });

  beforeAll(async () => {
    config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    tokens = createTokenService(config.jwt);
    const stamp = Date.now();
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Asisten uji') RETURNING id`, { replacements: { slug: `b17-${stamp}` } });
    [[other]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Tenant lain') RETURNING id`, { replacements: { slug: `b17x-${stamp}` } });
    const add = async (key, role, name, t = tenant.id) => {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, :email, :name, :emp, :role, 'active') RETURNING id`,
        { replacements: { t, email: `${key}@b17.test`, name, emp: `E-${key}`, role } },
      );
      u[key] = row.id;
      tok[key] = tokens.sign({ id: row.id, tenantId: t, role, email: `${key}@b17.test` });
    };
    await add('hr', 'hr_admin', 'Hana HR'); await add('spv', 'supervisor', 'Sari Atasan'); await add('sme', 'sme', 'Sena SME');
    await add('ani', 'learner', 'Ani Lestari'); await add('beni', 'learner', 'Beni Saputra'); await add('dodi', 'learner', 'Dodi Luar');
    await add('xhr', 'hr_admin', 'Xena Lain', other.id); await add('xl', 'learner', 'Xavi Lain', other.id);
    await db.query('UPDATE users SET supervisor_id = :spv WHERE id IN (:ids)', { replacements: { spv: u.spv, ids: [u.ani, u.beni] } });
    for (const t of [tenant.id, other.id]) {
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t } });
      for (const key of ['assistant', 'module.tna', 'module.dna', 'module.ina', 'learner.home', 'tna.review_workspace']) await setFlag(key, true, t);
    }
    [[{ id: projectId }]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'B17') RETURNING id`, { replacements: { t: tenant.id } });
    [[{ id: roleId }]] = await db.query(`INSERT INTO lna_job_roles (tenant_id, name) VALUES (:t, 'Service Delivery L1') RETURNING id`, { replacements: { t: tenant.id } });
    await db.query('UPDATE users SET job_role_id = :r WHERE id IN (:ids)', { replacements: { r: roleId, ids: [u.ani, u.beni] } });
    [[{ id: compSla }]] = await db.query(`INSERT INTO lna_competencies (tenant_id, job_role_id, kind, name, required_score) VALUES (:t, :r, 'job', 'Pemahaman SLA', 4) RETURNING id`, { replacements: { t: tenant.id, r: roleId } });
    [[{ id: compKom }]] = await db.query(`INSERT INTO lna_competencies (tenant_id, job_role_id, kind, name, required_score) VALUES (:t, :r, 'job', 'Komunikasi', 3) RETURNING id`, { replacements: { t: tenant.id, r: roleId } });
    await stores.dna.addAssessment(tenant.id, { userId: u.ani, competencyId: compKom, score: 1, evidence: 'BUKTI-RAHASIA', source: 'manual_interview' });

    // Sesi: ani selesai (dengan transkrip), beni terjadwal, dodi (bukan tim spv) selesai
    const sess = async (who, status) => {
      const s = await stores.interviews.create(tenant.id, { projectId, submodule: 'tna', intervieweeId: u[who] });
      if (status !== 'scheduled') {
        await db.query(`UPDATE lna_interview_sessions SET status = 'in_progress', consent_at = now(), started_at = now() WHERE id = :id`, { replacements: { id: s.id } });
        await stores.interviews.addTurn(tenant.id, s.id, 'human', `TRANSKRIP-${who}`);
        await db.query(`UPDATE lna_interview_sessions SET status = :status, ended_at = now() WHERE id = :id`, { replacements: { id: s.id, status } });
      }
      return s.id;
    };
    await sess('ani', 'completed'); await sess('beni', 'scheduled'); await sess('dodi', 'completed');
    const finding = (who, over) => stores.tna.insertFinding(tenant.id, { projectId, userId: u[who], category: 'training', title: `TEMUAN-${who}`, reviewStatus: 'approved', ...over });
    await finding('ani', { competencyId: compSla }); await finding('beni', { competencyId: compSla }); await finding('beni', { competencyId: compKom });
    await finding('dodi', { competencyId: compKom });
    await finding('dodi', { competencyId: compKom, reviewStatus: 'draft' });
    await finding('dodi', { category: 'non_training', title: 'NONTRAIN-dodi' });
    await stores.tna.insertPlanItem(tenant.id, { userId: u.ani, origin: 'hr', status: 'new', catalogSource: 'moodle', catalogItemRef: 'SLA-101', catalogItemTitle: 'Dasar SLA' });
    await stores.tna.insertPlanItem(tenant.id, { userId: u.beni, origin: 'hr', status: 'in_progress', catalogItemTitle: 'Rahasia Beni' });
    await stores.dataRequests.createDelete(tenant.id, u.dodi, 'alasan');
    // Tenant lain punya data yang tidak boleh memengaruhi angka
    const [[{ id: xp }]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'X') RETURNING id`, { replacements: { t: other.id } });
    await stores.tna.insertFinding(other.id, { projectId: xp, userId: u.xl, category: 'training', title: 'X', reviewStatus: 'draft' });
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.close();
  });

  beforeEach(resetLogs);

  it('flag mati -> 403; GET mengembalikan salam, saran, dan tampilan yang boleh', async () => {
    await setFlag('assistant', false);
    expect((await request(app()).get('/api/assistant').set(as('ani'))).body.error.code).toBe('FEATURE_DISABLED');
    await setFlag('assistant', true);
    const res = await request(app()).get('/api/assistant').set(as('spv'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ view: 'atasan', roleLabel: 'Atasan', views: [{ key: 'atasan' }, { key: 'karyawan' }] });
    expect(res.body.data.greeting).toContain('Asisten ELGOS');
    expect(res.body.data.disclaimer).toContain('log audit');
    expect(res.body.data.suggestions).toContain('Bagaimana status wawancara tim saya?');
  });

  it('tampilan: karyawan tidak boleh hr, tak dikenal 400, sme -> karyawan', async () => {
    expect((await request(app()).get('/api/assistant?view=hr').set(as('ani'))).body.error.code).toBe('VIEW_FORBIDDEN');
    expect((await ask(app(), 'ani', 'halo', 'super')).status).toBe(400);
    expect((await request(app()).get('/api/assistant').set(as('sme'))).body.data.view).toBe('karyawan');
    expect((await ask(app(), 'ani', '   ')).status).toBe(400);
    expect((await ask(app(), 'ani', 'x'.repeat(501))).status).toBe(400);
  });

  it('karyawan: fakta hanya data sendiri, tanpa nama/id/transkrip/bukti; tombol Rencana belajar', async () => {
    const ai = recorder();
    const res = await ask(app(ai), 'ani', 'Apa rencana belajar saya?');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ outcome: 'answered', action: { page: 'li', label: 'Rencana belajar' } });
    expect(res.body.data.answer).toContain('Dasar SLA');
    const sent = JSON.stringify(ai.calls[0]);
    for (const leak of ['Ani Lestari', 'Beni', u.ani, u.beni, '@b17.test', 'TRANSKRIP', 'BUKTI-RAHASIA', 'TEMUAN-beni', 'Rahasia Beni']) expect(sent).not.toContain(leak);
    expect(Object.keys(ai.calls[0].facts).sort()).toEqual(['kompetensiSaya', 'rencanaSaya', 'saya', 'undanganSaya']);
    expect(ai.calls[0].facts.kompetensiSaya.weakest).toContain('Komunikasi');

    await setFlag('learner.home', false);
    const ai2 = recorder();
    await ask(app(ai2), 'ani', 'Apa rencana belajar saya?');
    expect(Object.keys(ai2.calls[0].facts)).toEqual(['saya']);
    await setFlag('learner.home', true);
  });

  it('penolakan pasti: tanpa panggilan model, tetap tercatat', async () => {
    const ai = recorder();
    const res = await ask(app(ai), 'ani', 'berapa skor Karyawan B');
    expect(res.body.data.outcome).toBe('refused');
    expect(res.body.data.answer).toContain('data pribadi orang lain');
    expect(ai.calls).toHaveLength(0);
    const [log] = await sql('SELECT outcome FROM assistant_logs WHERE user_id = :id', { id: u.ani });
    expect(log.outcome).toBe('refused');
  });

  it('atasan: hanya tim sendiri, model melihat kode samaran, jawaban memuat nama asli, audit = tim', async () => {
    const ai = recorder();
    const res = await ask(app(ai), 'spv', 'Bagaimana status wawancara tim saya?');
    expect(res.status).toBe(200);
    const facts = ai.calls[0].facts;
    expect(facts.wawancaraTim).toMatchObject({ members: 2, byStatus: { completed: 1, scheduled: 1 }, notCompleted: ['K1'] });
    expect(facts.gapTim.top).toEqual([{ competency: 'Pemahaman SLA', employees: 2 }, { competency: 'Komunikasi', employees: 1 }]);
    expect(facts.rencanaTim.byStatus).toEqual({ new: 1, in_progress: 1 });
    const sent = JSON.stringify(ai.calls[0]);
    for (const leak of ['Beni', 'Ani', 'Dodi', u.beni, 'TEMUAN']) expect(sent).not.toContain(leak);
    expect(res.body.data.answer).toContain('Beni Saputra');
    expect(res.body.data.action).toEqual({ page: 'aiv', label: 'Wawancara AI' });
    const [a] = await sql(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'assistant.answer' ORDER BY id DESC LIMIT 1`, { t: tenant.id });
    expect(a.meta.employeeIds.sort()).toEqual([u.ani, u.beni].sort());
    expect(a.meta.view).toBe('atasan');
    expect(JSON.stringify(a.meta)).not.toContain('status wawancara');
  });

  it('HR: angka cocok dengan data uji, tenant lain tidak ikut; perbaikan hilang bila flag mati', async () => {
    const ai = recorder(() => ({ answer: 'Ada pekerjaan.', page: 'ina', refused: false, usage: [] }));
    const res = await ask(app(ai), 'hr', 'Apa yang perlu saya lakukan hari ini?');
    const f = ai.calls[0].facts;
    expect(f.tinjauan).toMatchObject({ draft: 1, held: 0, targetDays: 2 });
    expect(f.wawancara.byStatus).toEqual({ completed: 2, scheduled: 1 });
    expect(f.gap.top).toEqual([{ competency: 'Komunikasi', employees: 2 }, { competency: 'Pemahaman SLA', employees: 2 }]);
    expect(f.rencana).toMatchObject({ byStatus: { new: 1, in_progress: 1 }, needsModule: 1 });
    expect(f.perbaikan).toEqual({ decided: 1, handedOff: 0 });
    expect(f.permintaanData).toEqual({ open: { delete_data: 1 }, overdue: 0 });
    expect(res.body.data.action).toEqual({ page: 'ina', label: 'Improvement Needs' });

    await setFlag('module.ina', false);
    const ai2 = recorder(() => ({ answer: 'Ada pekerjaan.', page: 'ina', refused: false, usage: [] }));
    const res2 = await ask(app(ai2), 'hr', 'Apa yang perlu saya lakukan hari ini?');
    expect(ai2.calls[0].facts.perbaikan).toBeUndefined();
    expect(ai2.calls[0].pages.map((p) => p.key)).not.toContain('ina');
    expect(res2.body.data.action).toBeNull();
    await setFlag('module.ina', true);

    const ai3 = recorder();
    await ask(app(ai3), 'hr', 'Gap terbesar apa?', 'karyawan');
    // HR di tampilan karyawan hanya melihat datanya sendiri (kosong), bukan angka tenant
    const own = ai3.calls[0].facts;
    expect(own.gap).toBeUndefined();
    expect(own.rencanaSaya).toEqual({ total: 0, items: [] });
    expect(own.undanganSaya.open).toBe(0);
  });

  it('answer null -> teks pengganti dan no_answer', async () => {
    const res = await ask(app(recorder()), 'ani', 'cuaca besok bagaimana');
    expect(res.body.data).toMatchObject({ outcome: 'no_answer', action: null });
    expect(res.body.data.answer).toContain('Saya belum menemukan jawaban pasti');
  });

  it('log terenkripsi, audit tanpa teks, pemakaian AI tercatat, ekspor memuat assistantLogs', async () => {
    await ask(app(recorder()), 'ani', 'Apa rencana belajar saya?');
    const [log] = await sql('SELECT id, question, answer, outcome, fact_keys AS "factKeys" FROM assistant_logs WHERE user_id = :id', { id: u.ani });
    expect(log.question).not.toContain('rencana');
    expect(log.answer).not.toContain('Dasar SLA');
    expect(log.factKeys).toContain('rencanaSaya');
    const [a] = await sql(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'assistant.answer' ORDER BY id DESC LIMIT 1`, { t: tenant.id });
    expect(a.meta).toMatchObject({ logId: log.id, view: 'karyawan', outcome: 'answered', employeeIds: [u.ani], self: true });
    const [usage] = await sql(`SELECT submodule, operation, user_id AS "userId" FROM ai_usage_logs WHERE tenant_id = :t AND operation = 'assistant_reply' ORDER BY id DESC LIMIT 1`, { t: tenant.id });
    expect(usage).toEqual({ submodule: 'assistant', operation: 'assistant_reply', userId: u.ani });
    const exp = await request(app()).get(`/api/employees/${u.ani}/export`).set(as('ani'));
    expect(exp.body.data.assistantLogs[0]).toMatchObject({ question: 'Apa rencana belajar saya?', outcome: 'answered', view: 'karyawan' });
  });

  it('batas pakai 20 per 10 menit termasuk yang gagal; penyedia gagal -> 503, log error, pemakaian dicatat', async () => {
    const usage = [{ operation: 'assistant_reply', provider: 'stub', model: 'm', inputTokens: 5, outputTokens: 0 }];
    const failing = recorder(() => { const e = new AiError('AI_UNAVAILABLE', 'Asisten ELGOS sedang tidak tersedia'); e.usage = usage; throw e; });
    const r = await ask(app(failing), 'beni', 'Apa rencana belajar saya?');
    expect(r.status).toBe(503);
    const [log] = await sql('SELECT outcome, answer FROM assistant_logs WHERE user_id = :id', { id: u.beni });
    expect(log).toEqual({ outcome: 'error', answer: null });
    const [{ n }] = await sql(`SELECT count(*)::int AS n FROM ai_usage_logs WHERE user_id = :id AND operation = 'assistant_reply'`, { id: u.beni });
    expect(n).toBe(1);
    for (let i = 0; i < 19; i += 1) await ask(app(recorder()), 'beni', 'halo');
    const limited = await ask(app(recorder()), 'beni', 'halo');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect((await ask(app(recorder()), 'ani', 'halo')).status).toBe(200);
  });

  it('audit gagal -> permintaan gagal dan log error (fail closed)', async () => {
    const broken = { ...stores, audit: { insert: async () => { throw new Error('audit mati'); } } };
    const res = await request(createApp({ config, stores: broken, ai: recorder() })).post('/api/assistant/ask').set(as('ani')).send({ question: 'Apa rencana belajar saya?' });
    expect(res.status).toBe(500);
    const [log] = await sql('SELECT outcome, answer FROM assistant_logs WHERE user_id = :id', { id: u.ani });
    expect(log).toEqual({ outcome: 'error', answer: null });
  });

  it('job assistant-logs-cleanup memakai retensi per tenant', async () => {
    await db.query('UPDATE tenants SET settings = :s::jsonb WHERE id = :t', { replacements: { t: tenant.id, s: JSON.stringify({ assistant: { retentionDays: 5 } }) } });
    await ask(app(recorder()), 'ani', 'halo');
    await ask(app(recorder()), 'xl', 'halo');
    await db.query(`UPDATE assistant_logs SET created_at = now() - interval '10 days' WHERE tenant_id IN (:ids)`, { replacements: { ids: [tenant.id, other.id] } });
    const out = await runJob('assistant-logs-cleanup', { stores });
    expect(out.deleted).toBeGreaterThanOrEqual(1);
    expect((await sql('SELECT id FROM assistant_logs WHERE tenant_id = :t', { t: tenant.id }))).toHaveLength(0);
    expect((await sql('SELECT id FROM assistant_logs WHERE tenant_id = :t', { t: other.id }))).toHaveLength(1);
    await db.query(`UPDATE tenants SET settings = '{}'::jsonb WHERE id = :t`, { replacements: { t: tenant.id } });
  });
});
