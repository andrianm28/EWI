// B19 wawancara suara: HTTP + WebSocket lewat server sungguhan pada port acak, penyedia `fake`, Postgres.
// Spek: docs/designs/b19-wawancara-suara.md bagian 4, 6, 7, 11. Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan.
const http = require('http');
const request = require('supertest');
const WebSocket = require('ws');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createAiProvider } = require('../../src/ai');
const { currentConsentVersion, currentVoiceConsentVersion } = require('../../src/core/consent');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const PCM = Buffer.alloc(3200).toString('base64');

/** Klien WS kecil: kumpulkan pesan, tunggu pesan dengan syarat tertentu, dan kode tutup. */
function connect(port, sid, { origin = `http://127.0.0.1:${port}` } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/voice/sessions/${sid}/stream`, { headers: origin ? { Origin: origin } : {} });
  const msgs = [];
  const waiters = [];
  let closed = null;
  const check = () => {
    for (const w of [...waiters]) {
      const hit = w.pred === 'close' ? closed : msgs.find(w.pred);
      if (hit) { waiters.splice(waiters.indexOf(w), 1); w.resolve(hit); }
    }
  };
  ws.on('message', (d) => { msgs.push(JSON.parse(d.toString())); check(); });
  ws.on('close', (code) => { closed = { code }; check(); });
  ws.on('error', () => {});
  const opened = new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('unexpected-response', (_req, res) => reject(Object.assign(new Error('upgrade ditolak'), { status: res.statusCode }))); });
  const wait = (pred, ms = 3000) => new Promise((resolve, reject) => {
    waiters.push({ pred, resolve });
    check();
    setTimeout(() => reject(new Error(`timeout menunggu; pesan: ${JSON.stringify(msgs.map((m) => m.type + (m.reason ? `:${m.reason}` : '') + (m.code ? `:${m.code}` : '')))}`)), ms).unref();
  });
  return { ws, msgs, opened, wait, send: (m) => ws.send(JSON.stringify(m)), closedP: () => wait('close') };
}

run('B19 wawancara suara HTTP + WS (Postgres, penyedia fake)', () => {
  let db; let stores; let tokens; let config; let tenant; let other; let projectId; let app; let server; let port;
  let duringAnalyze = null; // kait test: dijalankan selama AI menyusun ringkasan (Bedrock butuh beberapa detik, stub instan)
  const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const q = (sql, replacements = {}) => db.query(sql, { replacements, type: 'SELECT' });
  const flag = (tenantId, key, enabled) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled)
     ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t: tenantId, key, enabled } },
  );
  const base = (sid) => `/api/tna/sessions/${sid}`;
  const consentVoice = (who, sid, extra = {}) => request(app).post(`${base(sid)}/consent`).set(as(who))
    .send({ consentVersion: currentConsentVersion('tna'), mode: 'voice', voiceConsentVersion: currentVoiceConsentVersion('tna'), ...extra });
  const ticket = (who, sid) => request(app).post(`${base(sid)}/voice/ticket`).set(as(who));

  async function addUser(t, key, role) {
    const [[row]] = await db.query(
      `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, :email, :name, :emp, :role, 'active') RETURNING id`,
      { replacements: { t, email: `${key}@b19.test`, name: key, emp: `B19-${key}`, role } },
    );
    u[key] = row.id;
    tok[key] = await tokens.sign({ id: row.id, tenantId: t, role, email: `${key}@b19.test` });
  }
  async function newSession(who) {
    const s = await stores.interviews.create(tenant.id, { projectId, submodule: 'tna', intervieweeId: u[who], triggerRecordIds: [] });
    return s.id;
  }
  async function voiceReady(who) {
    const sid = await newSession(who);
    const res = await consentVoice(who, sid);
    expect(res.status).toBe(200);
    return sid;
  }
  async function openStream(who, sid) {
    const t = await ticket(who, sid);
    expect(t.status).toBe(200);
    const c = connect(port, sid);
    await c.opened;
    c.send({ type: 'auth', ticket: t.body.data.ticket });
    return { c, ticket: t.body.data.ticket };
  }
  const answer = (c) => { c.send({ type: 'audio', data: PCM }); c.send({ type: 'end_turn' }); };

  beforeAll(async () => {
    config = makeConfig({ VOICE_PROVIDER: 'fake' });
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    tokens = sessionSigner(config, stores.authSessions);
    const mk = async (key) => {
      const [[t]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'B19 uji') RETURNING id`, { replacements: { slug: `b19-${key}-${Date.now()}` } });
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t: t.id } });
      await flag(t.id, 'module.tna', true);
      await flag(t.id, 'tna.interview_summary', true);
      return t;
    };
    tenant = await mk('a'); other = await mk('b');
    await flag(tenant.id, 'voice.realtime', true);
    for (const k of ['ani', 'beni', 'cici', 'dedi', 'eka', 'fani', 'gita', 'hadi']) await addUser(tenant.id, k, 'learner');
    await addUser(tenant.id, 'eta', 'eta_admin');
    await addUser(other.id, 'luar', 'learner');
    const [[p]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'B19') RETURNING id`, { replacements: { t: tenant.id } });
    projectId = p.id;
    const base0 = createAiProvider(config.ai || config.aiProvider);
    const ai = Object.assign(Object.create(base0), {
      async analyzeTna(input) { if (duringAnalyze) await duringAnalyze(); return base0.analyzeTna(input); },
    });
    app = createApp({ config, stores, ai });
    server = http.createServer(app);
    app.locals.voice.attach(server);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });

  afterAll(async () => {
    await app.locals.voice.shutdown();
    await new Promise((r) => server.close(r));
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.close();
  });

  it('alur utuh: persetujuan suara, tiket, WS, giliran mode suara, ai_done, ringkasan, kirim ke HR', async () => {
    const sid = await newSession('ani');
    const view0 = (await request(app).get(base(sid)).set(as('ani'))).body.data;
    expect(view0).toMatchObject({ voiceAvailable: true, hasVoiceConsent: false, aiDone: false, voiceConsentVersionRequired: 'tna-voice-consent-id-v0.2' });
    const c0 = await consentVoice('ani', sid);
    expect(c0.body.data).toEqual({ status: 'in_progress', consentVersion: currentConsentVersion('tna'), mode: 'voice', question: null });
    const { c } = await openStream('ani', sid);
    await c.wait((m) => m.type === 'ready');
    await c.wait((m) => m.type === 'turn' && m.turn.speaker === 'ai');
    answer(c);
    await c.wait((m) => m.type === 'turn' && m.turn.text === 'Jawaban suara 1');
    await c.wait((m) => m.type === 'turn' && m.turn.text.startsWith('Pertanyaan 2'));
    answer(c);
    expect(await c.wait((m) => m.type === 'ended')).toEqual({ type: 'ended', reason: 'done' });
    expect((await c.closedP()).code).toBe(1000);
    const turns = (await request(app).get(`${base(sid)}/transcript`).set(as('ani'))).body.data;
    expect(turns.map((t) => [t.speaker, t.mode])).toEqual([['ai', 'voice'], ['human', 'voice'], ['ai', 'voice'], ['human', 'voice'], ['ai', 'voice']]);
    const view = (await request(app).get(base(sid)).set(as('ani'))).body.data;
    expect(view).toMatchObject({ aiDone: true, mode: 'voice', hasVoiceConsent: true });
    const usage = await q("SELECT operation, provider, audio_seconds_in::float AS i FROM ai_usage_logs WHERE session_id = :sid AND operation = 'voice_live'", { sid });
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ provider: 'fake', i: 0.2 });
    expect((await request(app).post(`${base(sid)}/summary`).set(as('ani'))).status).toBe(201);
    expect((await request(app).post(`${base(sid)}/summary/confirm`).set(as('ani')).send({})).status).toBe(202);
    await app.locals.analysis.drain();
    const audits = await q("SELECT action FROM audit_logs WHERE tenant_id = :t AND resource = 'tna.voice_session' AND meta->'objectIds' ? :sid ORDER BY id", { t: tenant.id, sid });
    expect(audits.map((a) => a.action)).toEqual(['create', 'update']);
  });

  it('persetujuan suara: flag mati 403, tanpa versi suara 400, versi salah 409', async () => {
    const sid = await newSession('beni');
    expect((await consentVoice('beni', sid, { voiceConsentVersion: undefined })).status).toBe(400);
    const wrong = await consentVoice('beni', sid, { voiceConsentVersion: 'tna-voice-consent-id-v0.0' });
    expect([wrong.status, wrong.body.error.code]).toEqual([409, 'CONSENT_VERSION_OUTDATED']);
    await flag(tenant.id, 'voice.realtime', false);
    const off = await consentVoice('beni', sid);
    await flag(tenant.id, 'voice.realtime', true);
    expect([off.status, off.body.error.code]).toEqual([403, 'FEATURE_DISABLED']);
    expect((await q('SELECT status FROM lna_interview_sessions WHERE id = :sid', { sid }))[0].status).toBe('scheduled');
  });

  it('tiket: karyawan lain, Super Admin, tenant lain ditolak; tiket sekali pakai; tab kedua (epoch lama) ditolak', async () => {
    const sid = await voiceReady('cici');
    expect((await ticket('dedi', sid)).status).toBe(404); // sesi orang lain tidak terlihat
    expect((await ticket('eta', sid)).status).toBe(403);
    expect((await ticket('luar', sid)).status).toBe(403); // tenant lain: flag suara mati di tenant itu
    const first = await openStream('cici', sid);
    await first.c.wait((m) => m.type === 'ready');
    // tiket yang sama dipakai ulang
    const replay = connect(port, sid);
    await replay.opened;
    replay.send({ type: 'auth', ticket: first.ticket });
    expect(await replay.wait((m) => m.type === 'error')).toMatchObject({ code: 'VOICE_TICKET' });
    expect((await replay.closedP()).code).toBe(4401);
    // tab kedua: tiket baru menaikkan epoch, sesi pertama dihentikan (superseded) dan tidak bisa menulis
    const second = await openStream('cici', sid);
    expect(await first.c.wait((m) => m.type === 'ended')).toEqual({ type: 'ended', reason: 'superseded' });
    await second.c.wait((m) => m.type === 'ready');
    second.c.send({ type: 'stop' });
    expect(await second.c.wait((m) => m.type === 'ended')).toEqual({ type: 'ended', reason: 'stopped' });
  });

  it('Origin asing dan path tak dikenal ditolak sebelum upgrade; tiket tidak datang -> 4401', async () => {
    const sid = await voiceReady('dedi');
    await expect(connect(port, sid, { origin: 'https://jahat.example' }).opened).rejects.toMatchObject({ status: 403 });
    const bad = new WebSocket(`ws://127.0.0.1:${port}/api/voice/lain`, { headers: { Origin: `http://127.0.0.1:${port}` } });
    const status = await new Promise((r) => { bad.on('unexpected-response', (_q, res) => r(res.statusCode)); bad.on('error', () => {}); });
    expect(status).toBe(404);
    const c = connect(port, sid);
    await c.opened;
    c.send({ type: 'audio', data: PCM });
    expect(await c.wait((m) => m.type === 'error')).toMatchObject({ code: 'VOICE_TICKET' });
  });

  it('pindah ke teks menutup WS aktif dan membuat pertanyaan teks pada transkrip kosong; /turns 409 di mode suara', async () => {
    const sid = await voiceReady('eka');
    const txt = await request(app).post(`${base(sid)}/turns`).set(as('eka')).send({ text: 'halo' });
    expect([txt.status, txt.body.error.code]).toEqual([409, 'VOICE_ACTIVE']);
    const { c } = await openStream('eka', sid);
    await c.wait((m) => m.type === 'ready');
    await c.wait((m) => m.type === 'turn');
    // giliran AI utuh sudah ada, jadi tidak ada pertanyaan teks baru
    const sw = await request(app).post(`${base(sid)}/voice/switch`).set(as('eka')).send({ to: 'text' });
    expect(sw.status).toBe(200);
    expect(sw.body.data).toEqual({ mode: 'text', question: null });
    expect(await c.wait((m) => m.type === 'ended')).toEqual({ type: 'ended', reason: 'switched' });
    expect((await request(app).post(`${base(sid)}/turns`).set(as('eka')).send({ text: 'jawab teks' })).status).toBe(200);
    // sudah di mode teks: 200 tanpa perubahan, tidak ada pertanyaan baru (7.1)
    const before = (await request(app).get(`${base(sid)}/transcript`).set(as('eka'))).body.data.length;
    const again = await request(app).post(`${base(sid)}/voice/switch`).set(as('eka')).send({ to: 'text' });
    expect(again.body.data).toEqual({ mode: 'text', question: null });
    expect((await request(app).get(`${base(sid)}/transcript`).set(as('eka'))).body.data.length).toBe(before);
    // sesi kosong: pindah ke teks membuat pertanyaan pertama
    const sid2 = await voiceReady('fani');
    const sw2 = await request(app).post(`${base(sid2)}/voice/switch`).set(as('fani')).send({ to: 'text' });
    expect(sw2.body.data.mode).toBe('text');
    expect(sw2.body.data.question).toMatchObject({ speaker: 'ai', mode: 'text' });
    // kembali ke suara
    const back = await request(app).post(`${base(sid2)}/voice/switch`).set(as('fani')).send({ to: 'voice' });
    expect(back.body.data).toEqual({ mode: 'voice' });
  });

  it('koreksi jawaban terbaru: bukan terbaru 409, Super Admin 403, teks asli tetap ada', async () => {
    const sid = await newSession('gita');
    await request(app).post(`${base(sid)}/consent`).set(as('gita')).send({ consentVersion: currentConsentVersion('tna') });
    await request(app).post(`${base(sid)}/turns`).set(as('gita')).send({ text: 'jawab satu' });
    await request(app).post(`${base(sid)}/turns`).set(as('gita')).send({ text: 'jawab dua slah' });
    const turns = (await request(app).get(`${base(sid)}/transcript`).set(as('gita'))).body.data;
    const humans = turns.filter((t) => t.speaker === 'human');
    const patch = (who, id, text) => request(app).patch(`${base(sid)}/turns/${id}`).set(as(who)).send({ text });
    expect((await patch('gita', humans[0].id, 'x')).body.error.code).toBe('NOT_LATEST_ANSWER');
    expect((await patch('eta', humans[1].id, 'x')).status).toBe(403);
    expect((await patch('gita', humans[1].id, '')).status).toBe(400);
    const ok = await patch('gita', humans[1].id, 'jawab dua salah');
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ text: 'jawab dua salah', corrected: true, originalText: 'jawab dua slah' });
    // Ubah bagian B19: flag voice.realtime mati -> 403 FEATURE_DISABLED (7.1)
    await flag(tenant.id, 'voice.realtime', false);
    const off = await patch('gita', humans[1].id, 'lagi');
    await flag(tenant.id, 'voice.realtime', true);
    expect([off.status, off.body.error.code]).toEqual([403, 'FEATURE_DISABLED']);
    // ringkasan sesudah Ubah tetap bisa dibuat (penjaga transcript_edited_at, presisi milidetik)
    const sum = await request(app).post(`${base(sid)}/summary`).set(as('gita')).send({});
    expect(sum.status).toBe(201);
  });

  it('ringkasan saat suara masih berjalan: sesi suara dihentikan dulu, giliran yang datang selama AI meringkas tidak membatalkan ringkasan', async () => {
    const sid = await voiceReady('fani');
    const { c } = await openStream('fani', sid);
    await c.wait((m) => m.type === 'ready');
    await c.wait((m) => m.type === 'turn' && m.turn.speaker === 'ai');
    answer(c);
    await c.wait((m) => m.type === 'turn' && m.turn.text.startsWith('Pertanyaan 2'));
    // UAT 25 Nov (Claude asli): karyawan menekan "Lihat ringkasan temuan" saat suara masih berjalan. Selama AI meringkas,
    // jawaban berikutnya dan penutup AI masih tersimpan, penjaga turnCount gagal, dan layar menampilkan 409.
    duringAnalyze = async () => {
      if (c.ws.readyState === WebSocket.OPEN) answer(c);
      await c.wait((m) => m.type === 'turn' && m.turn.text === 'Terima kasih, wawancara selesai.', 1000).catch(() => {});
    };
    try {
      const sum = await request(app).post(`${base(sid)}/summary`).set(as('fani')).send({});
      expect(sum.status).toBe(201);
    } finally { duringAnalyze = null; }
    expect(await c.wait((m) => m.type === 'ended')).toEqual({ type: 'ended', reason: 'summary' });
    expect((await c.closedP()).code).toBe(1000);
  });

  it('penarikan persetujuan menutup WS; restart mengosongkan kolom suara', async () => {
    const sid = await voiceReady('hadi');
    const { c } = await openStream('hadi', sid);
    await c.wait((m) => m.type === 'ready');
    const r = await request(app).post('/api/employees/me/data-requests').set(as('hadi')).send({ type: 'withdraw_consent' });
    expect([201, 200]).toContain(r.status);
    expect(await c.wait((m) => m.type === 'ended')).toEqual({ type: 'ended', reason: 'withdrawn' });
  });
});
