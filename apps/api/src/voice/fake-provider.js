'use strict';
// B19 bagian 4.4: penyedia suara fake untuk dev tanpa kunci dan test integrasi. Naskah tetap, tanpa jaringan.
const { EventEmitter } = require('events');

const GREETING = 'Halo, terima kasih sudah bersedia. Pertanyaan 1: apa kendala terbesar Anda bulan ini?';
const NEXT = ['Pertanyaan 2: apa yang sudah Anda coba?', 'Pertanyaan 3: dukungan apa yang Anda butuhkan?', 'Pertanyaan 4: ada hal lain yang perlu kami ketahui?'];
const CLOSING = 'Terima kasih, wawancara selesai.';
const ANSWERS_BEFORE_END = 3; // gateway menolak akhiri_wawancara sebelum 3 jawaban (UAT 25 Nov)
const SILENCE = Buffer.alloc(4800).toString('base64'); // 0,1 detik PCM16 24 kHz

function createFakeVoiceProvider({ config = {} } = {}) {
  return {
    name: 'fake',
    model: config.model || 'fake-live',
    location: config.location || 'lokal',
    async openSession() {
      const s = new EventEmitter();
      let closed = false;
      let started = false;
      let gotAudio = false;
      let answers = 0;
      let calls = 0;
      let tokens = 0;
      const later = (fn) => setImmediate(() => { if (!closed) fn(); });
      const speak = (text) => {
        s.emit('outputText', { text });
        s.emit('audio', { data: SILENCE });
        s.emit('turnComplete');
        tokens += 10;
        s.emit('usage', { inputTokens: tokens, outputTokens: tokens, totalTokens: tokens * 2 });
      };
      Object.assign(s, {
        sendAudio() { gotAudio = true; },
        endAudio() {
          if (!gotAudio) return;
          gotAudio = false;
          answers += 1;
          const n = answers;
          later(() => {
            s.emit('inputText', { text: `Jawaban suara ${n}` });
            if (n >= ANSWERS_BEFORE_END) {
              calls += 1;
              s.emit('toolCall', { calls: [{ id: `fake-${calls}`, name: 'akhiri_wawancara', args: {} }] });
            } else speak(NEXT[n - 1]);
          });
        },
        sendText() {
          if (started) return;
          started = true;
          later(() => speak(GREETING));
        },
        sendToolResponse(responses) {
          const r = (responses || [])[0];
          if (!r || r.name !== 'akhiri_wawancara') return;
          later(() => speak(r.response && r.response.ok ? CLOSING : NEXT[NEXT.length - 1]));
        },
        close() {
          if (closed) return;
          closed = true;
          setImmediate(() => s.emit('close', { code: 1000, reason: '' }));
        },
      });
      s.on('error', () => {});
      later(() => s.emit('ready'));
      return s;
    },
  };
}

module.exports = { createFakeVoiceProvider, GREETING, CLOSING };
