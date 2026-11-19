'use strict';
// B15: skor pre, post (per kompetensi, menimpa skor modul dari Learning Delivery), dan kinerja per karyawan per
// kompetensi rencana Impact Measurement. Bukan potret: baris yang ditolak tidak menahan baris lain, kosong = tidak diubah.
// Kompetensi dicocokkan lewat ID Kompetensi atau nama, hanya di antara kompetensi rencana (spek 6.6).
const v = require('../values');
const { EMPLOYEE_FIELDS, employeeFinder, employeeError, NOT_FOUND } = require('./common');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (s) => v.text(s).replace(/\s+/g, ' ').toLowerCase();
const SCORES = [['preScore', 'Skor Pre'], ['postScore', 'Skor Post'], ['performanceScore', 'Skor Kinerja']];

module.exports = {
  key: 'lim_measurements',
  label: 'Skor dampak belajar (Impact Measurement)',
  description: 'Skor sebelum, sesudah, dan kinerja per karyawan per kompetensi untuk satu rencana pengukuran dampak.',
  submodules: ['lim'],
  fields: [
    ...EMPLOYEE_FIELDS,
    { key: 'competencyId', header: 'ID Kompetensi', oneOf: 'competency', aliases: ['competency id', 'id kompetensi'], help: 'Isi ini bila nama kompetensi dipakai di lebih dari satu jabatan atau level.' },
    { key: 'competencyName', header: 'Nama Kompetensi', oneOf: 'competency', aliases: ['kompetensi', 'competency', 'nama kompetensi'], example: 'Root Cause Analysis & Post-Incident Report' },
    { key: 'preScore', header: 'Skor Pre', aliases: ['pre', 'skor sebelum', 'pre test'], example: '52', help: '0-100. Kosong = tidak diubah.' },
    { key: 'postScore', header: 'Skor Post', aliases: ['post', 'skor sesudah', 'post test'], example: '71', help: '0-100, per kompetensi. Kosong = memakai skor modul dari Learning Delivery.' },
    { key: 'performanceScore', header: 'Skor Kinerja', aliases: ['kinerja', 'skor kerja', 'review atasan'], example: '88', help: '0-100. Kosong = tidak diubah.' },
    { key: 'performanceNote', header: 'Catatan Kinerja', aliases: ['catatan', 'catatan atasan'], example: 'Review atasan atas laporan RCA' },
  ],
  options: [{ key: 'planId', label: 'Rencana pengukuran', type: 'text', required: true }],
  checkOptions(o) {
    if (!UUID.test(String(o.planId || ''))) return 'Rencana pengukuran wajib dipilih';
    return null;
  },
  async context({ stores, tenantId, rows, options }) {
    const plan = await stores.lim.getPlan(tenantId, options.planId);
    if (!plan || plan.status !== 'active') return { fatal: 'Rencana pengukuran tidak ditemukan atau sudah diarsipkan' };
    const [comps, parts, saved] = await Promise.all([
      stores.lim.planCompetencies(tenantId, plan.id), stores.lim.participations(tenantId, plan.id), stores.lim.measurements(tenantId, plan.id),
    ]);
    const byName = new Map();
    for (const c of comps) byName.set(norm(c.name), [...(byName.get(norm(c.name)) || []), c.id]);
    return {
      find: await employeeFinder(stores, tenantId, rows),
      members: new Set([...parts.map((p) => p.userId), ...saved.map((m) => m.userId)]),
      compIds: new Set(comps.map((c) => c.id)), byName,
    };
  },
  validate(row, ctx) {
    const e = employeeError(row); if (e) return { error: e };
    const user = ctx.find(row);
    if (!user) return { error: NOT_FOUND };
    if (!ctx.members.has(user.id)) return { error: 'Karyawan bukan peserta rencana ini' };
    let competencyId = null;
    if (!v.blank(row.competencyId)) {
      competencyId = v.text(row.competencyId).toLowerCase();
      if (!ctx.compIds.has(competencyId)) return { error: 'ID Kompetensi bukan bagian rencana ini' };
    } else if (!v.blank(row.competencyName)) {
      // nama juga boleh berisi UUID (kolom tertukar)
      const raw = v.text(row.competencyName).toLowerCase();
      const ids = ctx.compIds.has(raw) ? [raw] : ctx.byName.get(norm(row.competencyName)) || [];
      if (!ids.length) return { error: 'Kompetensi bukan bagian rencana ini' };
      if (ids.length > 1) return { error: 'Nama kompetensi cocok ke lebih dari satu kompetensi rencana, isi ID Kompetensi' };
      [competencyId] = ids;
    } else return { error: 'ID Kompetensi atau Nama Kompetensi wajib diisi' };
    const value = { userId: user.id, competencyId };
    for (const [f, label] of SCORES) {
      if (v.blank(row[f])) continue;
      const n = Number(String(row[f]).replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 100) return { error: `${label} harus angka 0-100` };
      value[f] = n;
    }
    if (!v.blank(row.performanceNote)) {
      const note = v.text(row.performanceNote);
      if (note.length > 500) return { error: 'Catatan Kinerja paling panjang 500 karakter' };
      value.performanceNote = note;
    }
    if (Object.keys(value).length === 2) return { error: 'Isi minimal satu skor atau catatan' };
    return { value };
  },
  async commit({ stores, tenantId, values, options, user }) {
    // baris ganda (karyawan + kompetensi): baris terakhir dipakai
    const last = new Map(values.map((x) => [`${x.userId}|${x.competencyId}`, x]));
    let saved = 0;
    for (const x of last.values()) {
      const { userId, competencyId, ...patch } = x;
      if (await stores.lim.upsertMeasurement(tenantId, options.planId, userId, competencyId, patch, { source: 'import', by: user?.id || null })) saved += 1;
    }
    return { saved };
  },
};
