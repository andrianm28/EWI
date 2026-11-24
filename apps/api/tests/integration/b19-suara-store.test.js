// B19 wawancara suara: aturan simpan di store wawancara (docs/designs/b19-wawancara-suara.md bagian 4.1, 6, 7.1, 8).
// Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan.
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('B19 store wawancara suara (Postgres)', () => {
  let db; let stores; let tenant; let userId; let projectId;
  const q = (sql, replacements = {}) => db.query(sql, { replacements, type: 'SELECT' });
  const iv = () => stores.interviews;

  async function newSession() {
    const s = await iv().create(tenant.id, { projectId, submodule: 'tna', intervieweeId: userId, triggerRecordIds: [] });
    return s.id;
  }
  async function voiceSession() {
    const id = await newSession();
    await iv().start(tenant.id, id, { consentAt: new Date(), consentVersion: 'tna-consent-id-v1.0', mode: 'voice', voiceConsentVersion: 'tna-voice-consent-id-v0.1' });
    return id;
  }

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    const [[t]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'B19 uji') RETURNING id`, { replacements: { slug: `b19s-${Date.now()}` } });
    tenant = t;
    const [[u]] = await db.query(`INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, 'k@b19.test', 'K', 'B19-K', 'learner', 'active') RETURNING id`, { replacements: { t: t.id } });
    userId = u.id;
    const [[p]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'B19') RETURNING id`, { replacements: { t: t.id } });
    projectId = p.id;
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id = :id', { replacements: { id: tenant.id }, transaction });
    });
    await db.close();
  });

  it('start dengan mode suara menyimpan persetujuan utama dan suara sekaligus', async () => {
    const id = await voiceSession();
    const s = await iv().get(tenant.id, id);
    expect(s).toMatchObject({ status: 'in_progress', mode: 'voice', voiceConsentVersion: 'tna-voice-consent-id-v0.1', voiceEpoch: 0, aiDoneAt: null, voiceStartedAt: null });
    expect(s.voiceConsentAt).toBeTruthy();
  });

  it('epoch: giliran suara hanya tersimpan dengan epoch berlaku dan mode suara; jalur teks ditolak di mode suara', async () => {
    const id = await voiceSession();
    const ep = await iv().bumpVoiceEpoch(tenant.id, id);
    expect(ep).toBe(1);
    const guard = { restartCount: 0, voiceEpoch: ep };
    const ok = await iv().addTurn(tenant.id, id, 'ai', 'Pertanyaan suara', { mode: 'voice', guard });
    expect(ok).toMatchObject({ speaker: 'ai', text: 'Pertanyaan suara', mode: 'voice', interrupted: false });
    expect(ok.id).toBeTruthy();
    expect(await iv().addTurn(tenant.id, id, 'human', 'tab lama', { mode: 'voice', guard: { restartCount: 0, voiceEpoch: 0 } })).toBeNull();
    expect(await iv().addTurn(tenant.id, id, 'human', 'teks', { guard: { restartCount: 0, mode: 'text' } })).toBeNull();
    const disela = await iv().addTurn(tenant.id, id, 'ai', 'Pertanyaan (disela)', { mode: 'voice', interrupted: true, guard });
    expect(disela.interrupted).toBe(true);
    // pindah ke teks menaikkan epoch: penulis suara lama tertolak
    const sw = await iv().setMode(tenant.id, id, 'text');
    expect(sw).toMatchObject({ mode: 'text', voiceEpoch: 2 });
    expect(await iv().addTurn(tenant.id, id, 'ai', 'telat', { mode: 'voice', guard })).toBeNull();
    expect(await iv().addTurn(tenant.id, id, 'human', 'jawab teks', { guard: { restartCount: 0, mode: 'text' } })).toBeTruthy();
    const turns = await iv().turns(tenant.id, id);
    expect(turns.map((t) => [t.speaker, t.mode, t.interrupted])).toEqual([['ai', 'voice', false], ['ai', 'voice', true], ['human', 'text', false]]);
  });

  it('koreksi hanya untuk jawaban karyawan terbaru; teks koreksi dipakai, asli tetap ada, transcript_edited_at naik', async () => {
    const id = await voiceSession();
    const ep = await iv().bumpVoiceEpoch(tenant.id, id);
    const g = { restartCount: 0, voiceEpoch: ep };
    await iv().addTurn(tenant.id, id, 'ai', 'P1', { mode: 'voice', guard: g });
    const h1 = await iv().addTurn(tenant.id, id, 'human', 'jawab satu', { mode: 'voice', guard: g });
    await iv().addTurn(tenant.id, id, 'ai', 'P2', { mode: 'voice', guard: g });
    const h2 = await iv().addTurn(tenant.id, id, 'human', 'jawab dua salah dengar', { mode: 'voice', guard: g });
    expect(await iv().correctTurn(tenant.id, id, h1.id, 'x', { restartCount: 0 })).toEqual({ error: 'NOT_LATEST_ANSWER' });
    const fixed = await iv().correctTurn(tenant.id, id, h2.id, 'jawab dua yang benar', { restartCount: 0 });
    expect(fixed).toMatchObject({ id: h2.id, text: 'jawab dua yang benar', corrected: true, originalText: 'jawab dua salah dengar' });
    const turns = await iv().turns(tenant.id, id);
    expect(turns[3]).toMatchObject({ text: 'jawab dua yang benar', corrected: true, originalText: 'jawab dua salah dengar' });
    expect(turns[1].originalText).toBeUndefined();
    const raw = (await q('SELECT corrected_text AS c FROM lna_interview_turns WHERE id = :id', { id: h2.id }))[0];
    expect(raw.c.startsWith('enc:') || raw.c === 'jawab dua yang benar').toBe(true);
    expect((await iv().get(tenant.id, id)).transcriptEditedAt).toBeTruthy();
    // ringkasan yang mulai sebelum koreksi tidak tersimpan
    expect(await iv().saveSummary(tenant.id, id, [], { restartCount: 0, turnCount: 4, editedAt: null })).toBeNull();
  });

  it('waktu mulai suara diisi sekali; ai_done hanya dengan epoch berlaku; restart mengosongkan kolom suara', async () => {
    const id = await voiceSession();
    const ep = await iv().bumpVoiceEpoch(tenant.id, id);
    const first = await iv().markVoiceStarted(tenant.id, id);
    const again = await iv().markVoiceStarted(tenant.id, id);
    expect(new Date(again).getTime()).toBe(new Date(first).getTime());
    expect(await iv().markAiDone(tenant.id, id, { voiceEpoch: ep + 5 })).toBeNull();
    expect(await iv().markAiDone(tenant.id, id, { voiceEpoch: ep })).toBeTruthy();
    const r = await iv().restart(tenant.id, id);
    expect(r).toBeTruthy();
    const s = await iv().get(tenant.id, id);
    expect(s).toMatchObject({ mode: 'text', voiceConsentVersion: null, voiceConsentAt: null, voiceStartedAt: null, aiDoneAt: null, transcriptEditedAt: null, voiceEpoch: ep + 1 });
  });

  it('catatan biaya suara menyimpan detik audio', async () => {
    const id = await voiceSession();
    await stores.aiUsage.record(tenant.id, {
      projectId, sessionId: id, userId, submodule: 'tna', operation: 'voice_live', provider: 'gemini-vertex', model: 'm',
      inputTokens: 10, outputTokens: 20, latencyMs: 900, costUsd: null, audioSecondsIn: 12.5, audioSecondsOut: 30,
    });
    const [row] = await q('SELECT operation, audio_seconds_in::float AS i, audio_seconds_out::float AS o FROM ai_usage_logs WHERE session_id = :id', { id });
    expect(row).toEqual({ operation: 'voice_live', i: 12.5, o: 30 });
  });
});
