'use strict';
// RG-2: data kinerja (OKR/KPI/SLA) diunggah, mis. ekspor HappyFive. Target merah = pemicu TNA.
// Validasi baris impor ada di src/modules/imports/kinds/performance.js (R3-3).
// PM-1 opsi B (★, belum dijawab per 17 Nov): target meleset = realisasi di sisi buruk target melebihi toleransi KPI.
// Toleransi dalam satuan target (persen-poin untuk persen, hari untuk tenggat). Toleransi 0 = opsi A (arah saja).
const METRIC_TYPES = ['okr', 'kpi', 'sla'];

/** Kunci aturan KPI: nama dinormalkan (huruf kecil, spasi tunggal). */
const metricKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Arah dan toleransi efektif untuk satu tipe nilai. Tenggat selalu "lebih awal lebih baik";
 * biner selalu "ya = tercapai" tanpa toleransi.
 */
function effectiveRule(valueType, { direction = 'higher', tolerance = 0 } = {}) {
  if (valueType === 'biner') return { direction: 'higher', tolerance: 0 };
  if (valueType === 'tenggat') return { direction: 'lower', tolerance: Number(tolerance) || 0 };
  return { direction: direction === 'lower' ? 'lower' : 'higher', tolerance: Number(tolerance) || 0 };
}

/** missRatio 0..1: seberapa jauh target meleset (0 = tercapai, termasuk yang masih dalam toleransi). */
function evaluate({ target, actual, direction = 'higher', tolerance = 0 }) {
  const t = Number(target); const a = Number(actual);
  if (!Number.isFinite(t) || !Number.isFinite(a)) return { isMet: null, missRatio: null };
  const tol = Math.max(0, Number(tolerance) || 0);
  const isMet = direction === 'lower' ? a <= t + tol : a >= t - tol;
  if (isMet) return { isMet: true, missRatio: 0 };
  const denom = Math.abs(t) || 1;
  const miss = direction === 'lower' ? (a - t) / denom : (t - a) / denom;
  return { isMet: false, missRatio: Math.min(1, Math.max(0, miss)) };
}

module.exports = { METRIC_TYPES, metricKey, effectiveRule, evaluate };
