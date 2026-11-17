'use strict';
// Hasil wawancara DNA manual (cadence 11 Nov, C2): satu baris = karyawan x kompetensi, skor 0-4.
// Kompetensi dicocokkan dengan kamus (nama tanpa beda huruf besar/kecil atau competencyId); tidak dibuat otomatis.
const v = require('../values');
const { EMPLOYEE_FIELDS, employeeFinder, employeeError, NOT_FOUND } = require('./common');

module.exports = {
  key: 'dna_results',
  label: 'Hasil DNA manual (gap)',
  description: 'Skor 0-4 per karyawan per kompetensi dari wawancara manual; gap dihitung terhadap skor minimal.',
  submodules: ['dna'],
  fields: [
    ...EMPLOYEE_FIELDS,
    { key: 'competency', header: 'Kompetensi', oneOf: 'competency', aliases: ['nama kompetensi', 'competency'], example: 'Memahami kontrak proyek', help: 'Nama persis seperti di kamus kompetensi.' },
    { key: 'competencyId', header: 'ID Kompetensi', oneOf: 'competency', aliases: ['competency id'], example: '', help: 'Opsional, pengganti nama kompetensi.' },
    { key: 'score', header: 'Skor', required: true, aliases: ['nilai', 'score', 'skor aktual', 'level kompetensi'], example: 2, help: 'Bilangan bulat 0-4.' },
    { key: 'evidence', header: 'Bukti', aliases: ['catatan', 'evidence', 'keterangan'], example: 'Belum bisa menjelaskan klausul SLA' },
    { key: 'assessor', header: 'Pewawancara', aliases: ['asesor', 'assessor', 'penilai'], example: 'Abdan', help: 'Kosong = memakai isian Pewawancara di layar impor.' },
    { key: 'assessedAt', header: 'Tanggal Wawancara', aliases: ['tanggal', 'tgl wawancara', 'assessed at', 'tanggal asesmen'], example: '2026-11-10' },
  ],
  options: [
    { key: 'assessor', label: 'Pewawancara (bila kolom kosong)', type: 'text' },
    { key: 'assessedAt', label: 'Tanggal wawancara (bila kolom kosong)', type: 'date' },
  ],
  checkOptions(o) {
    if (o.assessedAt && !v.date(o.assessedAt)) return 'Tanggal wawancara tidak valid';
    return null;
  },
  async context({ stores, tenantId, rows }) {
    const comps = await stores.dna.listCompetencies(tenantId);
    return { find: await employeeFinder(stores, tenantId, rows), comps };
  },
  validate(row, ctx, options = {}) {
    const e = employeeError(row); if (e) return { error: e };
    const score = v.integer(row.score);
    if (!(score >= 0 && score <= 4)) return { error: 'Skor harus bilangan bulat 0-4' };
    const u = ctx.find(row);
    let comp = null;
    if (!v.blank(row.competencyId)) comp = ctx.comps.find((c) => c.id === v.text(row.competencyId));
    else {
      const name = v.text(row.competency).toLowerCase();
      const all = ctx.comps.filter((c) => c.name.trim().toLowerCase() === name);
      const forRole = u ? all.filter((c) => !c.jobRoleId || c.jobRoleId === u.jobRoleId) : [];
      comp = forRole.length === 1 ? forRole[0] : (all.length === 1 ? all[0] : null);
      if (!comp && all.length > 1) return { error: 'Nama kompetensi dipakai beberapa job role; isi ID Kompetensi atau posisi karyawan' };
    }
    if (!comp) return { error: 'Kompetensi tidak ada di kamus kompetensi organisasi ini' };
    if (!u) return { error: NOT_FOUND };
    const when = v.blank(row.assessedAt) ? (options.assessedAt ? v.date(options.assessedAt) : null) : v.date(row.assessedAt);
    if (!v.blank(row.assessedAt) && !when) return { error: 'Tanggal Wawancara tidak valid' };
    return {
      value: {
        userId: u.id, competencyId: comp.id, score, evidence: v.text(row.evidence) || null,
        assessor: v.text(row.assessor) || v.text(options.assessor) || null, assessedAt: when,
      },
    };
  },
  async commit({ stores, tenantId, values, batchId }) {
    for (const a of values) {
      await stores.dna.addAssessment(tenantId, { ...a, confidence: 1, source: 'manual_interview', importBatchId: batchId });
    }
    return { assessments: values.length };
  },
};
