// PK-23: aturan bisnis wajib saat live, diuji di Postgres (PM-8 ★ B+C+D+E, PM-6 ★ B, PD-15 ★ A).
// Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan (CI menyiapkannya).
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { createCatalogService, memoryAdapter } = require('../../src/integrations/catalog');
const { memoryMailer } = require('../../src/integrations/mailer');
const { runInterviewReminders } = require('../../src/jobs/interview-reminders');
const { main: runJob } = require('../../scripts/run-job');
const { makeConfig } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const DAY = 24 * 60 * 60 * 1000;

run('Aturan bisnis wajib live (Postgres)', () => {
  let db; let app; let stores; let tokens; let tenant; let projectId; let sessionId; let findingId;
  const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const flag = (key, enabled) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled)
     ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t: tenant.id, key, enabled } },
  );
  const session = async () => (await db.query(
    `SELECT invite_expires_at AS "inviteExpiresAt", invite_extended_count AS n, reminder_h3_at AS h3, reminder_h1_at AS h1
       FROM lna_interview_sessions WHERE id = :id`, { replacements: { id: sessionId }, type: 'SELECT' }))[0];

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    const catalog = createCatalogService({ elitementor: memoryAdapter('elitementor', []) });
    app = createApp({ config, stores, catalog });
    tokens = createTokenService(config.jwt);
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'ELGOS aturan') RETURNING id`, { replacements: { slug: `rules-${Date.now()}` } });
    const add = async (key, role, sup = null) => {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status, supervisor_id)
         VALUES (:t, :email, :name, :emp, :role, 'active', :sup) RETURNING id`,
        { replacements: { t: tenant.id, email: `${key}@rules.test`, name: key, emp: `R-${key}`, role, sup } },
      );
      u[key] = row.id;
      tok[key] = tokens.sign({ id: row.id, tenantId: tenant.id, role, email: `${key}@rules.test` });
    };
    await add('hr', 'hr_admin');
    await add('spv', 'supervisor');
    await add('dimas', 'learner', u.spv);
    await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t: tenant.id } });
    await flag('module.tna', true);
    [[{ id: projectId }]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'L1') RETURNING id`, { replacements: { t: tenant.id } });
    await request(app).post('/api/tna/performance/import').set(as('hr')).send({
      period: '2026-11', projectId, rows: [{ employeeId: 'R-dimas', metricType: 'sla', name: 'Waktu respons', target: 15, actual: 30, direction: 'lower' }],
    }).expect(201);
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id = :id', { replacements: { id: tenant.id }, transaction });
    });
    await db.close();
  });

  it('Q38: undangan wawancara berlaku 7 hari sejak dijadwalkan', async () => {
    const before = Date.now();
    const res = await request(app).post(`/api/tna/projects/${projectId}/interviews`).set(as('hr')).send({ period: '2026-11' });
    expect(res.status).toBe(201);
    const s = res.body.data.sessions[0];
    sessionId = s.id;
    const ms = new Date(s.inviteExpiresAt).getTime() - before;
    expect(ms).toBeGreaterThan(7 * DAY - 60000);
    expect(ms).toBeLessThan(7 * DAY + 60000);
    const listed = (await request(app).get('/api/tna/sessions').set(as('dimas'))).body.data[0];
    expect(listed).toMatchObject({ id: sessionId, inviteExtendedCount: 0 });
  });

  it('Q38: undangan lewat tidak bisa dimulai; HR (bukan atasan/karyawan) memperpanjang', async () => {
    await db.query(`UPDATE lna_interview_sessions SET invite_expires_at = now() - interval '1 hour', reminder_h1_at = now() WHERE id = :id`, { replacements: { id: sessionId } });
    const blocked = await request(app).post(`/api/tna/sessions/${sessionId}/consent`).set(as('dimas'));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('INVITATION_EXPIRED');

    expect((await request(app).post(`/api/tna/sessions/${sessionId}/extend`).set(as('spv')).send({})).status).toBe(403);
    expect((await request(app).post(`/api/tna/sessions/${sessionId}/extend`).set(as('dimas')).send({})).status).toBe(403);
    expect((await request(app).post(`/api/tna/sessions/${sessionId}/extend`).set(as('hr')).send({ days: 45 })).status).toBe(400);

    const ext = await request(app).post(`/api/tna/sessions/${sessionId}/extend`).set(as('hr')).send({ days: 3 });
    expect(ext.status).toBe(200);
    const s = await session();
    expect(Number(s.n)).toBe(1);
    expect(s.h1).toBeNull(); // pengingat dikirim lagi untuk batas baru
    expect(new Date(s.inviteExpiresAt).getTime() - Date.now()).toBeGreaterThan(3 * DAY - 60000);
    const [[audit]] = await db.query(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'tna.interview_invitation'`, { replacements: { t: tenant.id } });
    expect(audit.meta).toMatchObject({ days: 3, employeeIds: [u.dimas] });
  });

  it('PRJ-6 + PD-15: job mengirim pengingat H-3 sekali saja, lewat scripts/run-job.js', async () => {
    // Batas = tiga tanggal WIB dari "sekarang" job
    const now = new Date();
    await db.query(`UPDATE lna_interview_sessions SET invite_expires_at = :at, reminder_h3_at = NULL, reminder_h1_at = NULL WHERE id = :id`,
      { replacements: { id: sessionId, at: new Date(now.getTime() + 3 * DAY) } });
    const mailer = memoryMailer();
    const first = await runInterviewReminders({ stores, mailer, appBaseUrl: 'https://app.test', now });
    const mine = mailer.sent.filter((m) => m.to === 'dimas@rules.test');
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toMatch(/3 hari/);
    expect(first.failed).toBe(0);
    expect((await session()).h3).not.toBeNull();
    await runInterviewReminders({ stores, mailer, appBaseUrl: 'https://app.test', now });
    expect(mailer.sent.filter((m) => m.to === 'dimas@rules.test')).toHaveLength(1);
    // perintah sekali jalan untuk timer systemd: nama tak dikenal = kode keluar 2
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await runJob(['tidak-ada'])).toBe(2);
    err.mockRestore();
  });

  it('PM-6 B: temuan non-training hanya untuk HR, ringkas, di balik flag', async () => {
    await request(app).post(`/api/tna/sessions/${sessionId}/consent`).set(as('dimas')).expect(200);
    await request(app).post(`/api/tna/sessions/${sessionId}/turns`).set(as('dimas')).send({ text: 'Saya belum paham kontrak; SOP juga belum diperbarui dan tools lambat.' }).expect(200);
    await request(app).post(`/api/tna/sessions/${sessionId}/complete`).set(as('dimas')).expect(200);

    expect((await request(app).get('/api/tna/findings/non-training').set(as('hr'))).status).toBe(403); // flag mati = PM-6 C
    await flag('tna.non_training_hr', true);
    const hr = await request(app).get('/api/tna/findings/non-training').set(as('hr'));
    expect(hr.status).toBe(200);
    expect(hr.body.data.length).toBeGreaterThan(0);
    expect(hr.body.data[0]).toMatchObject({ userName: 'dimas' });
    expect(hr.body.data[0]).not.toHaveProperty('detail');
    expect((await request(app).get('/api/tna/findings/non-training').set(as('spv'))).status).toBe(403);
    expect((await request(app).get('/api/tna/findings/non-training').set(as('dimas'))).status).toBe(403);
    const spvFindings = (await request(app).get('/api/tna/findings').set(as('spv'))).body.data;
    expect(spvFindings.every((f) => f.category === 'training')).toBe(true);
    // tanpa rencana aksi: temuan non-training tidak bisa dibuatkan rencana
    expect((await request(app).post(`/api/tna/findings/${hr.body.data[0].id}/plan`).set(as('hr')).send({})).status).toBe(404);
    findingId = spvFindings[0].id;
  });

  it('PM-8 B: permintaan training dari karyawan ditolak selama BT-31 ditunda', async () => {
    const res = await request(app).post('/api/tna/training-requests').set(as('dimas')).send({ findingId });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FEATURE_DISABLED');
  });

  it('K-3: rencana mulai Baru dan hanya berpindah status yang sah', async () => {
    const plan = await request(app).post(`/api/tna/findings/${findingId}/plan`).set(as('hr')).send({});
    expect(plan.body.data).toMatchObject({ status: 'new', needsModule: true });
    const id = plan.body.data.id;
    const patch = (status, who = 'hr') => request(app).patch(`/api/tna/plan-items/${id}`).set(as(who)).send({ status });
    const skip = await patch('completed');
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe('INVALID_TRANSITION');
    expect((await patch('proposed')).status).toBe(400); // status lama tidak berlaku lagi
    expect((await patch('in_progress', 'spv')).status).toBe(200);
    expect((await patch('completed')).status).toBe(200);
    expect((await patch('rejected')).status).toBe(409);
    const list = await request(app).get('/api/tna/plan-items').set(as('hr'));
    expect(list.body.statusLabels).toMatchObject({ requested: 'Diminta', new: 'Baru', in_progress: 'Berjalan', completed: 'Selesai', rejected: 'Ditolak' });
    expect(list.body.data.find((p) => p.id === id).status).toBe('completed');
  });
});
