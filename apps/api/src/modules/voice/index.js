'use strict';
// B19: gateway suara. Browser -> WS /api/voice/sessions/:id/stream -> VoiceSession -> penyedia suara (Gemini Live).
// Kunci Google tidak pernah keluar dari proses API. Spek: docs/designs/b19-wawancara-suara.md bagian 4 dan 7.
const { WebSocketServer } = require('ws');
const { createVoiceProvider } = require('../../voice');
const { voiceSystemPrompt } = require('../../ai/prompts');
const { buildContext, aiContext } = require('../interviews/ai-calls');
const { questionLimit } = require('../interviews/summary');
const { FLAGS } = require('../../core/flags');
const { createTicketService } = require('./ticket');
const { createVoiceRegistry } = require('./registry');
const { createVoiceEligibility, VoiceError } = require('./eligibility');
const { createVoiceSession, voiceTimeLimitMs } = require('./session');

const STREAM_PATH = /^\/api\/voice\/sessions\/([0-9a-fA-F-]{36})\/stream$/;
const AUTH_TIMEOUT_MS = 5000;
const MAX_PAYLOAD = 256 * 1024;

function rejectUpgrade(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/** Origin harus sama dengan host permintaan atau ada di CORS_ORIGIN (4.1). Tanpa Origin (klien non-browser) ditolak. */
function originAllowed(req, corsOrigin = []) {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (corsOrigin.includes(origin)) return true;
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return new URL(origin).host === String(host).split(',')[0].trim();
  } catch { return false; }
}

/**
 * deps: config, stores, flags, entitlements, sessions, policy, audit, aiConfig, provider? (test), limits? (test).
 */
function createVoiceModule(deps) {
  const { config, stores, flags, audit } = deps;
  const provider = deps.provider || createVoiceProvider(config.voice || { provider: 'none' });
  const tickets = createTicketService({ secret: config.jwt.secret, issuer: config.jwt.issuer });
  const registry = createVoiceRegistry();
  const eligibility = createVoiceEligibility({ ...deps, provider, timeLimitMs: voiceTimeLimitMs });
  let accepting = true;

  /** Flag + penyedia: dipakai tampilan sesi (voiceAvailable). */
  const available = async (tenantId) => provider.name !== 'none' && flags.isEnabled(tenantId, FLAGS.VOICE_REALTIME);

  const auditReq = (claims) => ({ tenantId: claims.tenantId, user: { id: claims.id, role: claims.role } });

  async function onAuthenticated(ws, { claims, sessionId, epoch }) {
    const session = await eligibility.assertVoiceEligible({ claims, sessionId, epoch });
    const send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
    const vs = createVoiceSession({
      provider, stores, tenantId: claims.tenantId, session, epoch, aiConfig: deps.aiConfig || {}, voiceConfig: config.voice || {},
      limits: deps.limits,
      instructions: async (transcript) => {
        const ctx = aiContext(await buildContext(stores, claims.tenantId, session), session);
        const askedCount = transcript.filter((t) => t.speaker === 'ai' && !t.interrupted).length;
        return voiceSystemPrompt({ context: ctx, maxQuestions: questionLimit(session, deps.aiConfig || {}), askedCount, transcript });
      },
      recheck: async () => {
        try { await eligibility.assertVoiceEligible({ claims, sessionId, epoch }); return null; } catch (e) {
          if (e instanceof VoiceError) return { code: e.code, message: e.message, closeCode: e.closeCode };
          throw e;
        }
      },
      send,
      close: (code) => { try { ws.close(code); } catch { /* sudah tertutup */ } },
      onEnd: (summary) => {
        registry.remove(sessionId, vs);
        audit.record(auditReq(claims), 'update', 'tna.voice_session', { employeeIds: [claims.id], objectType: 'interview_session', objectIds: [sessionId], ...summary })
          .catch((e) => console.error(`Audit sesi suara gagal: ${e.message}`));
      },
    });
    registry.add(sessionId, vs);
    await audit.record(auditReq(claims), 'create', 'tna.voice_session', {
      employeeIds: [claims.id], objectType: 'interview_session', objectIds: [sessionId], provider: provider.name, model: provider.model, location: provider.location,
    });
    ws.on('message', (data, isBinary) => {
      let msg = null;
      if (!isBinary) { try { msg = JSON.parse(data.toString('utf8')); } catch { msg = null; } }
      vs.onClientMessage(msg);
    });
    ws.on('close', () => { if (!vs.ended) vs.stop('stopped'); });
    await vs.start();
  }

  function onConnection(ws, sessionId) {
    ws.on('error', () => {});
    const fail = (code, message, closeCode) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', code, message }));
      try { ws.close(closeCode); } catch { /* */ }
    };
    const timer = setTimeout(() => fail('VOICE_TICKET', 'Tiket suara tidak dikirim', 4401), AUTH_TIMEOUT_MS);
    ws.once('message', (data) => {
      clearTimeout(timer);
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { msg = null; }
      if (!msg || msg.type !== 'auth') return fail('VOICE_TICKET', 'Pesan pertama harus auth', 4401);
      let auth;
      try { auth = tickets.consume(msg.ticket, sessionId); } catch (e) { return fail('VOICE_TICKET', e.message, 4401); }
      return onAuthenticated(ws, auth).catch((e) => {
        if (e instanceof VoiceError) return fail(e.code, e.message, e.closeCode);
        console.error(`Gateway suara: ${e.message}`);
        return fail('VOICE_UNAVAILABLE', 'Wawancara suara sedang tidak tersedia', 1011);
      });
    });
  }

  return {
    provider,
    tickets,
    registry,
    eligibility,
    available,
    STREAM_PATH,
    /** Pasang penangan upgrade WS ke server HTTP (server.js dan test integrasi). */
    attach(server) {
      const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
      server.on('upgrade', (req, socket, head) => {
        const path = String(req.url || '').split('?')[0];
        if (!path.startsWith('/api/voice/')) return rejectUpgrade(socket, 404, 'Not Found');
        const m = STREAM_PATH.exec(path);
        if (!m) return rejectUpgrade(socket, 404, 'Not Found');
        if (!accepting) return rejectUpgrade(socket, 503, 'Service Unavailable');
        if (!originAllowed(req, config.corsOrigin)) return rejectUpgrade(socket, 403, 'Forbidden');
        return wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, m[1]));
      });
      return wss;
    },
    /** SIGTERM (4.3): berhenti menerima upgrade, simpan giliran terbuka, catat biaya, kirim ended provider. */
    async shutdown() {
      accepting = false;
      await registry.stopAll('provider');
    },
  };
}

module.exports = { createVoiceModule, originAllowed };
