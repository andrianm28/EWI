'use strict';
// RG-2: data kinerja (OKR/KPI/SLA) diunggah, mis. ekspor HappyFive. Target merah = pemicu TNA.
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

/** Validasi satu baris impor. Return { row } atau { error }. */
function normalizeRow(raw) {
  const r = raw || {};
  const metricType = String(r.metricType || '').toLowerCase();
  if (!r.employeeId && !r.email) return { error: 'employeeId atau email wajib diisi' };
  if (!METRIC_TYPES.includes(metricType)) return { error: 'metricType harus okr, kpi, atau sla' };
  if (!r.name) return { error: 'name wajib diisi' };
  const direction = r.direction === 'lower' ? 'lower' : 'higher';
  if (!Number.isFinite(Number(r.target)) || !Number.isFinite(Number(r.actual))) return { error: 'target dan actual harus angka' };
  const { isMet } = evaluate({ target: r.target, actual: r.actual, direction });
  return {
    row: {
      employeeId: r.employeeId ? String(r.employeeId) : null,
      email: r.email ? String(r.email).toLowerCase() : null,
      metricType, name: String(r.name), target: Number(r.target), actual: Number(r.actual),
      direction, unit: r.unit ? String(r.unit) : null, isMet,
    },
  };
}

module.exports = { METRIC_TYPES, evaluate, normalizeRow };
