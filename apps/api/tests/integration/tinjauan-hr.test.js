// B7 Tinjauan HR (mockup Pak Eji): klasifikasi tiga tombol, target 2 hari kerja, solusi pelatihan,
// penugasan ke EliteMentor, ekspor gap, dan serah temuan ke Improvement Needs. Spek: docs/designs/b7-tinjauan-hr.md
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('B7 tinjauan HR (Postgres)', () => {
  let db; let stores; let tokens; let config; let tenant; let other; let projectId; let competencyId; let sessionId;
  const u = {}; const tok = {}; const f = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const catalog = {
    async match({ competency }) {
      return competency && competency.name === 'Pemahaman SLA'
        ? { source: 'elitementor', ref: 'EM-101', title: 'Dasar SLA', url: 'https://em.test/c/101' } : null;
    },
  };
  const makeAssignments = (impl) => {
    const svc = { calls: [], async assign(args) { svc.calls.push(args); return impl ? impl(args, svc.calls.length) : { ref: `EM-A-${svc.calls.length}` }; } };
    return svc;
  };
  const app = (extra = {}) => createApp({ config, stores, catalog, ...extra });
  const setFlag = (key, enabled, t = tenant.id) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled)
     ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t, key, enabled } });
  const setSettings = (settings) => db.query('UPDATE tenants SET settings = :s::jsonb WHERE id = :t', { replacements: { t: tenant.id, s: JSON.stringify(settings) } });
  const audits = async (resource) => db.query('SELECT action, meta FROM audit_logs WHERE tenant_id = :t AND resource = :r ORDER BY id', { replacements: { t: tenant.id, r: resource }, type: 'SELECT' });
  const finding = (who, over = {}) => stores.tna.insertFinding(tenant.id, {
    projectId, userId: u[who], category: 'training', title: 'Belum paham SLA', detail: 'Rincian', competencyId, sessionId, ...over,
  });
  const setAi = (id, confidence, agreement = true) => db.query('UPDATE lna_findings SET confidence = :c, scoring_agreement = :a WHERE id = :id', { replacements: { id, c: confidence, a: agreement } });
  const classify = (a, id, classification, who = 'hr', note) => request(a).post(`/api/tna/findings/${id}/classify`).set(as(who)).send({ classification, note });

  beforeAll(async () => {
    config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    tokens = sessionSigner(config, stores.authSessions);
    const stamp = Date.now();
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Tinjauan uji') RETURNING id`, { replacements: { slug: `b7-${stamp}` } });
    [[other]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Tenant lain') RETURNING id`, { replacements: { slug: `b7x-${stamp}` } });
    const add = async (key, role, t = tenant.id) => {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, :email, :name, :emp, :role, 'active') RETURNING id`,
        { replacements: { t, email: `${key}@b7.test`, name: key === 'ani' ? '=Ani' : key, emp: `E-${key}`, role } },
      );
      u[key] = row.id;
      tok[key] = await tokens.sign({ id: row.id, tenantId: t, role, email: `${key}@b7.test` });
    };
    await add('hr', 'hr_admin'); await add('hr2', 'hr_admin'); await add('spv', 'supervisor'); await add('ani', 'learner'); await add('beni', 'learner');
    await add('xhr', 'hr_admin', other.id); await add('xl', 'learner', other.id);
    await db.query('UPDATE users SET supervisor_id = :spv WHERE id IN (:ids)', { replacements: { spv: u.spv, ids: [u.ani, u.beni] } });
    for (const t of [tenant.id, other.id]) {
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t } });
      await setFlag('module.tna', true, t);
      await setFlag('tna.review_workspace', true, t);
    }
    const [[p]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'B7') RETURNING id`, { replacements: { t: tenant.id } });
    projectId = p.id;
    const [[c]] = await db.query(`INSERT INTO lna_competencies (tenant_id, kind, name) VALUES (:t, 'job', 'Pemahaman SLA') RETURNING id`, { replacements: { t: tenant.id } });
    competencyId = c.id;
    const s = await stores.interviews.create(tenant.id, { projectId, submodule: 'tna', intervieweeId: u.ani });
    sessionId = s.id;
    await db.query(`UPDATE lna_interview_sessions SET status = 'in_progress' WHERE id = :id`, { replacements: { id: sessionId } });
    await stores.interviews.addTurn(tenant.id, sessionId, 'human', 'RAHASIA-TRANSKRIP');
    await db.query(`UPDATE lna_interview_sessions SET status = 'completed', ended_at = now() WHERE id = :id`, { replacements: { id: sessionId } });
    const [[xp]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'X') RETURNING id`, { replacements: { t: other.id } });
    f.x = (await stores.tna.insertFinding(other.id, { projectId: xp.id, userId: u.xl, category: 'non_training', title: 'Milik tenant lain', reviewStatus: 'approved' })).id;
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.close();
  });

  describe('klasifikasi tiga tombol', () => {
    it('flag mati -> 403; hanya HR; tenant lain 404; isian salah 400', async () => {
      const a = app();
      f.t1 = (await finding('ani')).id;
      await setAi(f.t1, 0.9);
      await setFlag('tna.review_workspace', false);
      expect((await classify(a, f.t1, 'training')).body.error.code).toBe('FEATURE_DISABLED');
      expect((await request(a).get('/api/tna/review/solutions').set(as('hr'))).status).toBe(403);
      expect((await request(a).get('/api/tna/plan-items/export.csv').set(as('hr'))).status).toBe(403);
      expect((await request(a).post('/api/tna/review/improvement-handoff').set(as('hr')).send({ findingIds: [f.t1] })).status).toBe(403);
      expect((await request(a).post(`/api/tna/plan-items/${f.t1}/assign`).set(as('hr'))).body.error.code).toBe('FEATURE_DISABLED');
      await setFlag('tna.review_workspace', true);
      expect((await classify(a, f.t1, 'training', 'spv')).status).toBe(403);
      expect((await classify(a, f.t1, 'training', 'ani')).status).toBe(403);
      expect((await classify(a, f.t1, 'training', 'xhr')).status).toBe(404);
      expect((await classify(a, 'bukan-uuid', 'training')).status).toBe(404);
      expect((await classify(a, f.t1, 'lainnya')).status).toBe(400);
      expect((await classify(a, f.t1, 'training', 'hr', 'x'.repeat(2001))).status).toBe(400);
    });

    it('Training Needs tanpa mengubah kategori AI -> approved', async () => {
      const res = await classify(app(), f.t1, 'training');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: f.t1, reviewStatus: 'approved', category: 'training', held: false, suggestedClassification: 'training' });
    });

    it('mengubah ke Improvement Needs -> edited dan kategori asli tersimpan', async () => {
      f.t2 = (await finding('beni', { sessionId: null })).id;
      const res = await classify(app(), f.t2, 'improvement');
      expect(res.body.data).toMatchObject({ reviewStatus: 'edited', category: 'non_training', originalCategory: 'training' });
    });

    it('Perlu ditinjau HR: tetap draf dan ditahan, tidak tampil di luar antrean, lalu bisa diklasifikasi', async () => {
      const a = app();
      f.h = (await finding('ani', { title: 'Ragu-ragu' })).id;
      await setAi(f.h, 0.3);
      const hold = await classify(a, f.h, 'needs_review', 'hr', 'Tanya atasannya dulu');
      expect(hold.status).toBe(200);
      expect(hold.body.data).toMatchObject({ reviewStatus: 'draft', held: true, heldByName: 'hr', holdNote: 'Tanya atasannya dulu', suggestedClassification: 'needs_review' });
      const [[raw]] = await db.query('SELECT review_hold_note AS n FROM lna_findings WHERE id = :id', { replacements: { id: f.h } });
      expect(raw.n).not.toContain('Tanya atasannya'); // terenkripsi
      const list = await request(a).get('/api/tna/findings').set(as('hr'));
      expect(list.body.data.map((x) => x.id)).not.toContain(f.h);
      const queue = await request(a).get('/api/tna/review').set(as('hr'));
      expect(queue.body.counts).toMatchObject({ held: 1 });
      expect(queue.body.data.find((x) => x.id === f.h)).toMatchObject({ held: true });
      // menahan lagi memperbarui catatan
      expect((await classify(a, f.h, 'needs_review', 'hr2', 'Catatan baru')).body.data).toMatchObject({ heldByName: 'hr2', holdNote: 'Catatan baru' });
      const done = await classify(a, f.h, 'improvement', 'hr2');
      expect(done.body.data).toMatchObject({ reviewStatus: 'edited', category: 'non_training', held: false });
      expect(done.body.data.heldAt).toBeTruthy(); // jejak tahan tidak dihapus
      expect((await classify(a, f.h, 'needs_review')).body.error.code).toBe('ALREADY_REVIEWED');
    });

    it('koreksi salah klik: boleh pindah kategori selama belum ditindaklanjuti', async () => {
      const a = app();
      const back = await classify(a, f.t2, 'training');
      expect(back.body.data).toMatchObject({ reviewStatus: 'edited', category: 'training', originalCategory: 'training' });
      const same = await classify(a, f.t2, 'training');
      expect(same.status).toBe(200);
      // setelah ada rencana -> terkunci
      const plan = await request(a).post(`/api/tna/findings/${f.t2}/plan`).set(as('hr')).send({});
      expect(plan.status).toBe(201);
      f.planT2 = plan.body.data.id;
      expect((await classify(a, f.t2, 'improvement')).body.error.code).toBe('ALREADY_ACTIONED');
    });

    it('temuan ditolak final; dua HR bersamaan tidak saling timpa', async () => {
      const a = app();
      const rej = (await finding('ani', { title: 'Salah tangkap' })).id;
      await request(a).post(`/api/tna/findings/${rej}/review`).set(as('hr')).send({ decision: 'reject', note: 'Tidak relevan' });
      expect((await classify(a, rej, 'training')).body.error.code).toBe('ALREADY_REVIEWED');
      const race = (await finding('ani', { title: 'Balapan' })).id;
      const [x, y] = await Promise.all([classify(a, race, 'training', 'hr'), classify(a, race, 'improvement', 'hr2')]);
      // yang kalah mendapat 409 atau, bila tiba setelah yang pertama selesai, menjadi klasifikasi ulang yang sah
      expect([x.status, y.status]).toContain(200);
      const [[row]] = await db.query('SELECT review_status AS s FROM lna_findings WHERE id = :id', { replacements: { id: race } });
      expect(['approved', 'edited']).toContain(row.s);
      f.race = race;
    });

    it('audit mencatat keputusan', async () => {
      const rows = await audits('tna.finding_review');
      const decisions = rows.map((r) => r.meta.decision);
      expect(decisions).toEqual(expect.arrayContaining(['approved', 'edited', 'hold', 'reclassified', 'rejected']));
      expect(rows.find((r) => r.meta.decision === 'hold').meta).toMatchObject({ classification: 'needs_review', employeeIds: [u.ani] });
    });
  });

  describe('target tinjauan 2 hari kerja', () => {
    it('reviewDueAt dari sesi selesai; overdue dan counts', async () => {
      const a = app();
      const late = (await finding('ani', { title: 'Terlambat' })).id;
      const fresh = (await finding('beni', { title: 'Baru', sessionId: null })).id;
      await db.query(`UPDATE lna_interview_sessions SET ended_at = now() - interval '10 days' WHERE id = :id`, { replacements: { id: sessionId } });
      const res = await request(a).get('/api/tna/review').set(as('hr'));
      expect(res.body.targetDays).toBe(2);
      const l = res.body.data.find((x) => x.id === late); const n = res.body.data.find((x) => x.id === fresh);
      expect(l.overdue).toBe(true);
      expect(new Date(l.reviewDueAt).getTime()).toBeLessThan(Date.now());
      expect(n.overdue).toBe(false);
      expect(new Date(n.reviewDueAt).getTime()).toBeGreaterThan(Date.now());
      expect(l).not.toHaveProperty('sessionEndedAt');
      expect(res.body.counts.overdue).toBe(1);
      // counts dihitung dari seluruh draf walau daftar difilter status lain
      const reviewed = await request(a).get('/api/tna/review?status=reviewed').set(as('hr'));
      expect(reviewed.body.counts).toMatchObject({ overdue: 1, held: 0 });
      // target dari setting tenant
      await setSettings({ tna: { reviewTargetDays: 30 } });
      const relaxed = await request(a).get('/api/tna/review').set(as('hr'));
      expect(relaxed.body.targetDays).toBe(30);
      expect(relaxed.body.counts.overdue).toBe(0);
      await setSettings({});
      f.late = late; f.fresh = fresh;
    });
  });

  describe('solusi pelatihan', () => {
    it('rekomendasi dari katalog, planItem setelah rencana dibuat, tanpa transkrip', async () => {
      const a = app();
      f.noComp = (await finding('beni', { title: 'Tanpa course', competencyId: null, sessionId: null })).id;
      await classify(a, f.noComp, 'training');
      const res = await request(a).get('/api/tna/review/solutions').set(as('hr'));
      expect(res.status).toBe(200);
      const { training, improvement, delivery, inaEnabled } = res.body.data;
      expect(training.find((x) => x.findingId === f.t1)).toMatchObject({
        userId: u.ani, title: 'Belum paham SLA', competencyName: 'Pemahaman SLA', planItem: null,
        recommendation: { source: 'elitementor', ref: 'EM-101', title: 'Dasar SLA', url: 'https://em.test/c/101' },
      });
      expect(training.find((x) => x.findingId === f.noComp)).toMatchObject({ recommendation: null, planItem: null });
      expect(training.find((x) => x.findingId === f.t2)).toMatchObject({ recommendation: null, planItem: { id: f.planT2, status: 'new', needsModule: false, catalogItemRef: 'EM-101', assignmentStatus: null } });
      expect(improvement.map((x) => x.findingId)).toContain(f.h);
      expect(training.map((x) => x.findingId)).not.toContain(f.late); // draf tidak ikut
      expect(delivery).toEqual({ target: 'elitementor', label: 'EliteMentor', assignAvailable: false });
      expect(inaEnabled).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain('RAHASIA-TRANSKRIP');
      expect((await request(a).get('/api/tna/review/solutions').set(as('spv'))).status).toBe(403);
      expect((await audits('tna.review_solutions')).length).toBeGreaterThan(0);
    });
  });

  describe('penugasan ke EliteMentor', () => {
    const assign = (a, id, who = 'hr') => request(a).post(`/api/tna/plan-items/${id}/assign`).set(as(who));
    const ready = async () => { await setFlag('em.gaps_autosend', true); await setSettings({ lms: { elitementorOrganizationId: 'org-9' } }); };

    it('tabel keputusan: tiap alasan menolak', async () => {
      const svc = makeAssignments();
      const a = app({ assignments: svc });
      expect((await assign(a, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
      expect((await assign(a, f.planT2, 'xhr')).status).toBe(404);
      expect((await assign(a, f.planT2, 'spv')).status).toBe(403);
      // rencana tanpa course
      const p2 = await request(a).post(`/api/tna/findings/${f.noComp}/plan`).set(as('hr')).send({});
      f.planNoCourse = p2.body.data.id;
      // klik ulang tidak membuat rencana kedua (rencana ganda akan ikut dua kali di CSV)
      const dup = await request(a).post(`/api/tna/findings/${f.noComp}/plan`).set(as('hr')).send({});
      expect(dup.body.error.code).toBe('ALREADY_ACTIONED');
      const [[{ n }]] = await db.query('SELECT count(*)::int AS n FROM lna_training_plan_items WHERE finding_id = :id', { replacements: { id: f.noComp } });
      expect(n).toBe(1);
      expect((await assign(a, f.planNoCourse)).body.error.code).toBe('NEEDS_MODULE');
      // lms_export
      await setSettings({ lms: { delivery: 'lms_export', elitementorOrganizationId: 'org-9' } });
      await setFlag('em.gaps_autosend', true);
      expect((await assign(a, f.planT2)).body.error.code).toBe('ASSIGN_VIA_EXPORT');
      // flag mati, organisasi kosong, adapter tidak terpasang
      await setSettings({ lms: { elitementorOrganizationId: 'org-9' } });
      await setFlag('em.gaps_autosend', false);
      expect((await assign(a, f.planT2)).body.error.code).toBe('ASSIGN_UNAVAILABLE');
      await setFlag('em.gaps_autosend', true);
      await setSettings({});
      expect((await assign(a, f.planT2)).body.error.code).toBe('ASSIGN_UNAVAILABLE');
      await ready();
      expect((await assign(app(), f.planT2)).body.error.code).toBe('ASSIGN_UNAVAILABLE');
      // course bukan dari EliteMentor
      await db.query(`UPDATE lna_training_plan_items SET catalog_source = 'moodle' WHERE id = :id`, { replacements: { id: f.planT2 } });
      expect((await assign(a, f.planT2)).body.error.code).toBe('COURSE_NOT_IN_TARGET');
      await db.query(`UPDATE lna_training_plan_items SET catalog_source = 'elitementor' WHERE id = :id`, { replacements: { id: f.planT2 } });
      // status rencana tidak aktif
      await db.query(`UPDATE lna_training_plan_items SET status = 'rejected' WHERE id = :id`, { replacements: { id: f.planT2 } });
      expect((await assign(a, f.planT2)).body.error.code).toBe('INVALID_STATE');
      await db.query(`UPDATE lna_training_plan_items SET status = 'new' WHERE id = :id`, { replacements: { id: f.planT2 } });
      expect(svc.calls).toHaveLength(0);
      const sol = await request(a).get('/api/tna/review/solutions').set(as('hr'));
      expect(sol.body.data.delivery.assignAvailable).toBe(true);
    });

    it('gagal -> 502 dan failed; coba lagi sukses; sesudahnya tidak mengirim ulang', async () => {
      await ready();
      const svc = makeAssignments((_args, n) => { if (n === 1) throw new Error('timeout'); return { ref: 'EM-A-77' }; });
      const a = app({ assignments: svc });
      const fail = await assign(a, f.planT2);
      expect(fail.status).toBe(502);
      expect(fail.body.error.code).toBe('EM_ASSIGN_FAILED');
      const [[row]] = await db.query('SELECT assignment_status AS s FROM lna_training_plan_items WHERE id = :id', { replacements: { id: f.planT2 } });
      expect(row.s).toBe('failed');
      const ok = await assign(a, f.planT2);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ id: f.planT2, status: 'new', assignmentStatus: 'sent', assignmentTarget: 'elitementor', assignmentRef: 'EM-A-77' });
      expect(ok.body.data.assignedAt).toBeTruthy();
      expect(svc.calls[1]).toEqual({
        organizationId: 'org-9', employee: { employeeId: 'E-beni', email: 'beni@b7.test' }, course: { ref: 'EM-101', title: 'Dasar SLA' }, planItemId: f.planT2,
      });
      const again = await assign(a, f.planT2);
      expect(again.status).toBe(200);
      // yang sudah terkirim tetap 200 walau tenant kemudian pindah ke ekspor
      await setSettings({ lms: { delivery: 'lms_export' } });
      expect((await assign(a, f.planT2)).status).toBe(200);
      await ready();
      expect(svc.calls).toHaveLength(2);
      // course rencana yang sudah ditugaskan tidak bisa diganti
      const patchRes = await request(a).patch(`/api/tna/plan-items/${f.planT2}`).set(as('hr')).send({ catalogItemRef: 'EM-999' });
      expect(patchRes.body.error.code).toBe('ALREADY_ASSIGNED');
      const log = await audits('tna.plan_assignment');
      expect(log.map((r) => r.meta.result)).toEqual(['failed', 'sent']);
      expect(log[1].meta).toMatchObject({ employeeIds: [u.beni], target: 'elitementor' });
    });

    it('dua permintaan bersamaan hanya mengirim sekali; klaim basi bisa diambil ulang', async () => {
      await ready();
      const a0 = app();
      const plan = await request(a0).post(`/api/tna/findings/${f.t1}/plan`).set(as('hr')).send({});
      f.planT1 = plan.body.data.id;
      let release; const gate = new Promise((r) => { release = r; });
      const svc = makeAssignments(async () => { await gate; return { ref: 'EM-A-1' }; });
      const a = app({ assignments: svc });
      const first = assign(a, f.planT1).then((r) => r);
      // tunggu sampai permintaan pertama memegang klaim
      for (let i = 0; i < 50 && svc.calls.length === 0; i += 1) await new Promise((r) => setTimeout(r, 20));
      const second = await assign(a, f.planT1, 'hr2');
      expect(second.body.error.code).toBe('ASSIGN_IN_PROGRESS');
      release();
      expect((await first).status).toBe(200);
      expect(svc.calls).toHaveLength(1);

      // klaim 'sending' yang macet lebih dari 5 menit bisa diambil ulang
      await db.query(`UPDATE lna_training_plan_items SET assignment_status = 'sending', assignment_claimed_at = now() - interval '6 minutes', assignment_ref = NULL WHERE id = :id`, { replacements: { id: f.planT1 } });
      const svc2 = makeAssignments();
      const retry = await assign(app({ assignments: svc2 }), f.planT1);
      expect(retry.status).toBe(200);
      expect(svc2.calls).toHaveLength(1);
    });

    it('permintaan yang klaimnya sudah diambil alih tidak melaporkan terkirim', async () => {
      await ready();
      const fid = (await finding('beni', { title: 'Klaim basi', sessionId: null, reviewStatus: 'approved' })).id;
      const plan = await request(app()).post(`/api/tna/findings/${fid}/plan`).set(as('hr')).send({});
      const id = plan.body.data.id;
      let release; const gate = new Promise((r) => { release = r; });
      const slow = makeAssignments(async () => { await gate; return { ref: 'EM-LAMBAT' }; });
      const first = assign(app({ assignments: slow }), id).then((r) => r);
      for (let i = 0; i < 50 && slow.calls.length === 0; i += 1) await new Promise((r) => setTimeout(r, 20));
      await db.query(`UPDATE lna_training_plan_items SET assignment_claimed_at = now() - interval '6 minutes' WHERE id = :id`, { replacements: { id } });
      const takeover = await assign(app({ assignments: makeAssignments(() => ({ ref: 'EM-BARU' })) }), id, 'hr2');
      expect(takeover.status).toBe(200);
      release();
      const late = await first;
      expect(late.status).toBe(409);
      expect(late.body.error.code).toBe('ASSIGN_IN_PROGRESS');
      const [[row]] = await db.query('SELECT assignment_status AS s, assignment_ref AS ref FROM lna_training_plan_items WHERE id = :id', { replacements: { id } });
      expect(row).toEqual({ s: 'sent', ref: 'EM-BARU' });
      const results = (await audits('tna.plan_assignment')).filter((r) => r.meta.objectIds && r.meta.objectIds.includes(id)).map((r) => r.meta.result);
      expect(results.sort()).toEqual(['sent', 'superseded']);
    });

    it('kegagalan EliteMentor setelah klaim diambil alih menjawab 409, bukan 502', async () => {
      await ready();
      const fid = (await finding('beni', { title: 'Klaim basi gagal', sessionId: null, reviewStatus: 'approved' })).id;
      const plan = await request(app()).post(`/api/tna/findings/${fid}/plan`).set(as('hr')).send({});
      const id = plan.body.data.id;
      let release; const gate = new Promise((r) => { release = r; });
      const slow = makeAssignments(async () => { await gate; throw new Error('timeout'); });
      const first = assign(app({ assignments: slow }), id).then((r) => r);
      for (let i = 0; i < 50 && slow.calls.length === 0; i += 1) await new Promise((r) => setTimeout(r, 20));
      await db.query(`UPDATE lna_training_plan_items SET assignment_claimed_at = now() - interval '6 minutes' WHERE id = :id`, { replacements: { id } });
      const takeover = await assign(app({ assignments: makeAssignments(() => ({ ref: 'EM-BARU' })) }), id, 'hr2');
      expect(takeover.status).toBe(200);
      release();
      const late = await first;
      expect(late.status).toBe(409);
      expect(late.body.error.code).toBe('ASSIGN_IN_PROGRESS');
      const [[row]] = await db.query('SELECT assignment_status AS s FROM lna_training_plan_items WHERE id = :id', { replacements: { id } });
      expect(row.s).toBe('sent');
    });
  });

  describe('ekspor gap ke LMS klien', () => {
    it('CSV: kolom, sel formula dinetralkan, hanya tenant sendiri, tidak mengubah data, audit', async () => {
      const a = app();
      await setSettings({ lms: { delivery: 'lms_export' } });
      const before = await db.query('SELECT id, status, updated_at FROM lna_training_plan_items WHERE tenant_id = :t ORDER BY id', { replacements: { t: tenant.id }, type: 'SELECT' });
      const res = await request(a).get('/api/tna/plan-items/export.csv').set(as('hr'));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="gap-pelatihan-\d{4}-\d{2}-\d{2}\.csv"/);
      const lines = res.text.replace(/^\uFEFF/, '').trim().split('\r\n');
      expect(lines[0]).toBe('ID Karyawan,Nama,Email,Kompetensi,Kode Course,Judul Course,Program,Status Rencana');
      expect(lines).toHaveLength(6); // header + satu baris per rencana aktif tenant ini
      expect(lines.filter((l) => l.startsWith('E-beni,beni,beni@b7.test,,,,,'))).toHaveLength(1); // tanpa rencana ganda
      expect(lines).toContain("E-ani,'=Ani,ani@b7.test,Pemahaman SLA,EM-101,Dasar SLA,,Baru");
      expect(lines.some((l) => l.startsWith('E-beni,beni,beni@b7.test,,,,,'))).toBe(true); // rencana tanpa course ikut
      const after = await db.query('SELECT id, status, updated_at FROM lna_training_plan_items WHERE tenant_id = :t ORDER BY id', { replacements: { t: tenant.id }, type: 'SELECT' });
      expect(after).toEqual(before);
      const log = await audits('tna.plan_items');
      expect(log.filter((r) => r.action === 'export').pop().meta).toMatchObject({ count: 5 });
      expect((await request(a).get('/api/tna/plan-items/export.csv').set(as('spv'))).status).toBe(403);
      expect((await request(a).get('/api/tna/plan-items/export.csv?projectId=bukan').set(as('hr'))).status).toBe(400);
      const x = await request(a).get('/api/tna/plan-items/export.csv').set(as('xhr'));
      expect(x.text.replace(/^\uFEFF/, '').trim().split('\r\n')).toHaveLength(1);
      await setSettings({});
    });
  });

  describe('serah ke Improvement Needs', () => {
    const handoff = (a, ids, who = 'hr') => request(a).post('/api/tna/review/improvement-handoff').set(as(who)).send({ findingIds: ids });

    it('INA mati -> 409; isian salah 400', async () => {
      const a = app();
      expect((await handoff(a, [f.h])).body.error.code).toBe('INA_DISABLED');
      await setFlag('module.ina', true);
      expect((await handoff(a, [])).status).toBe(400);
      expect((await handoff(a, ['bukan-uuid'])).status).toBe(400);
      expect((await handoff(a, [f.h], 'spv')).status).toBe(403);
    });

    it('meneruskan yang memenuhi syarat; sisanya already atau skipped; terkunci dari klasifikasi ulang', async () => {
      const a = app();
      const res = await handoff(a, [f.h, f.t1, f.late, f.x, f.h]);
      expect(res.status).toBe(200);
      expect(res.body.data.handedOff).toEqual([f.h]);
      expect(res.body.data.already).toEqual([]);
      expect(res.body.data.skipped.sort()).toEqual([f.t1, f.late, f.x].sort());
      const again = await handoff(a, [f.h]);
      expect(again.body.data).toEqual({ handedOff: [], already: [f.h], skipped: [] });
      expect((await classify(a, f.h, 'training')).body.error.code).toBe('ALREADY_ACTIONED');
      const sol = await request(a).get('/api/tna/review/solutions').set(as('hr'));
      expect(sol.body.data.inaEnabled).toBe(true);
      expect(sol.body.data.improvement.find((x) => x.findingId === f.h).handedOffAt).toBeTruthy();
      expect((await audits('tna.improvement_handoff'))[0].meta).toMatchObject({ objectIds: [f.h], employeeIds: [u.ani] });
    });

    it('kontrak B9: listImprovementHandoffs tanpa data individu', async () => {
      const rows = await stores.tna.listImprovementHandoffs(tenant.id);
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]).sort()).toEqual(['findingId', 'handedOffAt', 'handedOffBy', 'metricName', 'projectId', 'title']);
      expect(rows[0]).toMatchObject({ findingId: f.h, projectId, title: 'Ragu-ragu', handedOffBy: u.hr });
      expect(await stores.tna.listImprovementHandoffs(tenant.id, { since: new Date(Date.now() + 60000) })).toEqual([]);
      expect(await stores.tna.listImprovementHandoffs(other.id)).toEqual([]);
    });
  });
  describe('pembekuan setelah tarik persetujuan (keputusan user 19 Nov: bekukan, data tetap disimpan)', () => {
    it('temuan dan rencana dari sesi yang ditarik tidak diproses lagi, datanya tetap ada', async () => {
      const a = app();
      const ws = await stores.interviews.create(tenant.id, { projectId, submodule: 'tna', intervieweeId: u.beni });
      await db.query(`UPDATE lna_interview_sessions SET status = 'completed', ended_at = now() WHERE id = :id`, { replacements: { id: ws.id } });
      const mk = async (title, category, extra = {}) => (await finding('beni', { title, category, sessionId: ws.id, reviewStatus: 'approved', ...extra })).id;
      const trPlanned = await mk('Beku berencana', 'training');
      const [[kb]] = await db.query(`INSERT INTO lna_competencies (tenant_id, kind, name) VALUES (:t, 'job', 'Kompetensi beku') RETURNING id`, { replacements: { t: tenant.id } });
      const trOpen = await mk('Beku tanpa rencana', 'training', { competencyId: kb.id });
      const imHanded = await mk('Beku sudah diserahkan', 'non_training');
      const imOpen = await mk('Beku belum diserahkan', 'non_training');
      await setFlag('module.ina', true);
      expect((await request(a).post('/api/tna/review/improvement-handoff').set(as('hr')).send({ findingIds: [imHanded] })).body.data.handedOff).toEqual([imHanded]);
      const plan = await stores.tna.insertPlanItem(tenant.id, { findingId: trPlanned, userId: u.beni, origin: 'hr', status: 'new', catalogSource: 'elitementor', catalogItemRef: 'EM-BEKU', catalogItemTitle: 'Kursus beku' });
      await db.query(`UPDATE lna_findings SET status = 'planned' WHERE id = :id`, { replacements: { id: trPlanned } });

      const liBefore = (await stores.li.listTrainingGaps(tenant.id, { all: true })).filter((g) => g.userId === u.beni).length;
      const all = { all: true };
      const aggBefore = {
        plans: await stores.tna.planStatusCounts(tenant.id, all),
        improvement: await stores.tna.improvementCounts(tenant.id),
        review: await stores.tna.reviewCounts(tenant.id),
      };
      // karyawan menarik persetujuan
      await db.query('UPDATE lna_interview_sessions SET consent_withdrawn_at = now() WHERE id = :id', { replacements: { id: ws.id } });

      const re = await classify(a, trOpen, 'improvement');
      expect(re.status).toBe(409);
      expect(re.body.error.code).toBe('CONSENT_WITHDRAWN');
      const pl = await request(a).post(`/api/tna/findings/${trOpen}/plan`).set(as('hr')).send({});
      expect(pl.status).toBe(409);
      expect(pl.body.error.code).toBe('CONSENT_WITHDRAWN');
      const asg = await request(a).post(`/api/tna/plan-items/${plan.id}/assign`).set(as('hr')).send({});
      expect(asg.status).toBe(409);
      expect(asg.body.error.code).toBe('CONSENT_WITHDRAWN');

      const sol = (await request(a).get('/api/tna/review/solutions').set(as('hr'))).body.data;
      const solIds = [...sol.training, ...sol.improvement].map((x) => x.findingId);
      for (const id of [trPlanned, trOpen, imHanded, imOpen]) expect(solIds).not.toContain(id);

      const csv = await request(a).get('/api/tna/plan-items/export.csv').set(as('hr'));
      expect(csv.text).not.toContain('EM-BEKU');

      const ho = (await request(a).post('/api/tna/review/improvement-handoff').set(as('hr')).send({ findingIds: [imOpen] })).body.data;
      expect(ho).toMatchObject({ handedOff: [], skipped: [imOpen] });
      // yang sudah diserahkan sebelum penarikan tidak dilaporkan "sudah diserahkan" (INA tidak melihatnya lagi)
      const ho2 = (await request(a).post('/api/tna/review/improvement-handoff').set(as('hr')).send({ findingIds: [imHanded] })).body.data;
      expect(ho2).toMatchObject({ handedOff: [], already: [], skipped: [imHanded] });

      // jalur lain yang memproses temuan/rencana
      const patch = await request(a).patch(`/api/tna/plan-items/${plan.id}`).set(as('hr')).send({ status: 'in_progress' });
      expect(patch.status).toBe(409);
      expect(patch.body.error.code).toBe('CONSENT_WITHDRAWN');
      expect(await stores.catalog.completePlansForPassed(tenant.id, [{ userId: u.beni, ref: 'EM-BEKU' }], 'elitementor')).toBe(0);
      await setFlag('ina.dashboard', true);
      const act = await request(a).post('/api/ina/actions').set(as('hr')).send({
        title: 'Dari temuan beku', category: 'sop', ownerUserId: u.hr, dueDate: '2030-01-31', findingId: imOpen, involvesIndividual: false,
      });
      expect(act.status).toBe(409);
      expect(act.body.error.code).toBe('CONSENT_WITHDRAWN');
      await setFlag('tna.training_request', true);
      const trq = await request(a).post('/api/tna/training-requests').set(as('beni')).send({ findingId: trOpen });
      expect(trq.status).toBe(409);
      expect(trq.body.error.code).toBe('CONSENT_WITHDRAWN');
      await setFlag('tna.training_request', false);
      const par = (await request(a).get('/api/tna/pareto').set(as('hr'))).body.data.map((x) => x.id || x.findingId);
      for (const id of [trPlanned, trOpen]) expect(par).not.toContain(id);
      expect((await stores.tna.findingsForGaps(tenant.id, { all: true })).map((x) => x.id)).not.toContain(trOpen);
      const liAfter = (await stores.li.listTrainingGaps(tenant.id, { all: true })).filter((g) => g.userId === u.beni).length;
      expect(liAfter).toBe(liBefore - 2); // trPlanned dan trOpen tidak lagi dihitung

      // agregat dasbor dan asisten ikut mengecualikan (pilihan user: "tidak ikut ... agregat dasbor"; DPIA R12)
      const plansAfter = await stores.tna.planStatusCounts(tenant.id, all);
      expect(plansAfter.byStatus.new || 0).toBe((aggBefore.plans.byStatus.new || 0) - 1);
      expect(await stores.tna.improvementCounts(tenant.id)).toEqual({
        decided: aggBefore.improvement.decided - 2, handedOff: aggBefore.improvement.handedOff - 1,
      });
      expect((await stores.tna.reviewCounts(tenant.id)).approved).toBe(aggBefore.review.approved - 4);
      const frozenIds = [trPlanned, trOpen, imHanded, imOpen];
      expect((await stores.tna.listFindings(tenant.id, all, { categories: ['training', 'non_training'], excludeFrozen: true })).map((x) => x.id).filter((id) => frozenIds.includes(id))).toEqual([]);
      expect((await stores.tna.listPlanItems(tenant.id, all, { excludeFrozen: true })).map((x) => x.id)).not.toContain(plan.id);
      expect((await stores.tna.listNonTrainingSummary(tenant.id, { excludeFrozen: true })).map((x) => x.id)).not.toContain(imOpen);
      expect((await stores.tna.topTrainingGaps(tenant.id, all, 50)).map((g) => g.competency)).not.toContain('Kompetensi beku');
      expect((await stores.tna.listImprovementHandoffs(tenant.id)).map((x) => x.findingId)).not.toContain(imHanded);

      // data tetap disimpan
      const [{ n }] = await db.query('SELECT count(*)::int AS n FROM lna_findings WHERE session_id = :id', { replacements: { id: ws.id }, type: 'SELECT' });
      expect(n).toBe(4);
      const [[kept]] = await db.query('SELECT status FROM lna_training_plan_items WHERE id = :id', { replacements: { id: plan.id } });
      expect(kept.status).toBe('new');
    });
  });

  // Paritas B7 web (docs/designs/paritas-mockup/b7-tinjauan-web.md keputusan 3): layar tinjauan per gap.
  // Keanggotaan temuan di gap memakai aturan R6 papan gap (kompetensi, baris kinerja, atau fokus sesi).
  describe('tinjauan per gap', () => {
    const g = {}; let gapComp; let otherComp;
    const review = (q, who = 'hr') => request(app()).get(`/api/tna/review?${new URLSearchParams(q)}`).set(as(who));
    const ids = (res) => res.body.data.map((x) => x.id).sort();

    beforeAll(async () => {
      const [[c]] = await db.query(`INSERT INTO lna_competencies (tenant_id, kind, name) VALUES (:t, 'job', 'Analisis insiden') RETURNING id`, { replacements: { t: tenant.id } });
      gapComp = c.id;
      const [[xc]] = await db.query(`INSERT INTO lna_competencies (tenant_id, kind, name) VALUES (:t, 'job', 'Milik tenant lain') RETURNING id`, { replacements: { t: other.id } });
      otherComp = xc.id;
      // sesi berfokus gap ini (B5 penugasan wawancara); temuannya tidak tertaut kompetensi
      const s = await stores.interviews.create(tenant.id, { projectId, submodule: 'tna', intervieweeId: u.beni });
      await db.query(`UPDATE lna_interview_sessions SET status = 'completed', ended_at = now(), focus_kind = 'competency',
                             focus_competency_id = :c, focus_label = 'Analisis insiden' WHERE id = :id`, { replacements: { id: s.id, c: gapComp } });
      await stores.interviews.addTurn(tenant.id, s.id, 'human', 'RAHASIA-GAP');
      const [[rec]] = await db.query(
        `INSERT INTO lna_performance_records (tenant_id, project_id, user_id, metric_type, name, target, actual, is_met, period, direction)
         VALUES (:t, :p, :u, 'sla', 'Respons tiket B7', 85, 70, false, '2026-11', 'higher') RETURNING id`,
        { replacements: { t: tenant.id, p: projectId, u: u.ani } },
      );
      g.a = (await finding('ani', { title: 'Belum paham langkah RCA', competencyId: gapComp, detail: 'RINCIAN-RAHASIA' })).id;
      await setAi(g.a, 0.9);
      g.b = (await finding('beni', { title: 'Tidak ada template baku', category: 'non_training', competencyId: null, sessionId: s.id })).id;
      g.e = (await finding('beni', { title: 'Sudah disetujui', competencyId: gapComp, sessionId: null, reviewStatus: 'approved' })).id;
      g.r = (await finding('ani', { title: 'Ditolak', competencyId: gapComp, reviewStatus: 'rejected' })).id;
      g.other = (await finding('ani', { title: 'Gap lain' })).id; // kompetensi Pemahaman SLA
      g.okr = (await finding('ani', { title: 'Respons lambat', category: 'non_training', competencyId: null, sessionId: null, performanceRecordId: rec.id, reviewStatus: 'approved' })).id;
    });

    it('gap kompetensi: hanya temuan gap itu (termasuk lewat fokus sesi), counts per gap, label gap, tanpa transkrip', async () => {
      const all = await review({ kind: 'competency', competencyId: gapComp, status: 'all' });
      expect(all.status).toBe(200);
      expect(ids(all)).toEqual([g.a, g.b, g.e, g.r].sort());
      expect(all.body.counts).toMatchObject({ draft: 2, approved: 1, edited: 0, rejected: 1, held: 0 });
      expect(all.body.gap).toEqual({ key: `c:${gapComp}`, label: 'Analisis insiden' });
      expect(JSON.stringify(all.body)).not.toContain('RAHASIA-GAP');
      // tanpa rincian temuan (PO-6 A): layar per gap hanya judul dan klasifikasi
      expect(JSON.stringify(all.body)).not.toContain('RINCIAN-RAHASIA');
      const item = all.body.data.find((x) => x.id === g.a);
      for (const k of ['metricType', 'metricPeriod', 'focusKind', 'focusCompetencyId', 'focusMetricType', 'focusMetricKey', 'focusPeriod']) expect(item).not.toHaveProperty(k);
      for (const k of ['detail', 'originalDetail', 'summaryNote']) expect(item).not.toHaveProperty(k);
      // status bawaan tetap draf
      expect(ids(await review({ kind: 'competency', competencyId: gapComp }))).toEqual([g.a, g.b].sort());
      // tanpa filter gap: perilaku lama, temuan gap lain ikut
      expect(ids(await review({ status: 'all' }))).toEqual(expect.arrayContaining([g.a, g.other, g.okr]));
    });

    it('gap OKR lewat baris kinerja temuan', async () => {
      const res = await review({ kind: 'okr', metricType: 'sla', name: 'Respons tiket B7', period: '2026-11', status: 'all' });
      expect(res.status).toBe(200);
      expect(ids(res)).toEqual([g.okr]);
      expect(res.body.gap).toEqual({ key: 'o:sla|respons tiket b7|2026-11', label: 'Respons tiket B7' });
      // nama target dirapikan seperti parseGap (spasi berlebih); lebih dari 255 karakter ditolak
      const messy = await review({ kind: 'okr', metricType: 'sla', name: '  Respons   tiket B7 ', period: '2026-11', status: 'all' });
      expect(messy.body.gap).toEqual({ key: 'o:sla|respons tiket b7|2026-11', label: 'Respons tiket B7' });
      expect(ids(messy)).toEqual([g.okr]);
      expect((await review({ kind: 'okr', metricType: 'sla', name: 'x'.repeat(256), period: '2026-11' })).status).toBe(400);
    });

    it('rujukan gap tidak valid 400, kompetensi tenant lain 404, hanya HR', async () => {
      expect((await review({ kind: 'lain' })).status).toBe(400);
      expect((await review({ kind: 'competency', competencyId: 'bukan-uuid' })).status).toBe(400);
      expect((await review({ kind: 'okr', metricType: 'sla', name: '', period: '2026-11' })).status).toBe(400);
      expect((await review({ kind: 'competency', competencyId: otherComp })).status).toBe(404);
      expect((await review({ kind: 'competency', competencyId: gapComp }, 'spv')).status).toBe(403);
      expect((await review({ kind: 'competency', competencyId: gapComp }, 'ani')).status).toBe(403);
      // projectId bukan UUID -> 400, bukan galat cast di database
      expect((await review({ kind: 'competency', competencyId: gapComp, projectId: 'bukan-uuid' })).status).toBe(400);
      expect((await review({ projectId: 'bukan-uuid' })).status).toBe(400);
      expect((await review({ kind: 'competency', competencyId: gapComp, projectId })).status).toBe(200);
    });

    it('temuan dari wawancara yang persetujuannya ditarik tidak ikut data, counts, maupun solusi per gap', async () => {
      const ws = await stores.interviews.create(tenant.id, { projectId, submodule: 'tna', intervieweeId: u.ani });
      await db.query(`UPDATE lna_interview_sessions SET status = 'completed', ended_at = now(), consent_withdrawn_at = now() WHERE id = :id`, { replacements: { id: ws.id } });
      const wd = (await finding('ani', { title: 'Ditarik draf', competencyId: gapComp, sessionId: ws.id })).id;
      const wa = (await finding('ani', { title: 'Ditarik disetujui', competencyId: gapComp, sessionId: ws.id, reviewStatus: 'approved' })).id;
      const q = { kind: 'competency', competencyId: gapComp };
      const all = await review({ ...q, status: 'all' });
      expect(ids(all)).toEqual([g.a, g.b, g.e, g.r].sort());
      expect(all.body.counts).toMatchObject({ draft: 2, approved: 1, rejected: 1 });
      const sol = await request(app()).get(`/api/tna/review/solutions?${new URLSearchParams(q)}`).set(as('hr'));
      const solIds = [...sol.body.data.training, ...sol.body.data.improvement].map((x) => x.findingId);
      expect(solIds).not.toContain(wd);
      expect(solIds).not.toContain(wa);
    });

    // Audit 39-2 (aturan CLAUDE.md 3): filter gap di GET /review ikut flag tna.review_workspace, pola sama dengan requireFlag
    it('flag tna.review_workspace mati: filter gap 403 FEATURE_DISABLED, antrean lama tanpa filter tetap jalan', async () => {
      await setFlag('tna.review_workspace', false);
      try {
        const res = await review({ kind: 'competency', competencyId: gapComp });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FEATURE_DISABLED');
        // rujukan tidak valid juga tidak diproses sebelum gerbang flag
        expect((await review({ kind: 'lain' })).status).toBe(403);
        expect((await review({ status: 'all' })).status).toBe(200);
        expect((await review({ kind: '' })).status).toBe(200);
      } finally { await setFlag('tna.review_workspace', true); }
    });

    // Audit 39-3: filter gap didorong ke query store, jadi baris di luar gap tidak dimuat maupun didekripsi
    it('store reviewQueue dengan gap hanya memuat temuan kandidat gap itu, ber-tenant, tanpa temuan beku', async () => {
      const statuses = ['draft', 'approved', 'edited', 'rejected'];
      const comp = (await stores.tna.reviewQueue(tenant.id, { statuses, gap: { kind: 'competency', competencyId: gapComp } })).map((x) => x.id);
      expect(comp).toEqual(expect.arrayContaining([g.a, g.b, g.e, g.r]));
      expect(comp).not.toContain(g.other);
      expect(comp).not.toContain(g.okr);
      const okr = (await stores.tna.reviewQueue(tenant.id, { statuses, gap: { kind: 'okr', metricType: 'sla', metricKey: 'respons tiket b7', period: '2026-11' } })).map((x) => x.id);
      expect(okr).toEqual([g.okr]);
      expect(await stores.tna.reviewQueue(other.id, { statuses, gap: { kind: 'competency', competencyId: gapComp } })).toEqual([]);
      const ws = await stores.interviews.create(tenant.id, { projectId, submodule: 'tna', intervieweeId: u.ani });
      await db.query(`UPDATE lna_interview_sessions SET status = 'completed', ended_at = now(), consent_withdrawn_at = now() WHERE id = :id`, { replacements: { id: ws.id } });
      const frozen = (await finding('ani', { title: 'Beku disetujui', competencyId: gapComp, sessionId: ws.id, reviewStatus: 'approved' })).id;
      expect((await stores.tna.reviewQueue(tenant.id, { statuses, gap: { kind: 'competency', competencyId: gapComp } })).map((x) => x.id)).not.toContain(frozen);
    });

    it('solusi per gap: hanya temuan gap itu', async () => {
      const q = new URLSearchParams({ kind: 'competency', competencyId: gapComp });
      const res = await request(app()).get(`/api/tna/review/solutions?${q}`).set(as('hr'));
      expect(res.status).toBe(200);
      expect(res.body.data.training.map((x) => x.findingId)).toEqual([g.e]);
      expect(res.body.data.improvement).toEqual([]);
      const okr = await request(app()).get(`/api/tna/review/solutions?${new URLSearchParams({ kind: 'okr', metricType: 'sla', name: 'Respons tiket B7', period: '2026-11' })}`).set(as('hr'));
      expect(okr.body.data.training).toEqual([]);
      expect(okr.body.data.improvement.map((x) => x.findingId)).toEqual([g.okr]);
      expect((await request(app()).get('/api/tna/review/solutions?kind=lain').set(as('hr'))).status).toBe(400);
      expect((await request(app()).get(`/api/tna/review/solutions?${new URLSearchParams({ kind: 'competency', competencyId: otherComp })}`).set(as('hr'))).status).toBe(404);
      expect((await request(app()).get(`/api/tna/review/solutions?${q}`).set(as('spv'))).status).toBe(403);
      const unfiltered = await request(app()).get('/api/tna/review/solutions').set(as('hr'));
      expect(unfiltered.body.data.training.length).toBeGreaterThan(1);
    });
  });

  // Pertahanan berlapis: join kompetensi dan baris kinerja ikut memfilter tenant, jadi rujukan silang tenant
  // (yang tidak dicegah FK) tidak membocorkan nama milik tenant lain.
  describe('join kompetensi dan kinerja dibatasi tenant', () => {
    it('nama kompetensi dan target tenant lain tidak ikut di antrean maupun solusi', async () => {
      const a = app();
      const [[xc]] = await db.query(`INSERT INTO lna_competencies (tenant_id, kind, name) VALUES (:t, 'job', 'KOMPETENSI-TENANT-LAIN') RETURNING id`, { replacements: { t: other.id } });
      const [[xp]] = await db.query('SELECT id FROM lna_projects WHERE tenant_id = :t LIMIT 1', { replacements: { t: other.id } });
      const [[xr]] = await db.query(
        `INSERT INTO lna_performance_records (tenant_id, project_id, user_id, metric_type, name, target, actual, is_met, period, direction)
         VALUES (:t, :p, :u, 'sla', 'TARGET-TENANT-LAIN', 85, 70, false, '2026-11', 'higher') RETURNING id`,
        { replacements: { t: other.id, p: xp.id, u: u.xl } },
      );
      const draft = (await finding('ani', { title: 'Rujukan silang draf', competencyId: xc.id, performanceRecordId: xr.id, sessionId: null })).id;
      const done = (await finding('ani', { title: 'Rujukan silang', competencyId: xc.id, performanceRecordId: xr.id, sessionId: null, reviewStatus: 'approved' })).id;
      const queue = await request(a).get('/api/tna/review?status=all').set(as('hr'));
      expect(queue.status).toBe(200);
      expect(queue.body.data.find((x) => x.id === draft)).toMatchObject({ competencyName: null, metricName: null });
      expect(JSON.stringify(queue.body)).not.toContain('TENANT-LAIN');
      const sol = await request(a).get('/api/tna/review/solutions').set(as('hr'));
      expect(sol.body.data.training.find((x) => x.findingId === done)).toMatchObject({ competencyName: null });
      expect(JSON.stringify(sol.body)).not.toContain('TENANT-LAIN');
    });
  });
});
