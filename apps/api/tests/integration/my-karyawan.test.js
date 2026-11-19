// B8 Karyawan (mockup Pak Eji): Hasil saya, Rencana belajar, dan permintaan data (tarik persetujuan, minta hapus).
// Keputusan user 19 Nov: tarik persetujuan hanya menandai, tanpa hapus. Spek: docs/designs/b8-karyawan.md
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { currentConsentVersion } = require('../../src/core/consent');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('B8 karyawan (Postgres)', () => {
  let db; let stores; let tokens; let config; let tenant; let other; let projectId; let roleId; let levelId;
  const u = {}; const tok = {}; const comp = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const countingAi = () => { const base = createStubProvider(); const ai = { ...base, analyzed: 0, async analyzeTna(a) { ai.analyzed += 1; return base.analyzeTna(a); } }; return ai; };
  const app = (extra = {}) => createApp({ config, stores, ...extra });
  const setFlag = (key, enabled, t = tenant.id) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled)
     ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t, key, enabled } });
  const setSettings = (settings) => db.query('UPDATE tenants SET settings = :s::jsonb WHERE id = :t', { replacements: { t: tenant.id, s: JSON.stringify(settings) } });
  const audits = async (resource) => db.query('SELECT action, user_id AS "userId", meta FROM audit_logs WHERE tenant_id = :t AND resource = :r ORDER BY id', { replacements: { t: tenant.id, r: resource }, type: 'SELECT' });
  const sql1 = async (q, replacements) => (await db.query(q, { replacements, type: 'SELECT' }))[0];
  const session = async (who, status = 'scheduled', over = {}) => {
    const s = await stores.interviews.create(tenant.id, { projectId, submodule: 'tna', intervieweeId: u[who], ...over });
    if (status !== 'scheduled') {
      await db.query(`UPDATE lna_interview_sessions SET status = 'in_progress', consent_at = now(), consent_version = :v, started_at = now() WHERE id = :id`, { replacements: { id: s.id, v: currentConsentVersion('tna') } });
      await stores.interviews.addTurn(tenant.id, s.id, 'ai', 'Apa kendalanya?');
      await stores.interviews.addTurn(tenant.id, s.id, 'human', `JAWABAN-${who}`);
    }
    if (status === 'completed') await db.query(`UPDATE lna_interview_sessions SET status = 'completed', ended_at = now() WHERE id = :id`, { replacements: { id: s.id } });
    return s.id;
  };
  const finding = (who, over = {}) => stores.tna.insertFinding(tenant.id, { projectId, userId: u[who], category: 'training', title: `Temuan ${who}`, reviewStatus: 'approved', ...over });
  const plan = (who, over = {}) => stores.tna.insertPlanItem(tenant.id, { userId: u[who], origin: 'hr', status: 'new', ...over });
  const dataReq = (a, who, body) => request(a).post('/api/employees/me/data-requests').set(as(who)).send(body);

  beforeAll(async () => {
    config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    tokens = sessionSigner(config, stores.authSessions);
    const stamp = Date.now();
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Karyawan uji') RETURNING id`, { replacements: { slug: `b8-${stamp}` } });
    [[other]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Tenant lain') RETURNING id`, { replacements: { slug: `b8x-${stamp}` } });
    const add = async (key, role, t = tenant.id) => {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, :email, :name, :emp, :role, 'active') RETURNING id`,
        { replacements: { t, email: `${key}@b8.test`, name: key, emp: `E-${key}`, role } },
      );
      u[key] = row.id;
      tok[key] = await tokens.sign({ id: row.id, tenantId: t, role, email: `${key}@b8.test` });
    };
    await add('hr', 'hr_admin'); await add('hr2', 'hr_admin'); await add('spv', 'supervisor'); await add('ani', 'learner'); await add('beni', 'learner'); await add('citra', 'learner');
    await add('xl', 'learner', other.id); await add('xhr', 'hr_admin', other.id);
    await db.query('UPDATE users SET supervisor_id = :spv WHERE id IN (:ids)', { replacements: { spv: u.spv, ids: [u.ani, u.beni, u.citra] } });
    await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t: tenant.id } });
    await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'dna')`, { replacements: { t: other.id } });
    for (const key of ['module.tna', 'module.dna', 'learner.home']) { await setFlag(key, true); await setFlag(key, true, other.id); }
    [[{ id: projectId }]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'B8') RETURNING id`, { replacements: { t: tenant.id } });
    [[{ id: roleId }]] = await db.query(`INSERT INTO lna_job_roles (tenant_id, name) VALUES (:t, 'Service Delivery L1') RETURNING id`, { replacements: { t: tenant.id } });
    [[{ id: levelId }]] = await db.query(`INSERT INTO lna_career_levels (tenant_id, job_role_id, name, level_order) VALUES (:t, :r, 'Junior', 1) RETURNING id`, { replacements: { t: tenant.id, r: roleId } });
    await db.query('UPDATE users SET job_role_id = :r, career_level_id = :l WHERE id IN (:ids)', { replacements: { r: roleId, l: levelId, ids: [u.ani, u.beni] } });
    for (const [key, name, required] of [['sla', 'Pemahaman SLA', 4], ['tiket', 'Penanganan tiket', 4], ['kom', 'Komunikasi', 3], ['esk', 'Eskalasi', 3]]) {
      const [[c]] = await db.query(`INSERT INTO lna_competencies (tenant_id, job_role_id, kind, name, required_score) VALUES (:t, :r, 'job', :name, :required) RETURNING id`, { replacements: { t: tenant.id, r: roleId, name, required } });
      comp[key] = c.id;
    }
    const assess = (who, key, score) => stores.dna.addAssessment(tenant.id, { userId: u[who], competencyId: comp[key], score, evidence: 'BUKTI-RAHASIA', source: 'manual_interview' });
    await assess('ani', 'sla', 4); await assess('ani', 'tiket', 3); await assess('ani', 'kom', 1);
    await assess('beni', 'sla', 1);
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.close();
  });

  describe('Hasil saya', () => {
    const s = {};
    it('flag mati -> 403', async () => {
      await setFlag('learner.home', false);
      expect((await request(app()).get('/api/my/results').set(as('ani'))).body.error.code).toBe('FEATURE_DISABLED');
      expect((await request(app()).get('/api/my/learning-plan').set(as('ani'))).status).toBe(403);
      await setFlag('learner.home', true);
    });

    it('skor vs target, undangan, wawancara selesai, ringkasan rencana, hanya data sendiri', async () => {
      s.open = await session('ani');
      s.expired = await session('ani', 'scheduled', { inviteExpiresAt: new Date(Date.now() - 3600e3) });
      s.done = await session('ani', 'completed');
      s.beni = await session('beni', 'completed');
      await plan('ani'); await plan('ani', { status: 'requested', origin: 'learner_request' }); await plan('beni');
      const res = await request(app()).get('/api/my/results').set(as('ani'));
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.person).toEqual({ id: u.ani, name: 'ani', jobRoleName: 'Service Delivery L1', careerLevelName: 'Junior' });
      expect(d.competencies.summary).toEqual({ total: 4, assessed: 3, met: 1, partial: 1, gaps: 1 });
      expect(d.competencies.items.find((c) => c.name === 'Penanganan tiket')).toEqual({ competencyId: comp.tiket, code: null, name: 'Penanganan tiket', required: 4, score: 3, status: 'partial' });
      expect(d.competencies.items.find((c) => c.name === 'Eskalasi').status).toBe('not_assessed');
      expect(d.invitations).toHaveLength(2);
      expect(d.invitations.find((i) => i.sessionId === s.open)).toMatchObject({ submodule: 'tna', status: 'scheduled', expired: false, canStart: true, canContinue: false, consentVersionRequired: currentConsentVersion('tna') });
      expect(d.invitations.find((i) => i.sessionId === s.expired)).toMatchObject({ expired: true, canStart: false });
      expect(d.interviews).toEqual([expect.objectContaining({ sessionId: s.done, status: 'completed', consentWithdrawnAt: null, transcriptPath: `/api/tna/sessions/${s.done}/transcript` })]);
      expect(d.plan).toEqual({ total: 1, byStatus: { new: 1 } });
      expect(d.privacy).toEqual({ exportPath: `/api/employees/${u.ani}/export`, requestsPath: '/api/employees/me/data-requests', openRequests: [] });
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('BUKTI-RAHASIA');
      expect(text).not.toContain(s.beni);
      expect(text).not.toContain('JAWABAN-');
      // tautan transkrip yang dikembalikan memang bisa dibuka pemiliknya
      const tr = await request(app()).get(d.interviews[0].transcriptPath).set(as('ani'));
      expect(tr.body.data.map((t) => t.text)).toContain('JAWABAN-ani');
      const log = await audits('my.results');
      expect(log.pop().meta).toMatchObject({ employeeIds: [u.ani], self: true });
    });

    it('HR melihat datanya sendiri sebagai karyawan; karyawan tanpa jabatan mendapat daftar kosong', async () => {
      const hr = await request(app()).get('/api/my/results').set(as('hr'));
      expect(hr.body.data.person.id).toBe(u.hr);
      expect(hr.body.data.competencies.items).toEqual([]);
      expect(hr.body.data.invitations).toEqual([]);
      expect(hr.body.data.plan).toEqual({ total: 0, byStatus: {} });
    });

    it('bagian modul yang tidak aktif bernilai null', async () => {
      await setFlag('module.dna', false);
      const noDna = await request(app()).get('/api/my/results').set(as('ani'));
      expect(noDna.body.data.competencies).toBeNull();
      expect(noDna.body.data.invitations).toHaveLength(2);
      await setFlag('module.dna', true);
      // tenant lain: flag TNA menyala tetapi tidak berlangganan TNA
      const x = await request(app()).get('/api/my/results').set(as('xl'));
      expect(x.status).toBe(200);
      expect(x.body.data).toMatchObject({ invitations: null, interviews: null, plan: null });
      expect(x.body.data.competencies).toEqual({ items: [], summary: { total: 0, assessed: 0, met: 0, partial: 0, gaps: 0 } });
      expect((await request(app()).get('/api/my/learning-plan').set(as('xl'))).body.error.code).toBe('FEATURE_DISABLED');
    });
  });

  describe('Rencana belajar', () => {
    it('kartu rencana: status yang tampil, tempat belajar, tautan aman, nilai course', async () => {
      const [[item]] = await db.query(
        `INSERT INTO lna_catalog_items (tenant_id, source, external_ref, title, url, program_tier) VALUES (:t, 'moodle', 'MDL-7', 'SLA Lanjutan', 'https://moodle.test/course/7', 'intermediate') RETURNING id`,
        { replacements: { t: tenant.id } });
      await db.query(`INSERT INTO lna_catalog_items (tenant_id, source, external_ref, title, url) VALUES (:t, 'moodle', 'MDL-8', 'Tautan jahat', 'javascript:alert(1)')`, { replacements: { t: tenant.id } });
      await db.query(`INSERT INTO lna_catalog_completions (tenant_id, catalog_item_id, user_id, status, score) VALUES (:t, :i, :u, 'passed', 88)`, { replacements: { t: tenant.id, i: item.id, u: u.beni } });
      const f = await finding('beni', { title: 'Belum paham SLA' });
      await db.query('DELETE FROM lna_training_plan_items WHERE tenant_id = :t AND user_id = :u', { replacements: { t: tenant.id, u: u.beni } });
      await plan('beni', { findingId: f.id, status: 'completed', programTier: 'intermediate', catalogSource: 'moodle', catalogItemRef: 'MDL-7', catalogItemTitle: 'SLA Lanjutan' });
      await plan('beni', { findingId: f.id, status: 'in_progress', catalogSource: 'moodle', catalogItemRef: 'MDL-8', catalogItemTitle: 'Tautan jahat' });
      await plan('beni', { findingId: f.id, status: 'new', catalogSource: 'elitementor', catalogItemRef: 'EM-1', catalogItemTitle: 'Dasar SLA' });
      await plan('beni', { findingId: f.id, status: 'new' });
      await plan('beni', { status: 'new' });
      await plan('beni', { status: 'rejected' });
      await plan('beni', { status: 'requested', origin: 'learner_request' });
      await setSettings({ lms: { delivery: 'lms_export', lmsName: 'Moodle Elitery' } });
      const res = await request(app()).get('/api/my/learning-plan').set(as('beni'));
      expect(res.status).toBe(200);
      expect(res.body.delivery).toEqual({ target: 'lms', label: 'Moodle Elitery' });
      const cards = res.body.data;
      expect(cards).toHaveLength(5);
      expect(cards.find((c) => c.code === 'MDL-7')).toEqual({
        id: expect.any(String), title: 'SLA Lanjutan', description: null, level: 'intermediate', mode: null, code: 'MDL-7', status: 'completed',
        courseStatus: 'passed', courseScore: 88, reason: 'Belum paham SLA', needsModule: false,
        where: { target: 'lms', label: 'Moodle Elitery' }, launchUrl: 'https://moodle.test/course/7',
      });
      expect(cards.find((c) => c.code === 'MDL-8').launchUrl).toBeNull();
      expect(cards.find((c) => c.code === 'EM-1').where).toEqual({ target: 'elitementor', label: 'EliteMentor' });
      const noCourse = cards.filter((c) => c.needsModule);
      expect(noCourse.map((c) => c.title).sort()).toEqual(['Belum paham SLA', 'Modul sedang disiapkan']);
      expect(noCourse[0].where).toEqual({ target: 'lms', label: 'Moodle Elitery' });
      // karyawan lain tidak melihatnya
      const ani = await request(app()).get('/api/my/learning-plan').set(as('ani'));
      expect(ani.body.data).toHaveLength(1);
      await setSettings({});
    });
  });

  describe('tarik persetujuan (hanya ditandai, tanpa hapus)', () => {
    const s = {}; let reqId; let draftId; let approvedId; let planId;

    it('menghentikan wawancara, menandai sesi, menghentikan analisis; data tetap tersimpan', async () => {
      const ai = countingAi();
      const a = app({ ai });
      s.done = await session('citra', 'completed');
      s.running = await session('citra', 'in_progress');
      s.queued = await session('citra', 'completed');
      s.scheduled = await session('citra');
      // wawancara DNA tidak tersentuh (hanya wawancara TNA yang punya teks persetujuan)
      const dna = await stores.interviews.create(tenant.id, { projectId, submodule: 'dna', intervieweeId: u.citra });
      s.dna = dna.id;
      draftId = (await finding('citra', { sessionId: s.done, reviewStatus: 'draft', title: 'Draf citra' })).id;
      approvedId = (await finding('citra', { sessionId: s.done, title: 'Disetujui citra' })).id;
      planId = (await plan('citra', { findingId: approvedId })).id;
      const job = await stores.analysis.enqueue(tenant.id, { sessionId: s.queued, submodule: 'tna' });

      expect((await dataReq(a, 'citra', { type: 'lain' })).status).toBe(400);
      expect((await dataReq(a, 'citra', { type: 'withdraw_consent', reason: 'x'.repeat(1001) })).status).toBe(400);
      const res = await dataReq(a, 'citra', { type: 'withdraw_consent', reason: 'Tidak nyaman' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ type: 'withdraw_consent', status: 'open', dueAt: null, sessions: 4 });
      reqId = res.body.data.id;

      const rows = await db.query('SELECT id, status, consent_withdrawn_at AS w FROM lna_interview_sessions WHERE interviewee_id = :u', { replacements: { u: u.citra }, type: 'SELECT' });
      const by = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(by[s.done]).toMatchObject({ status: 'completed' }); expect(by[s.done].w).toBeTruthy();
      expect(by[s.running]).toMatchObject({ status: 'abandoned' }); expect(by[s.running].w).toBeTruthy();
      expect(by[s.dna]).toMatchObject({ status: 'scheduled', w: null });
      expect(by[s.scheduled]).toMatchObject({ status: 'abandoned' }); expect(by[s.scheduled].w).toBeTruthy(); // dihentikan karena penarikan, ikut bertanda
      // analisis yang antre dihentikan dan penyedia AI tidak dipanggil, HR tidak bisa mengulangnya
      expect(await stores.analysis.forSession(tenant.id, s.queued)).toMatchObject({ status: 'failed', lastError: 'CONSENT_WITHDRAWN' });
      expect(await a.locals.analysis.processJob(tenant.id, job.id)).toEqual({ skipped: true });
      await a.locals.analysis.sweep();
      expect(ai.analyzed).toBe(0);
      expect((await request(a).post(`/api/tna/sessions/${s.queued}/analysis/retry`).set(as('hr'))).status).toBe(409);
      // data tetap ada: transkrip, temuan, rencana
      expect((await sql1('SELECT count(*)::int AS n FROM lna_interview_turns WHERE session_id IN (:ids)', { ids: [s.done, s.running, s.queued] })).n).toBe(6);
      expect((await sql1('SELECT count(*)::int AS n FROM lna_findings WHERE user_id = :u', { u: u.citra })).n).toBe(2);
      expect((await request(a).get(`/api/tna/sessions/${s.done}/transcript`).set(as('citra'))).status).toBe(200);
      const mine = await request(a).get('/api/my/results').set(as('citra'));
      expect(mine.body.data.invitations).toEqual([]);
      expect(mine.body.data.interviews.find((i) => i.sessionId === s.running)).toMatchObject({ status: 'abandoned' });
      expect(mine.body.data.interviews.every((i) => i.consentWithdrawnAt)).toBe(true);
      expect(mine.body.data.privacy.openRequests).toEqual([expect.objectContaining({ id: reqId, type: 'withdraw_consent', dueAt: null })]);
      expect((await audits('my.data_request')).pop().meta).toMatchObject({ employeeIds: [u.citra], type: 'withdraw_consent', sessions: 4 });
      const [[raw]] = await db.query('SELECT reason FROM data_subject_requests WHERE id = :id', { replacements: { id: reqId } });
      expect(raw.reason).not.toContain('Tidak nyaman');
    });

    it('job yang lolos dari penarikan (balapan) tetap tidak dianalisis', async () => {
      const ai = countingAi();
      const a = app({ ai });
      await db.query(`UPDATE lna_analysis_jobs SET status = 'queued', last_error = NULL WHERE session_id = :id`, { replacements: { id: s.queued } });
      const job = await stores.analysis.forSession(tenant.id, s.queued);
      expect(await a.locals.analysis.processJob(tenant.id, job.id)).toEqual({ skipped: true, code: 'CONSENT_WITHDRAWN' });
      expect(ai.analyzed).toBe(0);
      expect(await stores.analysis.forSession(tenant.id, s.queued)).toMatchObject({ status: 'failed', lastError: 'CONSENT_WITHDRAWN' });
    });

    it('draf keluar dari antrean review dan tidak bisa diputus; yang sudah disetujui tetap berjalan', async () => {
      const a = app();
      await setFlag('tna.review_workspace', true);
      const queue = await request(a).get('/api/tna/review').set(as('hr'));
      expect(queue.body.data.map((x) => x.id)).not.toContain(draftId);
      expect(queue.body.counts.draft).toBe(0);
      expect((await request(a).post(`/api/tna/findings/${draftId}/review`).set(as('hr')).send({ decision: 'approve' })).body.error.code).toBe('CONSENT_WITHDRAWN');
      expect((await request(a).post(`/api/tna/findings/${draftId}/classify`).set(as('hr')).send({ classification: 'training' })).body.error.code).toBe('CONSENT_WITHDRAWN');
      const findings = await request(a).get('/api/tna/findings').set(as('hr'));
      expect(findings.body.data.map((x) => x.id)).toContain(approvedId);
      const plans = await request(a).get('/api/my/learning-plan').set(as('citra'));
      expect(plans.body.data.map((x) => x.id)).toContain(planId);
      // HR melihat tanda penarikan di daftar sesi
      const list = await request(a).get('/api/tna/sessions').set(as('hr'));
      expect(list.body.data.find((x) => x.id === s.done).consentWithdrawnAt).toBeTruthy();
    });

    it('idempoten, tidak bisa dibatalkan; sesi yang dihentikan menolak persetujuan dan jawaban', async () => {
      const a = app();
      const again = await dataReq(a, 'citra', { type: 'withdraw_consent' });
      expect(again.status).toBe(200);
      expect(again.body.data).toMatchObject({ id: reqId, sessions: 0 });
      expect((await sql1(`SELECT count(*)::int AS n FROM data_subject_requests WHERE user_id = :u`, { u: u.citra })).n).toBe(1);
      expect((await request(a).delete(`/api/employees/me/data-requests/${reqId}`).set(as('citra'))).body.error.code).toBe('CANNOT_CANCEL');
      expect((await request(a).post(`/api/tna/sessions/${s.scheduled}/consent`).set(as('citra')).send({ consentVersion: currentConsentVersion('tna') })).status).toBe(409);
      expect((await request(a).post(`/api/tna/sessions/${s.running}/turns`).set(as('citra')).send({ text: 'halo' })).status).toBe(409);
      // penarikan yang tiba saat sesi sedang dimulai: start bersyarat menolak
      const late = await session('citra');
      await db.query('UPDATE lna_interview_sessions SET consent_withdrawn_at = now() WHERE id = :id', { replacements: { id: late } });
      const c = await request(a).post(`/api/tna/sessions/${late}/consent`).set(as('citra')).send({ consentVersion: currentConsentVersion('tna') });
      expect(c.body.error.code).toBe('INVALID_STATE');
      expect((await sql1('SELECT count(*)::int AS n FROM lna_interview_turns WHERE session_id = :id', { id: late })).n).toBe(0);
      // giliran tidak tersimpan pada sesi yang sudah tidak berjalan
      expect(await stores.interviews.addTurn(tenant.id, s.running, 'human', 'terlambat')).toBeNull();
      // HR mengundang ulang: sesi baru berjalan normal dan bisa dihentikan lagi lewat permintaan yang sama
      const fresh = await session('citra', 'in_progress');
      const third = await dataReq(a, 'citra', { type: 'withdraw_consent' });
      expect(third.status).toBe(200);
      expect(third.body.data.sessions).toBeGreaterThanOrEqual(1);
      expect((await sql1('SELECT status FROM lna_interview_sessions WHERE id = :id', { id: fresh })).status).toBe('abandoned');
    });

    it('undangan massal melewati karyawan yang menarik persetujuan, kecuali HR memintanya', async () => {
      const a = app();
      await db.query(`INSERT INTO lna_performance_records (tenant_id, project_id, user_id, metric_type, name, target, actual, is_met, period, direction)
                      VALUES (:t, :p, :u, 'sla', 'Respons', 85, 70, false, '2026-11', 'higher')`, { replacements: { t: tenant.id, p: projectId, u: u.citra } });
      const res = await request(a).post(`/api/tna/projects/${projectId}/interviews`).set(as('hr')).send({ scope: 'red_only' });
      expect(res.status).toBe(201);
      expect(res.body.data.sessions.map((x) => x.intervieweeId)).not.toContain(u.citra);
      expect(res.body.data.skippedWithdrawn).toBeGreaterThanOrEqual(1);
      const forced = await request(a).post(`/api/tna/projects/${projectId}/interviews`).set(as('hr')).send({ scope: 'red_only', includeWithdrawn: true });
      expect(forced.body.data.sessions.map((x) => x.intervieweeId)).toContain(u.citra);
      // sesi undangan ulang itu dihentikan lagi agar langkah berikut tetap konsisten
      expect((await dataReq(a, 'citra', { type: 'withdraw_consent' })).status).toBe(200);
    });

    it('HR menutup permintaan tanpa menghapus; hapus manual hanya dengan erase', async () => {
      const a = app();
      const list = await request(a).get('/api/employees/data-requests').set(as('hr'));
      expect(list.status).toBe(200);
      expect(list.body.data.find((x) => x.id === reqId)).toMatchObject({ userId: u.citra, userName: 'citra', type: 'withdraw_consent', status: 'open', reason: 'Tidak nyaman', dueAt: null, overdue: false });
      expect((await request(a).get('/api/employees/data-requests').set(as('spv'))).status).toBe(403);
      expect((await request(a).get('/api/employees/data-requests').set(as('ani'))).status).toBe(403);
      expect((await request(a).get('/api/employees/data-requests?status=salah').set(as('hr'))).status).toBe(400);
      expect((await request(a).post(`/api/employees/data-requests/${reqId}/fulfill`).set(as('spv'))).status).toBe(403);
      expect((await request(a).post('/api/employees/data-requests/bukan-uuid/fulfill').set(as('hr'))).status).toBe(404);

      const turnsBefore = (await sql1('SELECT count(*)::int AS n FROM lna_interview_turns t JOIN lna_interview_sessions s ON s.id = t.session_id WHERE s.interviewee_id = :u', { u: u.citra })).n;
      const close = await request(a).post(`/api/employees/data-requests/${reqId}/fulfill`).set(as('hr')).send({ note: 'Sudah dicatat' });
      expect(close.status).toBe(200);
      expect(close.body.data).toEqual({ erased: false });
      expect((await sql1('SELECT count(*)::int AS n FROM lna_interview_turns t JOIN lna_interview_sessions s ON s.id = t.session_id WHERE s.interviewee_id = :u', { u: u.citra })).n).toBe(turnsBefore);
      expect((await sql1('SELECT count(*)::int AS n FROM lna_findings WHERE user_id = :u', { u: u.citra })).n).toBe(2);
      expect((await request(a).post(`/api/employees/data-requests/${reqId}/fulfill`).set(as('hr'))).body.error.code).toBe('INVALID_STATE');
      expect((await audits('employee.interview_data'))).toHaveLength(0);

      // permintaan baru, lalu HR menghapus manual
      const next = await dataReq(a, 'citra', { type: 'withdraw_consent' });
      expect(next.status).toBe(201);
      // tenant lain tidak melihat dan tidak bisa menutup permintaan ini
      expect((await request(a).get('/api/employees/data-requests?status=all').set(as('xhr'))).body.data.map((x) => x.id)).not.toContain(next.body.data.id);
      expect((await request(a).post(`/api/employees/data-requests/${next.body.data.id}/fulfill`).set(as('xhr')).send({ erase: true })).status).toBe(404);
      // audit penutupan gagal -> seluruh hapus batal, termasuk jejak audit hapus (tidak ada jejak palsu)
      const failingAudit = { insert: async (row, opts) => { if (row.resource === 'employee.data_request') throw new Error('audit mati'); return stores.audit.insert(row, opts); } };
      const broken = createApp({ config, stores: { ...stores, audit: failingAudit } });
      expect((await request(broken).post(`/api/employees/data-requests/${next.body.data.id}/fulfill`).set(as('hr2')).send({ erase: true })).status).toBe(500);
      expect((await sql1('SELECT count(*)::int AS n FROM lna_findings WHERE user_id = :u', { u: u.citra })).n).toBe(2);
      expect((await audits('employee.interview_data'))).toHaveLength(0);
      expect((await sql1('SELECT status FROM data_subject_requests WHERE id = :id', { id: next.body.data.id })).status).toBe('open');
      // B6: ringkasan temuan dan catatan karyawan di baris sesi ikut terhapus
      await sql1(`UPDATE lna_interview_sessions SET summary_findings = '{"x":1}'::jsonb, summary_at = now(), summary_note = 'catatan',
                         summary_disputed = true, summary_confirmed_at = now()
                   WHERE interviewee_id = :u AND consent_withdrawn_at IS NOT NULL RETURNING 1 AS n`, { u: u.citra });
      const erase = await request(a).post(`/api/employees/data-requests/${next.body.data.id}/fulfill`).set(as('hr2')).send({ erase: true });
      expect(erase.body.data).toEqual({ erased: true, deletedTurns: turnsBefore, deletedFindings: 2, deletedPlanItems: 1 });
      expect((await sql1('SELECT count(*)::int AS n FROM lna_findings WHERE user_id = :u', { u: u.citra })).n).toBe(0);
      expect((await sql1('SELECT count(*)::int AS n FROM lna_training_plan_items WHERE id = :id', { id: planId })).n).toBe(0);
      expect((await sql1(`SELECT count(*)::int AS n FROM lna_interview_sessions WHERE interviewee_id = :u AND consent_withdrawn_at IS NOT NULL
                            AND (summary_findings IS NOT NULL OR summary_note IS NOT NULL OR summary_disputed OR summary_at IS NOT NULL)`, { u: u.citra })).n).toBe(0);
      // akun dan baris sesi tetap ada
      expect((await sql1('SELECT count(*)::int AS n FROM users WHERE id = :u', { u: u.citra })).n).toBe(1);
      expect((await sql1('SELECT count(*)::int AS n FROM lna_interview_sessions WHERE interviewee_id = :u AND consent_withdrawn_at IS NOT NULL', { u: u.citra })).n).toBeGreaterThanOrEqual(4);
      const log = await audits('employee.interview_data');
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ action: 'delete', userId: u.hr2 });
      expect(log[0].meta.sessionIds.length).toBeGreaterThanOrEqual(4);
      const done = await request(a).get('/api/employees/data-requests?status=done').set(as('hr'));
      expect(done.body.data.map((x) => x.resolvedByName).sort()).toEqual(['hr', 'hr2']);
    });

    it('audit gagal saat tarik persetujuan -> tidak ada yang berubah (audit di dalam transaksi)', async () => {
      const sid = await session('ani', 'in_progress');
      const failingAudit = { insert: async () => { throw new Error('audit mati'); } };
      const broken = createApp({ config, stores: { ...stores, audit: failingAudit } });
      expect((await dataReq(broken, 'ani', { type: 'withdraw_consent' })).status).toBe(500);
      expect(await sql1('SELECT status, consent_withdrawn_at AS w FROM lna_interview_sessions WHERE id = :id', { id: sid })).toEqual({ status: 'in_progress', w: null });
      expect((await sql1(`SELECT count(*)::int AS n FROM data_subject_requests WHERE user_id = :u`, { u: u.ani })).n).toBe(0);
      await db.query(`UPDATE lna_interview_sessions SET status = 'abandoned' WHERE id = :id`, { replacements: { id: sid } });
    });

    it('HR tidak bisa memenuhi permintaannya sendiri', async () => {
      const a = app();
      const own = await dataReq(a, 'hr', { type: 'withdraw_consent' });
      expect(own.status).toBe(201);
      expect((await request(a).post(`/api/employees/data-requests/${own.body.data.id}/fulfill`).set(as('hr'))).body.error.code).toBe('CANNOT_FULFILL_OWN');
      expect((await request(a).post(`/api/employees/data-requests/${own.body.data.id}/fulfill`).set(as('hr2'))).status).toBe(200);
    });
  });

  describe('minta hapus data', () => {
    it('tercatat dengan tenggat 3 hari, tidak ganda, bisa dibatalkan pemiliknya saja', async () => {
      const a = app();
      expect((await dataReq(a, 'hr', { type: 'delete_data' })).body.error.code).toBe('ADMIN_ACCOUNT');
      const res = await dataReq(a, 'beni', { type: 'delete_data', reason: 'Resign' });
      expect(res.status).toBe(201);
      const due = new Date(res.body.data.dueAt).getTime() - new Date(res.body.data.createdAt).getTime();
      expect(Math.round(due / 3600e3)).toBe(72);
      expect((await dataReq(a, 'beni', { type: 'delete_data' })).body.error.code).toBe('REQUEST_EXISTS');
      const id = res.body.data.id;
      // daftar permintaan sendiri tersedia tanpa flag beranda (hak subjek data)
      await setFlag('learner.home', false);
      const mine = await request(a).get('/api/employees/me/data-requests').set(as('beni'));
      expect(mine.status).toBe(200);
      expect(mine.body.data).toEqual([expect.objectContaining({ id, type: 'delete_data', status: 'open' })]);
      expect(JSON.stringify((await request(a).get('/api/employees/me/data-requests').set(as('ani'))).body.data)).not.toContain(id);
      expect((await request(a).get('/api/employees/me/data-requests').set(as('xl'))).body.data).toEqual([]);
      await setFlag('learner.home', true);
      expect((await request(a).delete(`/api/employees/me/data-requests/${id}`).set(as('ani'))).status).toBe(404);
      expect((await request(a).delete('/api/employees/me/data-requests/bukan-uuid').set(as('beni'))).status).toBe(404);
      expect((await request(a).post(`/api/employees/data-requests/${id}/fulfill`).set(as('hr'))).body.error.code).toBe('USE_DELETE_EMPLOYEE');
      // terlambat setelah tenggat lewat
      await db.query(`UPDATE data_subject_requests SET due_at = now() - interval '1 hour' WHERE id = :id`, { replacements: { id } });
      const list = await request(a).get('/api/employees/data-requests').set(as('hr'));
      expect(list.body.data.find((x) => x.id === id)).toMatchObject({ type: 'delete_data', overdue: true });
      expect((await request(a).delete(`/api/employees/me/data-requests/${id}`).set(as('beni'))).body.data).toMatchObject({ status: 'cancelled' });
      expect((await request(a).delete(`/api/employees/me/data-requests/${id}`).set(as('beni'))).body.error.code).toBe('INVALID_STATE');
      expect((await dataReq(a, 'beni', { type: 'delete_data' })).status).toBe(201);
    });

    it('hapus karyawan mencatat permintaan yang dipenuhi di audit', async () => {
      const a = app();
      const del = await request(a).delete(`/api/employees/${u.beni}`).set(as('hr')).send({ reason: 'Permintaan karyawan' });
      expect(del.status).toBe(200);
      const log = (await audits('employee')).filter((r) => r.action === 'delete').pop();
      expect(log.meta.dataRequests).toEqual([expect.objectContaining({ type: 'delete_data' })]);
      expect((await sql1('SELECT count(*)::int AS n FROM data_subject_requests WHERE user_id = :u', { u: u.beni })).n).toBe(0);
    });
  });
});
