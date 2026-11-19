'use strict';
// B18 QA malam: pembungkus penyedia AI (spek 5.3). Meneruskan setiap panggilan ke penyedia asli sambil merekam
// argumen (yang menjadi isi prompt), keluaran, token, dan latensi, supaya pemeriksa bisa mencari kenari di payload.
// Batas token dicek sebelum tiap panggilan: pengaman biaya utama, karena estimasi USD null bila harga tidak diisi.
const { galatQa } = require('./galat');

// Semua metode penyedia kecuali verify adalah operasi model. Operasi baru (mis. assistantReply B17) otomatis
// direkam dan ikut batas token tanpa mengubah berkas ini.
const BUKAN_OPERASI = new Set(['verify']);
const operasiAi = (ai) => Object.keys(ai).filter((k) => typeof ai[k] === 'function' && !BUKAN_OPERASI.has(k));

function jumlahToken(usage = []) {
  return usage.reduce((a, u) => ({ inputTokens: a.inputTokens + (u.inputTokens || 0), outputTokens: a.outputTokens + (u.outputTokens || 0) }),
    { inputTokens: 0, outputTokens: 0 });
}

/**
 * Batas token dilempar di dalam rute API atau job analisis, yang mengubahnya menjadi HTTP 500 atau lastError.
 * Karena itu galatnya juga disimpan di rekaman.galatBatas, dan pelaksana memeriksanya setelah tiap langkah.
 */
function buatPerekam(ai, { maksToken = Infinity } = {}) {
  const rekaman = { panggilan: [], totalToken: 0, galatBatas: null };
  const dibungkus = Object.create(ai);
  dibungkus.rekaman = rekaman;
  const catat = (metode, args, mulai, usage, lain) => {
    const token = jumlahToken(usage);
    rekaman.totalToken += token.inputTokens + token.outputTokens;
    rekaman.panggilan.push({ operasi: metode, args, ...lain, ...token, latencyMs: Date.now() - mulai });
  };
  for (const metode of operasiAi(ai)) {
    dibungkus[metode] = async (args) => {
      if (rekaman.totalToken >= maksToken) {
        rekaman.galatBatas = galatQa('QA_BATAS_TOKEN', `Batas token QA malam (${maksToken}) tercapai`);
        throw rekaman.galatBatas;
      }
      const mulai = Date.now();
      try {
        const hasil = await ai[metode](args);
        const { usage, ...keluaran } = hasil;
        catat(metode, args, mulai, usage, { keluaran });
        return hasil;
      } catch (e) {
        // AI_BAD_OUTPUT membawa pemakaian dua panggilan model (percobaan dan ulangan); tetap dihitung.
        catat(metode, args, mulai, e.usage, { galat: e.code || e.name });
        throw e;
      }
    };
  }
  return dibungkus;
}

function persentil(nilai, p) {
  if (!nilai.length) return null;
  const urut = [...nilai].sort((a, b) => a - b);
  return urut[Math.min(urut.length - 1, Math.ceil((p / 100) * urut.length) - 1)];
}

/** Total token dan latensi p50/p95 per operasi dari rekaman panggilan. */
function ringkasPanggilan(panggilan) {
  const latensi = {};
  for (const op of new Set(panggilan.map((x) => x.operasi))) {
    const ms = panggilan.filter((x) => x.operasi === op).map((x) => x.latencyMs);
    latensi[op] = { jumlah: ms.length, p50: persentil(ms, 50), p95: persentil(ms, 95) };
  }
  const t = jumlahToken(panggilan);
  return { token: { input: t.inputTokens, output: t.outputTokens }, latensi };
}

module.exports = { buatPerekam, operasiAi, ringkasPanggilan };
