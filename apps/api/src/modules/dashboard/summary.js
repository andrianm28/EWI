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

/** Median dalam hari penuh (dibulatkan ke atas); null bila kosong. */
function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return Math.ceil(v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2);
}

/**
 * Kesepakatan AI–HR (PM-2 D, angka pemantauan): bagian temuan AI yang disetujui HR tanpa diubah.
 * counts: { draft, approved, edited, rejected }
 */
function agreement(counts) {
  const approved = counts.approved || 0;
  const reviewed = approved + (counts.edited || 0) + (counts.rejected || 0);
  return { percent: reviewed ? Math.round((approved / reviewed) * 100) : null, approved, reviewed, targetPercent: AGREEMENT_TARGET_PERCENT };
}

module.exports = { markHot, median, agreement, AGREEMENT_TARGET_PERCENT, ANALYSIS_TARGET_DAYS, PARETO_LIMIT };
