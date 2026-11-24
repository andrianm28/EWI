'use strict';
// B19 bagian 4.4: pabrik penyedia suara. Kontrak openSession({ systemInstruction, tools, resumptionHandle }) -> EventEmitter
// dengan sendAudio(base64), endAudio(), sendText(text), sendToolResponse([{ id, name, response }]), close(), dan event
// ready, audio {data}, inputText {text}, outputText {text}, interrupted, turnComplete, toolCall {calls}, resumption {handle},
// goAway {timeLeft}, usage {inputTokens, outputTokens, totalTokens}, error {code, message}, close {code, reason}.
const fs = require('fs');
const { createFakeVoiceProvider } = require('./fake-provider');
const { createGeminiVertexProvider } = require('./gemini-vertex-provider');
const { createTokenSource } = require('./google-token');

const unavailable = () => Object.assign(new Error('Wawancara suara belum tersedia di server ini'), { code: 'VOICE_UNAVAILABLE' });

function createVoiceProvider(config = {}, deps = {}) {
  if (config.provider === 'fake') return createFakeVoiceProvider({ config });
  if (config.provider === 'gemini-vertex') {
    // Kunci dibaca sekali saat boot (sudah divalidasi loadVoiceConfig) dan hanya disimpan di memori token source.
    const key = deps.key || JSON.parse(fs.readFileSync(config.credentialsFile, 'utf8'));
    const tokenSource = deps.tokenSource || createTokenSource({ key, fetch: deps.fetch });
    return createGeminiVertexProvider({ config, tokenSource, WebSocket: deps.WebSocket });
  }
  return { name: 'none', model: null, location: null, async openSession() { throw unavailable(); } };
}

module.exports = { createVoiceProvider };
