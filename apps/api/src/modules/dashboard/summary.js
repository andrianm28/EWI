'use strict';
// Fungsi murni ringkasan dashboard (B3). Definisi angka: docs/designs/b3-dashboard.md bagian 3.3.

const AGREEMENT_TARGET_PERCENT = 85; // PO-5 C: target yang dikejar selama pilot
const ANALYSIS_TARGET_DAYS = 14; // LIN-B1: TNA selesai dalam 2 minggu
const PARETO_THRESHOLD = 0.8;
const PARETO_LIMIT = 7;

/** Tandai baris Pareto prioritas: dari atas sampai kumulatif pertama kali mencapai 80% (baris yang melewatinya ikut). */
function markHot(rows) {
  let reached = false;
  return rows.map((r) => {
    const hot = !reached;
    if (r.cumulativeShare >= PARETO_THRESHOLD) reached = true;
    return { ...r, hot };
  });
}

/** Median selisih (hari pecahan), lalu dibulatkan ke atas ke hari penuh; null bila kosong. */
function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  const m = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  // Dibulatkan ke 0,01 hari (±15 menit) dulu supaya selisih detik antar-cap waktu tidak menaikkan satu hari penuh
  return Math.ceil(Math.round(m * 100) / 100);
}

/**
 * Kesepakatan AI–HR (PM-2 D, angka pemantauan): bagian temuan AI yang disetujui HR tanpa diubah.
 * counts berasal dari stores.tna.aiReviewCounts: hanya temuan hasil job analisis yang diputus orang.
 * counts: { draft, approved, edited, rejected }
 */
function agreement(counts) {
  const approved = counts.approved || 0;
  const reviewed = approved + (counts.edited || 0) + (counts.rejected || 0);
  return { percent: reviewed ? Math.round((approved / reviewed) * 100) : null, approved, reviewed, targetPercent: AGREEMENT_TARGET_PERCENT };
}

/**
 * Target kinerja yang belum tercapai pada periode terbaru tiap metrik per karyawan. Periode lama tidak dihitung,
 * supaya angka tidak terus bertambah. Periode dibandingkan sebagai teks (format impor: '2026-11', '2026-Q4').
 */
function latestUnmet(records) {
  const latest = new Map();
  for (const r of records) {
    const key = `${r.userId}|${r.metricType}|${String(r.name).trim().toLowerCase()}`;
    const cur = latest.get(key);
    if (!cur || String(r.period || '') > String(cur.period || '')) latest.set(key, r);
  }
  return [...latest.values()].filter((r) => r.isMet === false).length;
}

module.exports = { markHot, median, agreement, latestUnmet, AGREEMENT_TARGET_PERCENT, ANALYSIS_TARGET_DAYS, PARETO_LIMIT };
