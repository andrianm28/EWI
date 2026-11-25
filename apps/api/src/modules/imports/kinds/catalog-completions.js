'use strict';
// PK-18: status lulus per course dari berkas (mis. laporan penyelesaian Moodle). Course yang lulus menutup
// rencana training yang menunjuk course itu (status 'completed').
const v = require('../values');
const { EMPLOYEE_FIELDS, employeeFinder, employeeError, NOT_FOUND } = require('./common');

const STATUS_CHOICES = {
  passed: ['lulus', 'selesai', 'complete', 'completed', 'sudah lulus', 'tuntas'],
  in_progress: ['sedang berjalan', 'berjalan', 'proses', 'belum selesai', 'on progress', 'in progress'],
  failed: ['tidak lulus', 'gagal', 'belum lulus'],
};

module.exports = {
  key: 'catalog_completions',
  label: 'Status lulus course',
  description: 'Status penyelesaian course katalog per karyawan. Course yang lulus menutup rencana training terkait.',
  submodules: ['tna', 'dna'],
  fields: [
    ...EMPLOYEE_FIELDS,
    { key: 'courseRef', header: 'Kode Course', required: true, aliases: ['id course', 'course id', 'shortname', 'short name', 'kode', 'kode kursus'], example: 'SDL1-101', help: 'Kode Course seperti di template Katalog course.' },
    { key: 'status', header: 'Status', required: true, aliases: ['status course', 'status kelulusan', 'completion status'], example: 'lulus', help: 'lulus, sedang berjalan, atau tidak lulus.' },
    { key: 'completedAt', header: 'Tanggal Lulus', aliases: ['tgl lulus', 'tanggal selesai', 'completed at', 'time completed'], example: '2026-11-20', help: 'Format 2026-11-20 atau 20/11/2026. Kosong untuk status lulus = tanggal impor.' },
    { key: 'score', header: 'Nilai', aliases: ['skor', 'grade', 'score', 'nilai akhir'], example: 85, help: 'Opsional, angka.' },
  ],
  async context({ stores, tenantId, rows }) {
    const refs = [...new Set(rows.map((r) => v.text(r.courseRef)).filter(Boolean))];
    const items = await stores.catalog.itemsByRef(tenantId, refs, 'moodle');
    return { find: await employeeFinder(stores, tenantId, rows), items: new Map(items.map((i) => [i.ref, i])), seen: new Set() };
  },
  validate(row, ctx) {
    const e = employeeError(row); if (e) return { error: e };
    const ref = v.text(row.courseRef);
    if (!ref) return { error: 'Kode Course wajib diisi' };
    const status = v.choice(row.status, STATUS_CHOICES);
    if (!status) return { error: 'Status harus lulus, sedang berjalan, atau tidak lulus' };
    const completedAt = v.blank(row.completedAt) ? null : v.date(row.completedAt);
    if (!v.blank(row.completedAt) && !completedAt) return { error: 'Tanggal Lulus tidak valid' };
    const score = v.blank(row.score) ? null : v.number(row.score);
    if (score !== null && !Number.isFinite(score)) return { error: 'Nilai harus angka' };
    const item = ctx.items.get(ref);
    if (!item) return { error: `Course "${ref}" belum ada di katalog (impor Katalog course dulu)` };
    const u = ctx.find(row); if (!u) return { error: NOT_FOUND };
    const key = `${u.id}|${item.id}`;
    if (ctx.seen.has(key)) return { error: 'Karyawan dan course yang sama muncul lebih dari sekali' };
    ctx.seen.add(key);
    return { value: { userId: u.id, catalogItemId: item.id, ref, status, completedAt: status === 'passed' ? completedAt : null, score } };
  },
  async commit({ stores, tenantId, values, batchId, user }) {
    const now = new Date();
    await stores.catalog.upsertCompletions(tenantId, values.map((c) => ({ ...c, completedAt: c.status === 'passed' ? c.completedAt || now : null })),
      { batchId, recordedBy: user ? user.id : null });
    const plansCompleted = await stores.catalog.completePlansForPassed(tenantId, values.filter((c) => c.status === 'passed'), 'moodle');
    return { completions: values.length, passed: values.filter((c) => c.status === 'passed').length, plansCompleted };
  },
};
