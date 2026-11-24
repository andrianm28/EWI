'use strict';
// B19 bagian 4.3: adapter Gemini Live di Vertex AI. Bentuk pesan mengikuti docs/research/gemini-live-vertex.md.
const { EventEmitter } = require('events');
const { createGeminiVertexProvider, liveUrl } = require('../../src/voice/gemini-vertex-provider');

class FakeWs extends EventEmitter {
  constructor(url, opts) { super(); this.url = url; this.opts = opts; this.sent = []; FakeWs.last = this; this.readyState = 0; }
  send(data) { this.sent.push(JSON.parse(data)); }
  close(code) { this.readyState = 3; this.emit('close', code || 1000, Buffer.from('')); }
  open() { this.readyState = 1; this.emit('open'); }
  server(msg, binary = true) { this.emit('message', binary ? Buffer.from(JSON.stringify(msg)) : JSON.stringify(msg), binary); }
}
const config = { model: 'gemini-3.8-live', location: 'asia-southeast1', project: 'elgos-dev', silenceMs: 1200, voiceName: '' };
const tokenSource = { getToken: async () => 'ya29.T' };
const provider = () => createGeminiVertexProvider({ config, tokenSource, WebSocket: FakeWs });

async function open(opts = {}) {
  const s = await provider().openSession({ systemInstruction: 'Instruksi', tools: [{ name: 'akhiri_wawancara', description: 'x', parameters: { type: 'object', properties: {} } }], ...opts });
  return { s, ws: FakeWs.last };
}

test('URL WebSocket per lokasi, termasuk global', () => {
  expect(liveUrl('asia-southeast1')).toBe('wss://asia-southeast1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent');
  expect(liveUrl('global')).toBe('wss://aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent');
});

test('membuka sambungan dengan Bearer token lalu mengirim setup lengkap', async () => {
  const { ws } = await open();
  expect(ws.opts.headers.Authorization).toBe('Bearer ya29.T');
  ws.open();
  expect(ws.sent[0]).toEqual({
    setup: {
      model: 'projects/elgos-dev/locations/asia-southeast1/publishers/google/models/gemini-3.8-live',
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'id-ID' } },
      systemInstruction: { parts: [{ text: 'Instruksi' }] },
      tools: [{ functionDeclarations: [{ name: 'akhiri_wawancara', description: 'x', parameters: { type: 'object', properties: {} } }] }],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 1200 } },
      sessionResumption: {},
      contextWindowCompression: { slidingWindow: {} },
    },
  });
});

test('sambung ulang membawa handle session resumption', async () => {
  const { ws } = await open({ resumptionHandle: 'H1' });
  ws.open();
  expect(ws.sent[0].setup.sessionResumption).toEqual({ handle: 'H1' });
});

test('pesan klien: audio 16 kHz, akhir audio, teks pemicu, jawaban alat', async () => {
  const { s, ws } = await open();
  ws.open();
  s.sendAudio('AAAA');
  s.endAudio();
  s.sendText('Mulai wawancara.');
  s.sendToolResponse([{ id: 'c1', name: 'akhiri_wawancara', response: { ok: true } }]);
  expect(ws.sent.slice(1)).toEqual([
    { realtimeInput: { audio: { data: 'AAAA', mimeType: 'audio/pcm;rate=16000' } } },
    { realtimeInput: { audioStreamEnd: true } },
    { clientContent: { turns: [{ role: 'user', parts: [{ text: 'Mulai wawancara.' }] }], turnComplete: true } },
    { toolResponse: { functionResponses: [{ id: 'c1', name: 'akhiri_wawancara', response: { ok: true } }] } },
  ]);
});

test('pesan server diterjemahkan menjadi event', async () => {
  const { s, ws } = await open();
  const got = [];
  for (const ev of ['ready', 'audio', 'inputText', 'outputText', 'interrupted', 'turnComplete', 'toolCall', 'resumption', 'goAway', 'usage', 'close']) {
    s.on(ev, (p) => got.push([ev, p]));
  }
  ws.open();
  ws.server({ setupComplete: {} });
  ws.server({ serverContent: { inputTranscription: { text: 'Target saya' } } }, false);
  ws.server({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'QUJD' } }] }, outputTranscription: { text: 'Baik,' } } });
  ws.server({ serverContent: { interrupted: true } });
  ws.server({ serverContent: { turnComplete: true } });
  ws.server({ toolCall: { functionCalls: [{ id: 'c1', name: 'akhiri_wawancara', args: {} }] } });
  ws.server({ sessionResumptionUpdate: { newHandle: 'H2', resumable: true } });
  ws.server({ sessionResumptionUpdate: { resumable: false } });
  ws.server({ goAway: { timeLeft: '10s' } });
  ws.server({ usageMetadata: { promptTokenCount: 120, responseTokenCount: 80, totalTokenCount: 200 } });
  ws.close(1000);
  expect(got).toEqual([
    ['ready', undefined],
    ['inputText', { text: 'Target saya' }],
    ['audio', { data: 'QUJD' }],
    ['outputText', { text: 'Baik,' }],
    ['interrupted', undefined],
    ['turnComplete', undefined],
    ['toolCall', { calls: [{ id: 'c1', name: 'akhiri_wawancara', args: {} }] }],
    ['resumption', { handle: 'H2' }],
    ['goAway', { timeLeft: '10s' }],
    ['usage', { inputTokens: 120, outputTokens: 80, totalTokens: 200 }],
    ['close', { code: 1000, reason: '' }],
  ]);
});

test('audio dikirim sebelum setup selesai diantrekan, tidak hilang', async () => {
  const { s, ws } = await open();
  s.sendAudio('B1');
  ws.open();
  expect(ws.sent.map((m) => Object.keys(m)[0])).toEqual(['setup', 'realtimeInput']);
});

test('pesan rusak dari server menjadi event error, bukan crash', async () => {
  const { s, ws } = await open();
  const errs = [];
  s.on('error', (e) => errs.push(e.code));
  ws.open();
  ws.emit('message', Buffer.from('{bukan json'), true);
  expect(errs).toEqual(['VOICE_PROTOCOL']);
});
