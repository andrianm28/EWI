'use strict';
// Hasil program nilai korporasi per karyawan (mis. laporan "Elitery's DNA 5C"). Satu baris = satu karyawan.
// Kolom Skor Nilai N dan Skor Komponen N dipetakan berurut ke nilai dan komponen di konfigurasi program
// (Core Competencies > program), sehingga satu template berlaku untuk semua tenant.
const v = require('../values');
const { EMPLOYEE_FIELDS, employeeFinder, employeeError, NOT_FOUND } = require('./common');
const { MAX_VALUES, MAX_COMPONENTS, KEY_RE } = require('../../cca/program-report');

const slots = (prefix, header, n, alias) => Array.from({ length: n }, (_, i) => ({
  key: `${prefix}${i + 1}`,
  header: `${header} ${i + 1}`,
  aliases: [`${alias} ${i + 1}`, `${alias}${i + 1}`],
  example: i === 0 ? 90 : '',
  help: `Angka 0-100. Urutan ke-${i + 1} di konfigurasi program; kosongkan bila belum dikerjakan atau tidak dipakai.`,
}));

const SCORE_ERROR = 'Skor harus angka 0-100';

/** Sel skor: kosong -> null, angka 0-100 -> number, selain itu undefined (tidak valid). */
function score(raw) {
  if (v.blank(raw)) return null;
  const n = v.number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
}

module.exports = {
  key: 'cca_program_results',
  label: 'Hasil program nilai korporasi',
  description: 'Hasil per karyawan dari laporan program nilai (kegiatan selesai, skor akhir, skor per nilai, skor per komponen). Halaman Core Competencies hanya menampilkan agregatnya.',
  submodules: ['cca'],
  fields: [
    ...EMPLOYEE_FIELDS,
    { key: 'division', header: 'Divisi', aliases: ['division', 'departemen', 'unit', 'unit kerja'], example: 'IT Service Delivery', help: 'Kosong = divisi job role karyawan.' },
    { key: 'activitiesDone', header: 'Kegiatan Selesai', required: true, aliases: ['jumlah kegiatan selesai', 'activities done', 'aktivitas selesai', 'progress'], example: 9, help: 'Jumlah kegiatan program yang sudah diselesaikan.' },
    { key: 'finalScore', header: 'Skor Akhir', aliases: ['nilai akhir', 'final score', 'total program', 'skor total'], example: 82.5, help: 'Angka 0-100. Kosong pada peserta yang selesai = dihitung dari komponen berbobot.' },
    ...slots('value', 'Skor Nilai', MAX_VALUES, 'nilai'),
    ...slots('component', 'Skor Komponen', MAX_COMPONENTS, 'komponen'),
  ],
  options: [
    { key: 'programKey', label: 'Program (key di konfigurasi program)', type: 'text', required: true },
    { key: 'cutoffDate', label: 'Tanggal cut off laporan', type: 'date' },
  ],
  checkOptions(o) {
    if (!o || !KEY_RE.test(String(o.programKey || ''))) return 'Pilih program nilai yang hasilnya diimpor';
    if (!v.blank(o.cutoffDate) && !v.date(o.cutoffDate)) return 'Tanggal cut off tidak valid';
    return null;
  },
  async context({ stores, tenantId, rows, options }) {
    const program = await stores.cca.getProgram(tenantId, options.programKey);
    if (!program) return { fatal: 'Program nilai belum dikonfigurasi di Core Competencies' };
    // Kolom nilai dan komponen dipetakan menurut urutan konfigurasi. Jumlah kolom terpetakan harus pas,
    // supaya kolom yang terlewat tidak diam-diam dihitung kosong dan urutannya terlihat oleh HR.
    const mapped = new Set(rows.flatMap((r) => Object.keys(r || {})));
    for (const [prefix, list, label] of [['value', program.config.values, 'Skor Nilai'], ['component', program.config.components, 'Skor Komponen']]) {
      const got = Array.from({ length: prefix === 'value' ? MAX_VALUES : MAX_COMPONENTS }, (_, i) => i + 1).filter((i) => mapped.has(`${prefix}${i}`));
      const want = list.map((_, i) => i + 1);
      if (rows.length && got.join(',') !== want.join(',')) {
        const pairs = list.map((x, i) => `${label} ${i + 1} = ${x.name}`).join('; ');
        return { fatal: `Petakan tepat ${list.length} kolom ${label} sesuai urutan program: ${pairs || 'tidak ada'}` };
      }
    }
    const roles = await stores.dna.listJobRoles(tenantId);
    const divisionByRole = new Map(roles.map((r) => [r.id, r.division || null]));
    return { program, find: await employeeFinder(stores, tenantId, rows), divisionOf: (u) => divisionByRole.get(u.jobRoleId) || null };
  },
  validate(row, ctx) {
    const e = employeeError(row); if (e) return { error: e };
    const { config } = ctx.program;
    const done = v.integer(row.activitiesDone);
    if (!(done >= 0 && done <= config.totalActivities)) return { error: `Kegiatan Selesai harus bilangan bulat 0-${config.totalActivities}` };
    const finalScore = score(row.finalScore);
    const valueScores = config.values.map((_, i) => score(row[`value${i + 1}`]));
    const componentScores = config.components.map((_, i) => score(row[`component${i + 1}`]));
    if ([finalScore, ...valueScores, ...componentScores].includes(undefined)) return { error: SCORE_ERROR };
    if (done >= config.totalActivities && finalScore === null && !componentScores.some((x) => x !== null)) {
      return { error: 'Peserta yang selesai butuh Skor Akhir atau skor komponen' };
    }
    const u = ctx.find(row);
    if (!u) return { error: NOT_FOUND };
    return {
      value: {
        programId: ctx.program.id, userId: u.id, division: v.text(row.division) || ctx.divisionOf(u) || 'Tanpa divisi',
        activitiesDone: done, finalScore, valueScores, componentScores,
      },
    };
  },
  async commit({ stores, tenantId, values, options = {}, batchId }) {
    // karyawan yang muncul dua kali di berkas: baris terakhir yang dipakai
    const last = [...new Map(values.map((x) => [x.userId, x])).values()];
    // Laporan program adalah potret per tanggal cut off: hasil lama program ini diganti seluruhnya.
    const cutoff = v.blank(options.cutoffDate) ? null : v.isoDate(v.date(options.cutoffDate));
    const { removed } = await stores.cca.replaceProgramResults(tenantId, last[0].programId, last, { batchId, cutoffDate: cutoff });
    return { participants: last.length, removed };
  },
};
