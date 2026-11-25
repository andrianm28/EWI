'use strict';
// B19 bagian 8: biaya sambungan suara per modalitas (teks vs audio), harga per 1 juta token.
const { estimateVoiceCost } = require('../../src/voice/pricing');

const PRICES = { priceInputPerMTok: 0.75, priceOutputPerMTok: 4.5, priceAudioInputPerMTok: 3, priceAudioOutputPerMTok: 12 };

test('token audio dan teks diberi harga masing-masing', () => {
  // masuk: 1.000.000 token = 800.000 audio + 200.000 teks; keluar: 100.000 = 90.000 audio + 10.000 teks
  const usage = { inputTokens: 1e6, outputTokens: 1e5, inputAudioTokens: 8e5, outputAudioTokens: 9e4 };
  // 0.8*3 + 0.2*0.75 + 0.09*12 + 0.01*4.5 = 2.4 + 0.15 + 1.08 + 0.045
  expect(estimateVoiceCost(usage, PRICES)).toBe(3.675);
});

test('rincian modalitas tidak ada: semua token dihitung dengan harga audio (batas atas)', () => {
  const usage = { inputTokens: 4584, outputTokens: 1334, inputAudioTokens: null, outputAudioTokens: null };
  // baris smoke etavm2 25 Nov: 4584*3 + 1334*12 = 29760 per 1e6
  expect(estimateVoiceCost(usage, PRICES)).toBe(0.02976);
});

test('tanpa harga (model tak dikenal, env kosong): null; harga audio kosong memakai harga teks', () => {
  expect(estimateVoiceCost({ inputTokens: 10, outputTokens: 10 }, {})).toBeNull();
  expect(estimateVoiceCost({ inputTokens: 1e6, outputTokens: 0, inputAudioTokens: 1e6 }, { priceInputPerMTok: 1, priceOutputPerMTok: 2 })).toBe(1);
});
