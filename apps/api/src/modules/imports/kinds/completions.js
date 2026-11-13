'use strict';
// Status lulus Learning Program per karyawan (RG-1b: sumber manual HR lewat impor).
const v = require('../values');
const { EMPLOYEE_FIELDS, employeeFinder, employeeError, NOT_FOUND, TIER_CHOICES } = require('./common');

const STATUS_CHOICES = {
  passed: ['lulus', 'selesai', 'complete', 'completed', 'sudah lulus'],
  in_progress: ['sedang berjalan', 'berjalan', 'proses', 'belum selesai', 'on progress'],
  failed: ['tidak lulus', 'gagal', 'belum lulus'],
};

module.exports = {
  key: 'dna_completions',
  label: 'Status lulus program',
  description: 'Status Learning Program Basic/Intermediate/Advanced tiap karyawan.',
  submodules: ['dna'],
  fields: [
    ...EMPLOYEE_FIELDS,
    { key: 'programTier', header: 'Program', required: true, aliases: ['learning program', 'tier', 'program pembelajaran'], example: 'basic', help: 'basic/dasar, intermediate/menengah, advanced/lanjutan.' },
    { key: 'status', header: 'Status', required: true, aliases: ['status program', 'status kelulusan'], example: 'lulus', help: 'lulus, sedang berjalan, atau tidak lulus.' },
    { key: 'passedAt', header: 'Tanggal Lulus', aliases: ['tgl lulus', 'tanggal selesai', 'passed at'], example: '2026-10-30', help: 'Format 2026-10-30 atau 30/10/2026.' },
  ],
  async context({ stores, tenantId, rows }) {
    return { find: await employeeFinder(stores, tenantId, rows), seen: new Set() };
  },
  validate(row, ctx) {
    const e = employeeError(row); if (e) return { error: e };
    const programTier = v.choice(row.programTier, TIER_CHOICES);
    if (!programTier) return { error: 'Program harus basic, intermediate, atau advanced' };
    const status = v.choice(row.status, STATUS_CHOICES);
    if (!status) return { error: 'Status harus lulus, sedang berjalan, atau tidak lulus' };
    const passedAt = v.blank(row.passedAt) ? null : v.date(row.passedAt);
    if (!v.blank(row.passedAt) && !passedAt) return { error: 'Tanggal Lulus tidak valid' };
    const u = ctx.find(row); if (!u) return { error: NOT_FOUND };
    const key = `${u.id}|${programTier}`;
    if (ctx.seen.has(key)) return { error: 'Karyawan dan program yang sama muncul lebih dari sekali' };
    ctx.seen.add(key);
    return { value: { userId: u.id, programTier, status, passedAt: status === 'passed' ? passedAt : null } };
  },
  async commit({ stores, tenantId, values, user }) {
    for (const c of values) {
      await stores.dna.upsertCompletion(tenantId, { ...c, source: 'manual', passedAt: c.status === 'passed' ? c.passedAt || new Date() : null, recordedBy: user.id });
    }
    return { completions: values.length };
  },
};
