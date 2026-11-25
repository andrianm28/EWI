'use strict';
// B19 bagian 8: biaya satu sambungan suara. Live API menagih token audio jauh lebih mahal dari token teks, jadi harga
// dihitung per modalitas dari rincian usageMetadata. Spek: docs/designs/b19-wawancara-suara.md bagian 8.

/** Harga bawaan per 1 juta token (USD) per model; env VOICE_PRICE_* menimpa. Sumber: halaman harga Vertex AI, 25 Nov 2026. */
const DEFAULT_PRICES = Object.freeze({
  'gemini-3.8-live': Object.freeze({ priceInputPerMTok: 0.75, priceOutputPerMTok: 4.5, priceAudioInputPerMTok: 3, priceAudioOutputPerMTok: 12 }),
});

const known = (n) => n !== null && n !== undefined;

/**
 * usage: { inputTokens, outputTokens, inputAudioTokens?, outputAudioTokens? } (null = rincian modalitas tidak ada).
 * cfg: priceInputPerMTok/priceOutputPerMTok (teks), priceAudioInputPerMTok/priceAudioOutputPerMTok (audio).
 * Tanpa rincian modalitas semua token dihitung dengan harga audio (batas atas). Tanpa harga sama sekali: null.
 */
function estimateVoiceCost(usage, cfg = {}) {
  const textIn = cfg.priceInputPerMTok; const textOut = cfg.priceOutputPerMTok;
  if (!known(textIn) || !known(textOut)) return null;
  const audioIn = known(cfg.priceAudioInputPerMTok) ? cfg.priceAudioInputPerMTok : textIn;
  const audioOut = known(cfg.priceAudioOutputPerMTok) ? cfg.priceAudioOutputPerMTok : textOut;
  const side = (total, audio, pText, pAudio) => {
    const t = total || 0;
    const a = known(audio) ? Math.min(audio, t) : t;
    return a * pAudio + (t - a) * pText;
  };
  const micro = side(usage.inputTokens, usage.inputAudioTokens, textIn, audioIn) + side(usage.outputTokens, usage.outputAudioTokens, textOut, audioOut);
  return Number((micro / 1e6).toFixed(6));
}

module.exports = { estimateVoiceCost, DEFAULT_PRICES };
