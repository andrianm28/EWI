'use strict';
// Kinerja OKR/KPI/SLA (RG-2, mis. ekspor HappyFive). Target merah = pemicu TNA.
// BT-26: tipe nilai angka, persen, rating, biner (ya/tidak), dan tenggat (tanggal; lebih awal lebih baik).
const v = require('../values');
const { evaluate } = require('../../tna/performance');
const { EMPLOYEE_FIELDS, employeeFinder, employeeError, NOT_FOUND } = require('./common');

const METRIC_CHOICES = { okr: ['objective', 'key result', 'kr'], kpi: ['key performance indicator'], sla: ['service level', 'service level agreement'] };
const VALUE_TYPES = { angka: ['number', 'nilai', 'jumlah'], persen: ['persentase', 'percent', '%'], rating: ['skala', 'skor'], biner: ['ya/tidak', 'binary', 'boolean'], tenggat: ['deadline', 'tanggal', 'due date'] };
const DIRECTION_CHOICES = { higher: ['lebih tinggi lebih baik', 'naik', 'tinggi', 'max', 'maksimal'], lower: ['lebih rendah lebih baik', 'turun', 'rendah', 'min', 'minimal'] };
const DAY = 86400000;

/** target/realisasi sesuai tipe nilai -> { target, actual, direction } atau { error }. */
function values(valueType, rawTarget, rawActual, direction) {
  if (valueType === 'biner') {
    const t = v.blank(rawTarget) ? 1 : v.binary(rawTarget);
    const a = v.binary(rawActual);
    if (t === null || a === null) return { error: 'Target/Realisasi biner harus ya atau tidak' };
    return { target: t, actual: a, direction: 'higher' };
  }
  if (valueType === 'tenggat') {
    const t = v.date(rawTarget); const a = v.date(rawActual);
    if (!t || !a) return { error: 'Target/Realisasi tenggat harus tanggal (2026-11-30 atau 30/11/2026)' };
    // disimpan sebagai nomor hari; lebih awal = lebih baik
    return { target: Math.round(t.getTime() / DAY), actual: Math.round(a.getTime() / DAY), direction: 'lower' };
  }
  const t = v.number(rawTarget); const a = v.number(rawActual);
  if (!Number.isFinite(t) || !Number.isFinite(a)) return { error: 'Target dan Realisasi harus angka' };
  return { target: t, actual: a, direction };
}

module.exports = {
  key: 'tna_performance',
  label: 'Kinerja KPI/OKR/SLA',
  description: 'Target dan realisasi per karyawan (mis. ekspor HappyFive). Target yang tidak tercapai menjadi pemicu TNA.',
  submodules: ['tna'],
  VALUE_TYPES: Object.keys(VALUE_TYPES),
  fields: [
    ...EMPLOYEE_FIELDS,
    { key: 'metricType', header: 'Jenis Metrik', required: true, aliases: ['tipe metrik', 'metric type', 'jenis'], example: 'kpi', help: 'okr, kpi, atau sla.' },
    { key: 'name', header: 'Nama Metrik', required: true, aliases: ['metrik', 'nama kpi', 'indikator', 'key result', 'name'], example: 'Resolusi tiket < 4 jam' },
    { key: 'valueType', header: 'Tipe Nilai', aliases: ['tipe kpi', 'value type', 'satuan nilai'], example: 'persen', help: 'angka (default), persen, rating, biner, atau tenggat.' },
    { key: 'target', header: 'Target', required: true, aliases: ['target nilai', 'goal'], example: '90%' },
    { key: 'actual', header: 'Realisasi', required: true, aliases: ['aktual', 'actual', 'pencapaian', 'capaian'], example: '72%' },
    { key: 'direction', header: 'Arah', aliases: ['arah target', 'direction', 'polaritas'], example: 'lebih tinggi lebih baik', help: 'lebih tinggi lebih baik (default) atau lebih rendah lebih baik. Tenggat selalu lebih awal lebih baik.' },
    { key: 'unit', header: 'Satuan', aliases: ['unit', 'satuan ukur'], example: '%' },
    { key: 'period', header: 'Periode', aliases: ['period', 'bulan', 'kuartal'], example: '2026-11', help: 'Kosong = memakai periode di layar impor.' },
  ],
  options: [
    { key: 'period', label: 'Periode (bila kolom kosong)', type: 'text', required: true },
    { key: 'projectId', label: 'Proyek', type: 'project' },
    // B11: asal data (mis. HRIS, HappyFive, Berkas); hanya tercatat di riwayat impor
    { key: 'source', label: 'Sumber data (mis. HRIS)', type: 'text' },
  ],
  checkOptions(o) {
    if (!v.text(o.period)) return 'Periode wajib diisi (mis. 2026-11)';
    if (v.text(o.source).length > 64) return 'Sumber data maksimal 64 karakter';
    return null;
  },
  async context({ stores, tenantId, rows, options }) {
    if (options.projectId && !(await stores.projectsExtra.exists(tenantId, options.projectId))) return { fatal: 'Proyek tidak ditemukan' };
    return { find: await employeeFinder(stores, tenantId, rows) };
  },
  validate(row, ctx, options = {}) {
    const e = employeeError(row); if (e) return { error: e };
    const metricType = v.choice(row.metricType, METRIC_CHOICES);
    if (!metricType) return { error: 'Jenis Metrik harus okr, kpi, atau sla' };
    const name = v.text(row.name);
    if (!name) return { error: 'Nama Metrik wajib diisi' };
    const valueType = v.blank(row.valueType) ? 'angka' : v.choice(row.valueType, VALUE_TYPES);
    if (!valueType) return { error: 'Tipe Nilai harus angka, persen, rating, biner, atau tenggat' };
    const dir = v.blank(row.direction) ? 'higher' : v.choice(row.direction, DIRECTION_CHOICES);
    if (!dir) return { error: 'Arah harus lebih tinggi lebih baik atau lebih rendah lebih baik' };
    const val = values(valueType, row.target, row.actual, dir);
    if (val.error) return { error: val.error };
    const u = ctx.find(row); if (!u) return { error: NOT_FOUND };
    const { isMet } = evaluate(val);
    return {
      value: {
        userId: u.id, metricType, name, valueType, target: val.target, actual: val.actual, direction: val.direction, isMet,
        unit: v.text(row.unit) || (valueType === 'persen' ? '%' : null), period: v.text(row.period) || v.text(options.period),
      },
    };
  },
  async commit({ stores, tenantId, values: rows, options, batchId }) {
    // dikelompokkan per periode karena store menyimpan periode per panggilan
    const byPeriod = new Map();
    for (const r of rows) { if (!byPeriod.has(r.period)) byPeriod.set(r.period, []); byPeriod.get(r.period).push(r); }
    for (const [period, list] of byPeriod) {
      await stores.tna.insertPerformance(tenantId, list, { projectId: options.projectId || null, period, batchId });
    }
    return { records: rows.length, red: rows.filter((r) => r.isMet === false).length };
  },
};
