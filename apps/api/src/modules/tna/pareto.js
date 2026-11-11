'use strict';
// Prioritas kebutuhan training (Pareto). BT-30 masih terbuka; rumus ★ (target meleset × jumlah orang ×
// kepentingan kompetensi) dipakai dengan komponen yang bisa dimatikan lewat settings.tna.pareto.

/**
 * findings: [{ userId, competencyId, competencyName, title, missRatio, importance }] (kategori training saja)
 * Return [{ key, label, competencyId, people, score, share, cumulativeShare }] urut skor menurun.
 */
function rankTrainingNeeds(findings, { useMiss = true, useImportance = true } = {}) {
  const groups = new Map();
  for (const f of findings) {
    const key = f.competencyId || `t:${String(f.title).toLowerCase()}`;
    const g = groups.get(key) || { key, label: f.competencyName || f.title, competencyId: f.competencyId || null, users: new Set(), misses: [], importance: f.importance ?? 3 };
    g.users.add(f.userId);
    if (f.missRatio != null) g.misses.push(Number(f.missRatio));
    groups.set(key, g);
  }
  const rows = [...groups.values()].map((g) => {
    const avgMiss = g.misses.length ? g.misses.reduce((a, b) => a + b, 0) / g.misses.length : 0;
    const score = g.users.size * (useMiss ? 1 + avgMiss : 1) * (useImportance ? g.importance / 3 : 1);
    return { key: g.key, label: g.label, competencyId: g.competencyId, people: g.users.size, avgMiss: round(avgMiss), score: round(score) };
  }).sort((a, b) => b.score - a.score || b.people - a.people);
  const total = rows.reduce((s, r) => s + r.score, 0) || 1;
  let cum = 0;
  return rows.map((r) => { cum += r.score; return { ...r, share: round(r.score / total), cumulativeShare: round(cum / total) }; });
}

const round = (n) => Math.round(n * 100) / 100;

module.exports = { rankTrainingNeeds };
