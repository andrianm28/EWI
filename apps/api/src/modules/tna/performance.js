'use strict';
// RG-2: data kinerja (OKR/KPI/SLA) diunggah, mis. ekspor HappyFive. Target merah = pemicu TNA.
// Validasi baris impor ada di src/modules/imports/kinds/performance.js (R3-3).
const METRIC_TYPES = ['okr', 'kpi', 'sla'];

/** missRatio 0..1: seberapa jauh target meleset (0 = tercapai). */
function evaluate({ target, actual, direction = 'higher' }) {
  const t = Number(target); const a = Number(actual);
  if (!Number.isFinite(t) || !Number.isFinite(a)) return { isMet: null, missRatio: null };
  const isMet = direction === 'lower' ? a <= t : a >= t;
  if (isMet) return { isMet: true, missRatio: 0 };
  const denom = Math.abs(t) || 1;
  const miss = direction === 'lower' ? (a - t) / denom : (t - a) / denom;
  return { isMet: false, missRatio: Math.min(1, Math.max(0, miss)) };
}

module.exports = { METRIC_TYPES, evaluate };
