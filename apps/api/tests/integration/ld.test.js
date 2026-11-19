// B14 Learning Delivery (Postgres): pelatihan offline (peserta, kehadiran, asesmen, dokumentasi), pelatihan online
// dari LMS dan webhook EliteMentor, ringkasan + insight, pengingat, isolasi tenant, dan gating.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { memoryMailer } = require('../../src/integrations/mailer');
const { memoryStorage } = require('../../src/integrations/storage');
const { sign } = require('../../src/integrations/elitementor/webhook');
const { makeConfig } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const PDF = Buffer.from('%PDF-1.7\nisi materi');
const SECRET = 'rahasia-webhook-uji';
const day = (offset) => new Date(Date.now() + 7 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);

run('Learning Delivery (Postgres)', () => {
  let db; let app; let appNoStorage; let stores; let tenant; let other; const u = {}; const tok = {};
  let role; let mailer; let storage; let orgId; let training;
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const get = (path, who = 'hr') => request(app).get(`/api/ld${path}`).set(as(who));
  const send = (method, path, body, who = 'hr') => request(app)[method](`/api/ld${path}`).set(as(who)).send(body || {});
  const upload = (id, buf, q = 'kind=photo&filename=foto.png', who = 'hr', a = app) => request(a).post(`/api/ld/trainings/${id}/documents?${q}`).set(as(who)).set('Content-Type', 'application/octet-stream').send(buf);
  const audits = async (resource) => (await db.query('SELECT action, meta FROM audit_logs WHERE tenant_id = :t AND resource = :resource ORDER BY id', { replacements: { t: tenant.id, resource } }))[0];
  const flag = (key, enabled, t = tenant.id) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled) ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t, key, enabled } });
  let seq = 0;
  const hook = (event, { secret = SECRET, raw } = {}) => {
    const body = raw || JSON.stringify({ id: `ev-${Date.now()}-${seq += 1}`, organizationId: orgId, occurredAt: new Date().toISOString(), ...event });
    const ts = String(Math.floor(Date.now() / 1000));
    return request(app).post('/api/integrations/elitementor/webhook').set('Content-Type', 'application/json').set('X-EM-Timestamp', ts).set('X-EM-Signature', sign(secret, ts, body)).send(body);
  };
  const events = async () => (await db.query('SELECT event_id, type, result FROM ld_sync_events WHERE tenant_id = :t ORDER BY received_at, event_id', { replacements: { t: tenant.id } }))[0];

  beforeAll(async () => {
    const config = makeConfig({ ELITEMENTOR_WEBHOOK_SECRET: SECRET, APP_BASE_URL: 'https://elgos.test' });
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    mailer = memoryMailer(); storage = memoryStorage();
    app = createApp({ config, stores, mailer, storage });
    appNoStorage = createApp({ config, stores, mailer, storage: null });
    const tokens = createTokenService(config.jwt);
    const slug = `ld-${Date.now()}`;
    orgId = Math.floor(Date.now() / 1000) % 2000000000;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name, elitementor_organization_id) VALUES (:slug, 'LD uji', :orgId) RETURNING id`, { replacements: { slug, orgId } });
    [[other]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Lain') RETURNING id`, { replacements: { slug: `${slug}-x` } });
    const people = [['hr', 'hr_admin', tenant.id], ['eta', 'eta_admin', tenant.id], ['atasan', 'supervisor', tenant.id], ['dimas', 'learner', tenant.id], ['rina', 'learner', tenant.id],
      ['sari', 'learner', tenant.id], ['nonaktif', 'learner', tenant.id], ['luar', 'hr_admin', other.id], ['asing', 'learner', other.id]];
    for (const [key, r, t] of people) {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, :email, :key, :emp, :role, :status) RETURNING id`,
        { replacements: { t, email: `${key}@ld.test`, key, emp: `E-${key}`, role: r, status: key === 'nonaktif' ? 'disabled' : 'active' } },
      );
      u[key] = row.id;
      tok[key] = tokens.sign({ id: row.id, tenantId: t, role: r, email: `${key}@ld.test` });
    }
    for (const t of [tenant.id, other.id]) {
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t } });
      await flag('module.ld', true, t);
    }
    [[role]] = await db.query(`INSERT INTO lna_job_roles (tenant_id, name) VALUES (:t, 'Engineer Service Delivery') RETURNING id`, { replacements: { t: tenant.id } });
    await db.query('UPDATE users SET job_role_id = :r WHERE id IN (:ids)', { replacements: { r: role.id, ids: [u.dimas, u.rina, u.nonaktif] } });
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.close();
  });

  it('gating: hanya HR; flag module.ld mati menutup modul', async () => {
    for (const who of ['atasan', 'dimas']) expect((await get('/trainings', who)).status).toBe(403);
    await flag('module.ld', false);
    expect((await get('/trainings')).status).toBe(403);
    await flag('module.ld', true);
    const res = await get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ generatedBy: 'rules', kpis: { running: 0, upcoming: 0, activeLearners: 0, attention: 0 }, insights: [], actions: [] });
  });

  it('pelatihan offline: validasi, default vendor dari pengaturan, tanggal selesai = mulai', async () => {
    expect((await send('post', '/trainings', { title: 'Tanpa tanggal' })).status).toBe(400);
    expect((await send('post', '/trainings', { title: 'X', startsOn: '2026-02-31' })).status).toBe(400);
    expect((await send('post', '/trainings', { title: 'X', startsOn: day(5), endsOn: day(4) })).status).toBe(400);
    expect((await send('post', '/trainings', { title: 'X', startsOn: day(5), moduleId: '11111111-1111-4111-8111-111111111111' })).status).toBe(400);
    const res = await send('post', '/trainings', { title: 'Workshop RCA', startsOn: day(5) });
    expect(res.status).toBe(201);
    training = res.body.data;
    expect(training).toMatchObject({ mode: 'offline', source: 'manual', vendorName: 'Mahaka Institute', startsOn: day(5), endsOn: day(5), sessionCount: 1, group: 'upcoming', health: 'watch', assessmentStatus: 'none' });
    expect((await get('/trainings?state=upcoming')).body.data.map((t) => t.id)).toEqual([training.id]);
    expect((await get('/trainings?state=running')).body.data).toEqual([]);
    expect((await get('/trainings?state=apa')).status).toBe(400);
    // tenant lain tidak melihat dan tidak bisa membuka
    expect((await get('/trainings', 'luar')).body.data).toEqual([]);
    expect((await get(`/trainings/${training.id}`, 'luar')).status).toBe(404);
    expect((await send('patch', `/trainings/${training.id}`, { venue: 'X' }, 'luar')).status).toBe(404);
    const dash = (await get('/dashboard')).body.data;
    expect(dash.kpis).toMatchObject({ upcoming: 1, attention: 1 });
    expect(dash.insights.map((i) => i.key)).toEqual([`assessment:${training.id}`]);
    expect(dash.actions[0]).toMatchObject({ kind: 'open_training', trainingId: training.id });
  });

  it('peserta: dari daftar dan jabatan; karyawan tenant lain dan akun nonaktif tidak ikut', async () => {
    const res = await send('put', `/trainings/${training.id}/participants`, { userIds: [u.sari, u.asing], jobRoleId: role.id });
    expect(res.status).toBe(200);
    expect(res.body.data.added).toBe(3);
    expect(res.body.data.participantList.map((p) => p.name).sort()).toEqual(['dimas', 'rina', 'sari']);
    expect((await send('put', `/trainings/${training.id}/participants`, { userIds: [u.sari] })).body.data.added).toBe(0);
    expect((await send('put', `/trainings/${training.id}/participants`, { userIds: ['bukan-uuid'] })).status).toBe(400);
    expect((await send('put', `/trainings/${training.id}/participants`, {})).status).toBe(400);
    expect((await send('delete', `/trainings/${training.id}/participants/${u.sari}`)).status).toBe(204);
    expect((await send('delete', `/trainings/${training.id}/participants/${u.sari}`)).status).toBe(404);
    const read = (await audits('ld.training')).pop();
    expect(read.action).toBe('read');
  });

  it('kelengkapan: jadwal, materi, kehadiran, asesmen manual, lalu ditutup', async () => {
    const id = training.id;
    const state = async () => Object.fromEntries((await get(`/trainings/${id}`)).body.data.readiness.map((c) => [c.key, c.state]));
    expect(await state()).toEqual({ schedule: 'missing', materials: 'missing', participants: 'complete', attendance: 'missing', assessment: 'missing', documentation: 'missing' });
    expect((await send('patch', `/trainings/${id}`, { venue: 'Ruang Rajawali', materialsReady: true, sessionCount: 2 })).status).toBe(200);
    expect((await send('patch', `/trainings/${id}`, { sessionsDone: 3 })).status).toBe(400);
    expect((await send('patch', `/trainings/${id}`, { source: 'lms' })).status).toBe(400);
    // kehadiran
    expect((await send('put', `/trainings/${id}/attendance`, { entries: [{ userId: u.dimas, present: 'ya' }] })).status).toBe(400);
    expect((await send('put', `/trainings/${id}/attendance`, { entries: [{ userId: u.dimas, present: true }, { userId: u.rina, present: false }] })).status).toBe(200);
    // asesmen: lewat EliteMentor butuh flag sinkron
    expect((await send('put', `/trainings/${id}/scores`, { entries: [{ userId: u.dimas, score: 80 }] })).body.error.code).toBe('INVALID_STATE');
    const em = await send('put', `/trainings/${id}/assessment`, { mode: 'elitementor', assessmentRef: 'ASM-1' });
    expect(em.status).toBe(403);
    expect(em.body.error.code).toBe('FEATURE_DISABLED');
    expect((await send('put', `/trainings/${id}/assessment`, { mode: 'vendor_manual' })).body.data.assessmentStatus).toBe('manual_pending');
    expect((await send('put', `/trainings/${id}/scores`, { entries: [{ userId: u.dimas, score: 101 }] })).status).toBe(400);
    const scored = await send('put', `/trainings/${id}/scores`, { entries: [{ userId: u.dimas, score: 82.5 }] });
    expect(scored.body.data.assessmentStatus).toBe('manual'); // hanya yang hadir yang diharapkan punya skor
    expect(scored.body.data.participantList.find((p) => p.userId === u.dimas)).toMatchObject({ score: 82.5, scoreSource: 'vendor_manual', attendance: true });
    expect(await state()).toEqual({ schedule: 'complete', materials: 'complete', participants: 'complete', attendance: 'complete', assessment: 'complete', documentation: 'missing' });
    expect((await audits('ld.scores')).pop().meta).toMatchObject({ trainingId: id, employeeIds: [u.dimas], source: 'vendor_manual' });
    expect((await audits('ld.attendance')).length).toBe(1);
  });

  it('dokumentasi: jenis dari isi berkas, unduh hanya HR, tenant lain 404, tanpa storage 501', async () => {
    const id = training.id;
    expect((await upload(id, Buffer.from('<html><script>alert(1)</script></html>'), 'kind=photo&filename=foto.png')).status).toBe(400);
    expect((await upload(id, PDF, 'kind=photo&filename=a.pdf')).status).toBe(400);
    expect((await upload(id, PNG, 'kind=apa')).status).toBe(400);
    expect((await upload(id, PNG, 'kind=photo', 'luar')).status).toBe(404);
    const noStore = await upload(id, PNG, 'kind=photo', 'hr', appNoStorage);
    expect(noStore.status).toBe(501);
    expect(noStore.body.error.code).toBe('STORAGE_NOT_CONFIGURED');
    const up = await upload(id, PNG, 'kind=photo&filename=..%2F..%2Fsesi%201.png');
    expect(up.status).toBe(201);
    expect(up.body.data).toMatchObject({ kind: 'photo', filename: 'sesi 1.png', mime: 'image/png', sizeBytes: PNG.length });
    expect(up.body.data.storageKey).toBeUndefined();
    expect((await upload(id, PDF, 'kind=material&filename=materi.pdf')).status).toBe(201);
    const detail = (await get(`/trainings/${id}`)).body.data;
    expect(detail.documents.map((d) => d.kind).sort()).toEqual(['material', 'photo']);
    expect(detail.readiness.find((c) => c.key === 'documentation').state).toBe('complete');
    const docId = up.body.data.id;
    const dl = await get(`/documents/${docId}/content`).buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toBe('image/png');
    expect(dl.headers['content-disposition']).toContain('attachment');
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(dl.body, PNG)).toBe(0);
    expect((await get(`/documents/${docId}/content`, 'eta')).status).toBe(403);
    expect((await get(`/documents/${docId}/content`, 'luar')).status).toBe(404);
    expect((await send('delete', `/documents/${docId}`, null, 'luar')).status).toBe(404);
    expect((await audits('ld.document')).map((a) => a.action)).toEqual(['create', 'create', 'read']);
    expect((await send('delete', `/documents/${docId}`)).status).toBe(204);
    expect(storage.files.size).toBe(1);
    expect((await get(`/documents/${docId}/content`)).status).toBe(404);
  });

  it('pengingat: ke semua peserta offline, sekali per 24 jam, tercatat di audit', async () => {
    mailer.sent.length = 0;
    const res = await send('post', `/trainings/${training.id}/reminders`);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ recipients: 2, sent: 2, failed: 0 });
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(['dimas@ld.test', 'rina@ld.test']);
    expect(mailer.sent[0].subject).toBe('Pengingat pelatihan: Workshop RCA');
    expect(mailer.sent[0].text).toContain('Ruang Rajawali');
    const again = await send('post', `/trainings/${training.id}/reminders`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('REMINDER_RECENT');
    expect(mailer.sent.length).toBe(2);
    expect((await audits('ld.reminder')).pop().meta).toMatchObject({ trainingId: training.id, sent: 2, failed: 0 });
    expect((await send('post', `/trainings/${training.id}/reminders`, null, 'luar')).status).toBe(404);
    // ditutup: tidak ada pengingat lagi, tidak bisa dibuka setelah batal
    expect((await send('patch', `/trainings/${training.id}`, { status: 'done', sessionsDone: 2 })).body.data).toMatchObject({ group: 'done', progressPct: 100 });
    expect((await send('post', `/trainings/${training.id}/reminders`)).body.error.code).toBe('INVALID_STATE');
  });

  it('LMS: course dengan status peserta menjadi pelatihan online yang hanya-baca', async () => {
    const [[item]] = await db.query(`INSERT INTO lna_catalog_items (tenant_id, source, external_ref, title, program_tier) VALUES (:t, 'moodle', 'C-ITIL', 'ITIL Foundation', 'basic') RETURNING id`, { replacements: { t: tenant.id } });
    await db.query(`INSERT INTO lna_catalog_items (tenant_id, source, external_ref, title) VALUES (:t, 'moodle', 'C-KOSONG', 'Belum ada peserta')`, { replacements: { t: tenant.id } });
    await db.query(`INSERT INTO lna_catalog_completions (tenant_id, user_id, catalog_item_id, status, score, completed_at) VALUES
      (:t, :dimas, :item, 'passed', 88, now()), (:t, :rina, :item, 'in_progress', NULL, NULL)`, { replacements: { t: tenant.id, item: item.id, dimas: u.dimas, rina: u.rina } });
    const list = (await get('/trainings?mode=online')).body.data;
    expect(list.length).toBe(1);
    const lms = list[0];
    expect(lms).toMatchObject({ title: 'ITIL Foundation', source: 'lms', mode: 'online', group: 'running', participants: 2, completed: 1, progressPct: 50, programTier: 'basic' });
    // membaca ulang tidak menggandakan; perubahan status di LMS terbawa
    await db.query(`UPDATE lna_catalog_completions SET status = 'failed' WHERE tenant_id = :t AND user_id = :rina`, { replacements: { t: tenant.id, rina: u.rina } });
    const detail = (await get(`/trainings/${lms.id}`)).body.data;
    expect((await get('/trainings?mode=online')).body.data.length).toBe(1);
    expect((await get(`/trainings/${lms.id}`)).body.data.participantList.find((p) => p.userId === u.rina).status).toBe('failed');
    expect(detail.participantList.find((p) => p.userId === u.dimas)).toMatchObject({ status: 'completed', score: 88, scoreSource: 'lms' });
    for (const res of [
      await send('put', `/trainings/${lms.id}/participants`, { userIds: [u.sari] }),
      await send('put', `/trainings/${lms.id}/attendance`, { allPresent: true }),
      await send('put', `/trainings/${lms.id}/assessment`, { mode: 'vendor_manual' }),
      await send('patch', `/trainings/${lms.id}`, { title: 'Ganti' }),
      await upload(lms.id, PNG),
    ]) { expect(res.status).toBe(409); expect(res.body.error.code).toBe('READ_ONLY_SOURCE'); }
    expect((await send('patch', `/trainings/${lms.id}`, { startsOn: day(-20), endsOn: day(-1) })).body.data.health).toBe('late');
    expect((await get('/trainings', 'luar')).body.data).toEqual([]);
  });

  it('webhook: tanda tangan, JSON rusak, flag mati, lalu progres masuk idempoten dan tidak mundur', async () => {
    const progress = (extra = {}) => ({ type: 'learning.progress', course: { ref: 'EM-RCA', title: 'RCA Online', dueAt: `${day(10)}T00:00:00Z`, programTier: 'advanced' }, user: { email: 'Dimas@LD.test' }, progressPct: 40, status: 'in_progress', ...extra });
    expect((await hook(progress(), { secret: 'salah' })).status).toBe(401);
    expect((await hook(null, { raw: '{rusak' })).status).toBe(400);
    // flag em.webhook_sync mati: diterima (202) tapi tidak diproses dan tidak dicatat
    expect((await hook(progress())).status).toBe(202);
    expect(await events()).toEqual([]);
    await flag('em.webhook_sync', true);
    const t0 = Date.now();
    expect((await hook(progress({ id: 'ev-a', occurredAt: new Date(t0 - 60000).toISOString() }))).status).toBe(202);
    expect((await hook(progress({ id: 'ev-a', occurredAt: new Date(t0 - 60000).toISOString(), progressPct: 99 }))).status).toBe(202); // ganda
    expect((await hook(progress({ id: 'ev-b', occurredAt: new Date(t0 - 120000).toISOString(), progressPct: 10 }))).status).toBe(202); // lebih lama
    expect((await hook(progress({ id: 'ev-c', user: { email: 'tidakada@ld.test' } }))).status).toBe(202);
    expect((await hook(progress({ id: 'ev-d', user: { email: 'asing@ld.test' } }))).status).toBe(202); // karyawan tenant lain
    expect((await hook(progress({ id: 'ev-e', progressPct: 140 }))).status).toBe(202); // di luar rentang: diabaikan
    const em = (await get('/trainings?mode=online')).body.data.find((t) => t.source === 'elitementor');
    expect(em).toMatchObject({ title: 'RCA Online', externalRef: 'EM-RCA', endsOn: day(10), participants: 1, progressPct: 40, programTier: 'advanced', group: 'running' });
    const log = Object.fromEntries((await events()).map((e) => [e.event_id, e.result]));
    expect(Object.keys(log).sort()).toEqual(['ev-a', 'ev-b', 'ev-c', 'ev-d']);
    expect(log['ev-a']).toMatchObject({ applied: true });
    expect(log['ev-b']).toMatchObject({ applied: false, reason: 'stale' });
    expect(log['ev-c']).toMatchObject({ applied: false, reason: 'user_not_found' });
    expect(log['ev-d']).toMatchObject({ applied: false, reason: 'user_not_found' });
    // batas yang diisi HR tidak ditimpa event berikutnya; selesai menutup pelatihan
    expect((await send('patch', `/trainings/${em.id}`, { endsOn: day(30) })).status).toBe(200);
    expect((await hook(progress({ id: 'ev-f', status: 'completed', progressPct: null, score: 91 }))).status).toBe(202);
    const done = (await get(`/trainings/${em.id}`)).body.data;
    expect(done).toMatchObject({ endsOn: day(30), group: 'done', completed: 1 });
    expect(done.participantList[0]).toMatchObject({ userId: u.dimas, status: 'completed', progressPct: 100, score: 91, scoreSource: 'elitementor' });
    expect((await get('/trainings', 'luar')).body.data).toEqual([]);
  });

  it('webhook: skor asesmen pelatihan offline dicocokkan lewat kode asesmen', async () => {
    const t = (await send('post', '/trainings', { title: 'Kelas Komunikasi', startsOn: day(-1), venue: 'Aula' })).body.data;
    await send('put', `/trainings/${t.id}/participants`, { userIds: [u.dimas, u.rina] });
    const set = await send('put', `/trainings/${t.id}/assessment`, { mode: 'elitementor', assessmentRef: 'ASM-KOM' });
    expect(set.status).toBe(200);
    expect(set.body.data.assessmentStatus).toBe('awaiting');
    expect((await send('put', `/trainings/${t.id}/assessment`, { mode: 'elitementor' })).status).toBe(400);
    const result = (email, score, id) => hook({ id, type: 'assessment.result', course: { ref: 'ASM-KOM' }, user: { email }, score });
    await result('dimas@ld.test', 77, 'as-1');
    await result('sari@ld.test', 60, 'as-2'); // bukan peserta
    let d = (await get(`/trainings/${t.id}`)).body.data;
    expect(d.assessmentStatus).toBe('awaiting');
    expect(d.readiness.find((c) => c.key === 'assessment').state).toBe('waiting');
    expect(d.participantList.find((p) => p.userId === u.dimas)).toMatchObject({ score: 77, scoreSource: 'elitementor' });
    expect(d.participantList.length).toBe(2);
    await result('rina@ld.test', 65, 'as-3');
    d = (await get(`/trainings/${t.id}`)).body.data;
    expect(d.assessmentStatus).toBe('synced');
    const log = Object.fromEntries((await events()).map((e) => [e.event_id, e.result]));
    expect(log['as-2']).toMatchObject({ applied: false, reason: 'not_participant_or_stale' });
    // pengingat online hanya ke yang belum selesai
    const lms = (await get('/trainings?mode=online')).body.data.find((x) => x.source === 'lms');
    mailer.sent.length = 0;
    await db.query(`UPDATE lna_catalog_completions SET status = 'in_progress' WHERE tenant_id = :t AND user_id = :rina`, { replacements: { t: tenant.id, rina: u.rina } });
    await get('/trainings');
    expect((await send('post', `/trainings/${lms.id}/reminders`)).body.data).toEqual({ recipients: 1, sent: 1, failed: 0 });
    expect(mailer.sent[0].to).toBe('rina@ld.test');
    expect(mailer.sent[0].text).toContain('https://elgos.test');
  });
});
