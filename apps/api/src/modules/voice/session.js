'use strict';
// B19 bagian 6: satu sesi suara di gateway (VoiceSession). Hidup selama satu sambungan browser, bisa memakai beberapa
// sambungan Gemini berturut-turut (goAway, sambung ulang). Semua event diproses berurutan lewat satu rantai janji supaya
// urutan simpan giliran sama dengan urutan bicara. Spek: docs/designs/b19-wawancara-suara.md.
const { questionLimit } = require('../interviews/summary');
const { estimateCost } = require('../../ai');

const MAX_TEXT = 8000;
const PCM_IN_BPS = 32000; // 16 kHz x 16 bit
const PCM_OUT_BPS = 48000; // 24 kHz x 16 bit
const RATE_WINDOW_MS = 10000;
const RATE_FACTOR = 1.5;
const PRE_READY_MAX_BYTES = PCM_IN_BPS * 5;
const FAILURE_WINDOW_MS = 60000;
const MAX_FAILURES = 3;

const START_TEXT = 'Mulai wawancara.';
const RESUME_TEXT = 'Lanjutkan wawancara dari pertanyaan berikutnya, tanpa menyapa ulang.';
const QUOTA_TEXT = 'Kuota pertanyaan habis. Ucapkan penutup singkat lalu panggil akhiri_wawancara.';
const correctionText = (text) => `Koreksi dari karyawan untuk jawaban terakhirnya: "${text}". Lanjutkan dengan memperhitungkan koreksi ini.`;

const VOICE_TOOLS = Object.freeze([
  {
    name: 'catat_topik_selesai',
    description: 'Catat bahwa penyebab satu target (T1, T2, ...) atau kompetensi (K1, K2, ...) sudah jelas.',
    parameters: { type: 'object', properties: { kode: { type: 'string', description: 'Kode target atau kompetensi, mis. T1' } }, required: ['kode'] },
  },
  {
    name: 'akhiri_wawancara',
    description: 'Akhiri wawancara setelah Anda mengucapkan penutup singkat.',
    parameters: { type: 'object', properties: {} },
  },
]);

/** Batas waktu suara per sesi wawancara (6.3): 18 menit untuk sesi 15 menit, selain itu 36 menit. */
const voiceTimeLimitMs = (session) => (session.durationMinutes === 15 ? 18 : 36) * 60 * 1000;
const b64Bytes = (data) => (typeof data === 'string' ? Buffer.byteLength(data, 'base64') : 0);
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * deps: provider, stores, aiConfig, voiceConfig, tenantId, session (dari stores.interviews.get), epoch,
 * instructions(transcript) -> string, recheck() -> null | { code, message, closeCode }, send(obj), close(code),
 * onEnd?(summary), limits? { readyTimeoutMs, recheckMs, backoffMs }.
 */
