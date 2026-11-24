'use strict';
// B19: adapter Gemini Live (Vertex AI, WebSocket BidiGenerateContent). Fakta protokol: docs/research/gemini-live-vertex.md.
// Satu openSession = satu sambungan ke Google. Gateway (modules/voice) yang memegang aturan bisnis.
const { EventEmitter } = require('events');

const PATH = '/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent';
const liveUrl = (location) => (location === 'global'
  ? `wss://aiplatform.googleapis.com${PATH}`
  : `wss://${location}-aiplatform.googleapis.com${PATH}`);

function setupMessage(config, { systemInstruction, tools = [], resumptionHandle, languageCode = 'id-ID' }) {
  const speechConfig = { languageCode };
  if (config.voiceName) speechConfig.voiceConfig = { prebuiltVoiceConfig: { voiceName: config.voiceName } };
  const setup = {
    model: `projects/${config.project}/locations/${config.location}/publishers/google/models/${config.model}`,
    generationConfig: { responseModalities: ['AUDIO'], speechConfig },
    systemInstruction: { parts: [{ text: systemInstruction }] },
  };
  if (tools.length) setup.tools = [{ functionDeclarations: tools }];
  Object.assign(setup, {
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: config.silenceMs } },
    sessionResumption: resumptionHandle ? { handle: resumptionHandle } : {},
  });
  return { setup };
}

/** Pesan server Gemini -> event adapter (lihat kontrak di src/voice/index.js). */
function dispatch(emitter, msg) {
  if (msg.setupComplete) emitter.emit('ready');
  const sc = msg.serverContent;
  if (sc) {
    if (sc.inputTranscription && sc.inputTranscription.text) emitter.emit('inputText', { text: sc.inputTranscription.text });
    for (const part of (sc.modelTurn && sc.modelTurn.parts) || []) {
      if (part.inlineData && part.inlineData.data) emitter.emit('audio', { data: part.inlineData.data });
    }
    if (sc.outputTranscription && sc.outputTranscription.text) emitter.emit('outputText', { text: sc.outputTranscription.text });
    if (sc.interrupted) emitter.emit('interrupted');
    if (sc.turnComplete) emitter.emit('turnComplete');
  }
  if (msg.toolCall) emitter.emit('toolCall', { calls: msg.toolCall.functionCalls || [] });
  if (msg.sessionResumptionUpdate && msg.sessionResumptionUpdate.resumable && msg.sessionResumptionUpdate.newHandle) {
    emitter.emit('resumption', { handle: msg.sessionResumptionUpdate.newHandle });
  }
  if (msg.goAway) emitter.emit('goAway', { timeLeft: msg.goAway.timeLeft });
  if (msg.usageMetadata) {
    const u = msg.usageMetadata;
    emitter.emit('usage', {
      inputTokens: u.promptTokenCount || 0,
      outputTokens: u.responseTokenCount ?? u.candidatesTokenCount ?? 0,
      totalTokens: u.totalTokenCount || 0,
    });
  }
}

function createGeminiVertexProvider({ config, tokenSource, WebSocket = require('ws') }) {
  return {
    name: 'gemini-vertex',
    model: config.model,
    location: config.location,
    async openSession(opts) {
      const token = await tokenSource.getToken();
      const ws = new WebSocket(liveUrl(config.location), { headers: { Authorization: `Bearer ${token}` } });
      const s = new EventEmitter();
      const queue = [];
      let open = false;
      const send = (obj) => {
        if (!open) return queue.push(obj);
        if (ws.readyState === 1) ws.send(JSON.stringify(obj));
        return undefined;
      };
      ws.on('open', () => {
        open = true;
        ws.send(JSON.stringify(setupMessage(config, opts)));
        while (queue.length) send(queue.shift());
      });
      ws.on('message', (data) => {
        let msg;
        try { msg = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data)); } catch {
          s.emit('error', { code: 'VOICE_PROTOCOL', message: 'Pesan Gemini tidak bisa dibaca' });
          return;
        }
        dispatch(s, msg);
      });
      ws.on('error', (e) => s.emit('error', { code: 'VOICE_UPSTREAM', message: e.message }));
      ws.on('close', (code, reason) => s.emit('close', { code, reason: reason ? reason.toString() : '' }));
      Object.assign(s, {
        sendAudio: (data) => send({ realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } } }),
        endAudio: () => send({ realtimeInput: { audioStreamEnd: true } }),
        sendText: (text) => send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }),
        sendToolResponse: (functionResponses) => send({ toolResponse: { functionResponses } }),
        close: () => { try { ws.close(1000); } catch { /* sudah tertutup */ } },
      });
      // Peringatan EventEmitter: 'error' tanpa pendengar melempar. Gateway selalu memasang pendengar; ini jaring pengaman.
      s.on('error', () => {});
      return s;
    },
  };
}

module.exports = { createGeminiVertexProvider, liveUrl, setupMessage };
