'use strict';
// Kamus kompetensi (RG-1a: semua sumber boleh, dicatat di kolom source). Duplikat di kamus tidak dibuat ulang.
const v = require('../values');

const SOURCE_CHOICES = { hr_rule: ['aturan hr', 'hr', 'dokumen hr'], dacum: ['dacum'], cca: ['cca'], both: ['keduanya', 'hr + dacum'] };
const KIND_CHOICES = { job: ['jabatan', 'teknis', 'kompetensi jabatan'], core: ['inti', 'umum', 'kompetensi inti'] };

module.exports = {
  key: 'dna_competencies',
  label: 'Kamus kompetensi',
  description: 'Kompetensi per job role/jenjang dengan skor minimal (0-4) dan bobot kepentingan.',
  submodules: ['dna'],
  fields: [
    { key: 'jobRole', header: 'Job Role', aliases: ['jabatan', 'posisi'], example: 'Service Delivery L1', help: 'Kosongkan untuk kompetensi inti yang berlaku semua job role.' },
    { key: 'careerLevel', header: 'Jenjang', aliases: ['level', 'grade'], example: 'Junior', help: 'Kosong = berlaku semua jenjang job role ini.' },
    { key: 'kind', header: 'Jenis', aliases: ['jenis kompetensi', 'kind', 'tipe'], example: 'jabatan', help: 'jabatan atau inti. Kosong = jabatan bila Job Role diisi.' },
    { key: 'name', header: 'Kompetensi', required: true, aliases: ['nama kompetensi', 'competency', 'kompetensi'], example: 'Memahami kontrak proyek' },
    { key: 'definition', header: 'Definisi', aliases: ['deskripsi', 'definition'], example: 'Mampu membaca SLA dan ruang lingkup kontrak' },
    { key: 'indicators', header: 'Indikator', aliases: ['indikator perilaku', 'indicators'], example: 'Menjelaskan SLA; Menemukan klausul penalti', help: 'Pisahkan dengan titik koma.' },
    { key: 'requiredScore', header: 'Skor Minimal', aliases: ['skor minimum', 'target skor', 'required score', 'standar'], example: 3, help: '0-4, default 3.' },
    { key: 'importance', header: 'Kepentingan', aliases: ['bobot', 'importance', 'prioritas'], example: 4, help: '1-5, default 3.' },
    { key: 'source', header: 'Sumber', aliases: ['source', 'asal'], example: 'dacum', help: 'aturan hr (default), dacum, cca, atau keduanya.' },
  ],
  async context({ stores, tenantId }) {
    const [roles, comps] = await Promise.all([stores.dna.listJobRoles(tenantId), stores.dna.listCompetencies(tenantId)]);
    const keyOf = (c) => `${c.jobRoleId || ''}|${c.careerLevelId || ''}|${c.name.trim().toLowerCase()}`;
    return { roles, existing: new Set(comps.map(keyOf)), keyOf, seen: new Set() };
  },
  validate(row, ctx) {
    const name = v.text(row.name);
    if (!name) return { error: 'Kompetensi wajib diisi' };
    let jobRoleId = null; let careerLevelId = null; let jr = null;
    if (!v.blank(row.jobRole)) {
      jr = ctx.roles.find((r) => r.name.trim().toLowerCase() === v.text(row.jobRole).toLowerCase());
      if (!jr) return { error: `Job role "${v.text(row.jobRole)}" belum ada` };
      jobRoleId = jr.id;
    }
    if (!v.blank(row.careerLevel)) {
      if (!jr) return { error: 'Jenjang butuh Job Role' };
      const lvl = jr.levels.find((l) => l.name.trim().toLowerCase() === v.text(row.careerLevel).toLowerCase());
      if (!lvl) return { error: `Jenjang "${v.text(row.careerLevel)}" tidak ada di job role ${jr.name}` };
      careerLevelId = lvl.id;
    }
    const kind = v.blank(row.kind) ? (jobRoleId ? 'job' : 'core') : v.choice(row.kind, KIND_CHOICES);
    if (!kind) return { error: 'Jenis harus jabatan atau inti' };
    if (kind === 'job' && !jobRoleId) return { error: 'Kompetensi jabatan butuh Job Role' };
    const requiredScore = v.blank(row.requiredScore) ? 3 : v.integer(row.requiredScore);
    if (!(requiredScore >= 0 && requiredScore <= 4)) return { error: 'Skor Minimal harus bilangan bulat 0-4' };
    const importance = v.blank(row.importance) ? 3 : v.integer(row.importance);
    if (!(importance >= 1 && importance <= 5)) return { error: 'Kepentingan harus bilangan bulat 1-5' };
    const source = v.blank(row.source) ? 'hr_rule' : v.choice(row.source, SOURCE_CHOICES);
    if (!source) return { error: 'Sumber harus aturan hr, dacum, cca, atau keduanya' };
    const key = ctx.keyOf({ jobRoleId, careerLevelId, name });
    if (ctx.existing.has(key)) return { error: 'Kompetensi ini sudah ada di kamus' };
    if (ctx.seen.has(key)) return { error: 'Kompetensi muncul lebih dari sekali di file' };
    ctx.seen.add(key);
    const indicators = v.text(row.indicators).split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
    return { value: { jobRoleId, careerLevelId, kind, name, definition: v.text(row.definition) || null, indicators, requiredScore, importance, source } };
  },
  async commit({ stores, tenantId, values }) {
    for (const c of values) await stores.dna.createCompetency(tenantId, c);
    return { competencies: values.length };
  },
};