function createVoiceSession(deps) {
  const { provider, stores, tenantId, session, epoch, send, close } = deps;
  const limits = { readyTimeoutMs: 10000, recheckMs: 30000, backoffMs: [500, 1000, 2000], ...(deps.limits || {}) };
  const maxQuestions = questionLimit(session, deps.aiConfig || {});
  const guard = { restartCount: session.restartCount || 0, voiceEpoch: epoch };

  let chain = Promise.resolve();
  const enqueue = (fn) => { chain = chain.then(fn).catch((e) => { console.error(`Sesi suara: ${e.message}`); }); return chain; };

  let ended = false;
  let endReason = null;
  let up = null; // sambungan Gemini aktif
  let conn = null; // statistik sambungan aktif untuk baris biaya
  let everReady = false;
  let handle = null;
  let failures = [];
  let resumedWithoutHandle = false;
  let openHuman = '';
  let openAi = '';
  let savedHuman = 0;
  let asked = 0;
  let quotaNotified = false;
  let endAfterTurn = false;
  let muted = false;
  let preReadyBytes = 0;
  let rate = { start: Date.now(), bytes: 0 };
  const topics = new Set();
  const totals = { audioIn: 0, audioOut: 0, turns: 0 };
  const timers = [];

  const later = (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); timers.push(t); return t; };

  async function save(speaker, text, { interrupted = false } = {}) {
    const turn = await stores.interviews.addTurn(tenantId, session.id, speaker, String(text).trim().slice(0, MAX_TEXT), { mode: 'voice', interrupted, guard });
    if (!turn) { await finish('session_changed'); return null; }
    totals.turns += 1;
    send({ type: 'turn', turn });
    return turn;
  }
  async function flushHuman() {
    if (!openHuman.trim()) { openHuman = ''; return; }
    const text = openHuman; openHuman = '';
    if (await save('human', text)) savedHuman += 1;
  }
  async function flushAi({ interrupted = false } = {}) {
    if (!openAi.trim()) { openAi = ''; return null; }
    const text = interrupted ? `${openAi.trim()} (disela)` : openAi;
    openAi = '';
    const turn = await save('ai', text, { interrupted });
    if (turn && !interrupted) asked += 1;
    return turn;
  }

  /** Tutup sambungan Gemini aktif dan tulis satu baris biaya untuknya. */
  async function retireUpstream() {
    const u = up; const c = conn;
    up = null; conn = null;
    if (!u) return;
    u.removeAllListeners();
    u.on('error', () => {});
    try { u.close(); } catch { /* sudah tertutup */ }
    if (!c || !stores.aiUsage) return;
    const usage = {
      operation: 'voice_live', provider: provider.name, model: provider.model,
      inputTokens: c.tokens.input, outputTokens: c.tokens.output,
    };
    try {
      await stores.aiUsage.record(tenantId, {
        projectId: session.projectId, sessionId: session.id, userId: session.intervieweeId, submodule: session.submodule || 'tna',
        ...usage, latencyMs: c.firstAudioAt ? c.firstAudioAt - c.openedAt : null,
        costUsd: estimateCost(usage, deps.voiceConfig || {}),
        audioSecondsIn: round2(c.bytesIn / PCM_IN_BPS), audioSecondsOut: round2(c.bytesOut / PCM_OUT_BPS),
      });
    } catch (e) { console.error(`Gagal mencatat biaya suara: ${e.message}`); }
  }

  function trackUsage(c, u) {
    const input = u.inputTokens || 0; const output = u.outputTokens || 0;
    // Spek 8: nilai yang naik terus dianggap kumulatif (pakai terakhir); bila turun dianggap per giliran (dijumlah).
    if (c.tokens.mode === 'sum' || (c.tokens.last && (input < c.tokens.last.input || output < c.tokens.last.output))) {
      if (c.tokens.mode !== 'sum') { c.tokens.mode = 'sum'; c.tokens.sumBase = { ...c.tokens.last }; c.tokens.input = c.tokens.sumBase.input; c.tokens.output = c.tokens.sumBase.output; }
      c.tokens.input += input; c.tokens.output += output;
    } else { c.tokens.input = input; c.tokens.output = output; }
    c.tokens.last = { input, output };
  }

  async function openUpstream({ resume }) {
    const transcript = await stores.interviews.turns(tenantId, session.id);
    const resumeHandle = resume === 'handle' ? handle : null;
    const systemInstruction = await deps.instructions(resumeHandle ? [] : transcript);
    let u;
    try {
      u = await provider.openSession({ systemInstruction, tools: VOICE_TOOLS, resumptionHandle: resumeHandle });
    } catch (e) {
      return onUpstreamFailure({ code: e.code || 'VOICE_UPSTREAM' });
    }
    if (ended) { try { u.close(); } catch { /* */ } return undefined; }
    up = u;
    const c = { openedAt: Date.now(), firstAudioAt: null, bytesIn: 0, bytesOut: 0, tokens: { input: 0, output: 0, last: null, mode: 'last' }, ready: false };
    conn = c;
    const mine = (fn) => (p) => enqueue(() => (up === u && !ended ? fn(p) : undefined));
    const readyTimer = later(() => enqueue(() => (up === u && !c.ready ? onUpstreamFailure({ code: 'VOICE_UNAVAILABLE', setup: true }) : undefined)), limits.readyTimeoutMs);
    u.on('ready', mine(() => {
      clearTimeout(readyTimer);
      c.ready = true;
      if (!everReady) { everReady = true; send({ type: 'ready' }); }
      if (!resumeHandle) u.sendText(transcript.length ? RESUME_TEXT : START_TEXT);
    }));
    u.on('inputText', mine(({ text }) => { openHuman += text; send({ type: 'caption', speaker: 'human', text: openHuman }); }));
    u.on('outputText', mine(({ text }) => { openAi += text; send({ type: 'caption', speaker: 'ai', text: openAi }); }));
    u.on('audio', mine(({ data }) => {
      c.bytesOut += b64Bytes(data); totals.audioOut += b64Bytes(data);
      if (!c.firstAudioAt) c.firstAudioAt = Date.now();
      send({ type: 'audio', data });
    }));
    u.on('interrupted', mine(async () => {
      // Caption masukan yang terbuka adalah ucapan yang menyela, jadi milik giliran karyawan sesudah AI ini
      await flushAi({ interrupted: true });
      if (!ended) send({ type: 'interrupted' });
    }));
    u.on('turnComplete', mine(onTurnComplete));
    u.on('toolCall', mine(onToolCall));
    u.on('resumption', mine(({ handle: h }) => { handle = h; }));
    u.on('goAway', mine(async () => { await retireUpstream(); await openUpstream({ resume: handle ? 'handle' : 'transcript' }); }));
    u.on('usage', mine((x) => trackUsage(c, x)));
    u.on('error', mine((e) => onUpstreamFailure({ code: (e && e.code) || 'VOICE_UPSTREAM' })));
    u.on('close', mine(() => onUpstreamFailure({ code: 'VOICE_UPSTREAM' })));
    return undefined;
  }

  async function onUpstreamFailure({ code }) {
    if (ended) return;
    const wasReady = Boolean(conn && conn.ready);
    await retireUpstream();
    if (!everReady || (!wasReady && code === 'VOICE_UNAVAILABLE')) {
      send({ type: 'error', code: 'VOICE_UNAVAILABLE', message: 'Wawancara suara sedang tidak tersedia. Lanjutkan dengan mengetik.' });
      await finish('provider');
      return;
    }
    const now = Date.now();
    failures = failures.filter((t) => now - t < FAILURE_WINDOW_MS);
    failures.push(now);
    if (failures.length > MAX_FAILURES) { await finish('provider'); return; }
    if (handle) {
      await new Promise((r) => later(r, limits.backoffMs[Math.min(failures.length - 1, limits.backoffMs.length - 1)]));
      if (!ended) await openUpstream({ resume: 'handle' });
      return;
    }
    if (resumedWithoutHandle) { await finish('provider'); return; }
    resumedWithoutHandle = true;
    // Sambungan baru tanpa handle membaca transkrip dari DB, jadi giliran terbuka disimpan dulu
    await flushHuman();
    if (!ended) await flushAi();
    if (!ended) await openUpstream({ resume: 'transcript' });
  }

  async function onTurnComplete() {
    await flushHuman();
    if (ended) return;
    const turn = await flushAi();
    if (ended) return;
    if (endAfterTurn || (quotaNotified && turn)) { await finish('done'); return; }
    if (asked >= maxQuestions && !quotaNotified) {
      quotaNotified = true;
      if (up) up.sendText(QUOTA_TEXT);
    }
  }

  async function onToolCall({ calls }) {
    for (const call of calls || []) {
      let response;
      if (call.name === 'catat_topik_selesai') {
        if (call.args && call.args.kode) topics.add(String(call.args.kode).slice(0, 16));
        response = { ok: true };
      } else if (call.name === 'akhiri_wawancara') {
        if (savedHuman === 0 && !openHuman.trim()) response = { ok: false, alasan: 'Belum ada jawaban karyawan.' };
        else { response = { ok: true }; endAfterTurn = true; }
      } else response = { ok: false, alasan: 'Alat tidak dikenal.' };
      if (up) up.sendToolResponse([{ id: call.id, name: call.name, response }]);
    }
  }

  /** Semua jalur penutupan: simpan giliran terbuka, catat biaya, kirim ended, tutup sambungan browser. */
  async function finish(reason, { error, closeCode = 1000 } = {}) {
    if (ended) return;
    ended = true;
    endReason = reason;
    for (const t of timers) clearTimeout(t);
    if (reason !== 'session_changed') {
      // ended = true sudah dipasang; simpan langsung tanpa memicu finish ulang
      const flushOpen = async (speaker, text) => {
        if (!text.trim()) return;
        const turn = await stores.interviews.addTurn(tenantId, session.id, speaker, text.trim().slice(0, MAX_TEXT), { mode: 'voice', guard });
        if (turn) { totals.turns += 1; send({ type: 'turn', turn }); }
      };
      await flushOpen('human', openHuman);
      await flushOpen('ai', openAi);
    }
    openHuman = ''; openAi = '';
    if (reason === 'done') await stores.interviews.markAiDone(tenantId, session.id, { voiceEpoch: epoch });
    await retireUpstream();
    if (error) send({ type: 'error', ...error });
    else send({ type: 'ended', reason });
    close(error ? closeCode : 1000);
    if (deps.onEnd) deps.onEnd(summary());
  }

  function summary() {
    return {
      reason: endReason, topics: topics.size, turns: totals.turns,
      audioSecondsIn: round2(totals.audioIn / PCM_IN_BPS), audioSecondsOut: round2(totals.audioOut / PCM_OUT_BPS),
    };
  }

  function protocolError(code, message) {
    enqueue(() => finish('stopped', { error: { code, message }, closeCode: 1008 }));
  }

  function onAudio(data) {
    const bytes = b64Bytes(data);
    if (!bytes || bytes > 256 * 1024) return protocolError('VOICE_PROTOCOL', 'Potongan audio tidak sah');
    const now = Date.now();
    if (now - rate.start > RATE_WINDOW_MS) rate = { start: now, bytes: 0 };
    rate.bytes += bytes;
    if (rate.bytes > PCM_IN_BPS * RATE_FACTOR * (RATE_WINDOW_MS / 1000)) return protocolError('VOICE_RATE', 'Audio dikirim terlalu cepat');
    if (muted || ended) return undefined;
    if (!up || !conn || !conn.ready) {
      // Sebelum ready pertama: antre paling banyak 5 detik (provider mengantrekan sampai sambungan terbuka).
      // Saat menyambung ulang: dibuang supaya model tidak menerima potongan basi.
      if (everReady || !up || preReadyBytes + bytes > PRE_READY_MAX_BYTES) return undefined;
      preReadyBytes += bytes;
    }
    conn.bytesIn += bytes; totals.audioIn += bytes;
    up.sendAudio(data);
    return undefined;
  }

  return {
    async start() {
      const startedAt = await stores.interviews.markVoiceStarted(tenantId, session.id);
      const deadline = new Date(startedAt).getTime() + voiceTimeLimitMs(session);
      const left = deadline - Date.now();
      if (left <= 0) { await enqueue(() => finish('time')); return; }
      later(() => enqueue(() => finish('time')), left);
      const tick = () => later(() => enqueue(async () => {
        if (ended) return;
        const problem = await deps.recheck();
        if (problem) await finish('stopped', { error: { code: problem.code, message: problem.message }, closeCode: problem.closeCode || 4409 });
        else tick();
      }), limits.recheckMs);
      tick();
      const turns = await stores.interviews.turns(tenantId, session.id);
      asked = turns.filter((t) => t.speaker === 'ai' && !t.interrupted).length;
      savedHuman = turns.filter((t) => t.speaker === 'human').length;
      await enqueue(() => openUpstream({ resume: 'transcript' }));
    },
    onClientMessage(msg) {
      if (!msg || typeof msg !== 'object') return protocolError('VOICE_PROTOCOL', 'Pesan tidak dikenal');
      switch (msg.type) {
        case 'audio': return onAudio(msg.data);
        case 'end_turn': if (up && !ended) up.endAudio(); return undefined;
        case 'mute':
          if (msg.on && !muted && up && !ended) up.endAudio();
          muted = Boolean(msg.on);
          return undefined;
        case 'stop': enqueue(() => finish('stopped')); return undefined;
        default: return protocolError('VOICE_PROTOCOL', 'Pesan tidak dikenal');
      }
    },
    /** Koreksi jawaban terakhir (PATCH /turns/:id) diteruskan ke model (V5). */
    correction(text) { if (up && !ended) up.sendText(correctionText(text)); },
    /** Penghentian dari luar (registry): penarikan persetujuan, restart, switch, superseded, SIGTERM. */
    stop(reason) { return enqueue(() => finish(reason)); },
    get ended() { return ended; },
    summary,
  };
}

module.exports = { createVoiceSession, VOICE_TOOLS, voiceTimeLimitMs, START_TEXT, RESUME_TEXT, QUOTA_TEXT };
