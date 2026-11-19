'use strict';
// Kamus kompetensi (RG-1a: semua sumber boleh, dicatat di kolom source). Duplikat di kamus tidak dibuat ulang.
// B4: kolom Kode, Rumpun, Level Program (BIA), dan Job Function. Baris yang kompetensinya sudah ada dan mengisi
// salah satu kolom B4 memperbarui kompetensi itu (hanya kolom B4), sehingga kamus POC bisa dilengkapi.
const v = require('../values');
const { TIER_CHOICES } = require('./common');

const SOURCE_CHOICES = { hr_rule: ['aturan hr', 'hr', 'dokumen hr'], dacum: ['dacum'], cca: ['cca'], both: ['keduanya', 'hr + dacum'] };
const KIND_CHOICES = { job: ['jabatan', 'teknis', 'kompetensi jabatan'], core: ['inti', 'umum', 'kompetensi inti'] };

// B4 (R1, review diff): kolom kamus B4 hanya tampil bila flag dna.development menyala. Mati = perilaku sebelum B4
// (tanpa kolom B4, judul "Level" = Jenjang, baris yang sudah ada selalu ditolak).
const B4_FLAG = 'dna.development';

module.exports = {
  key: 'dna_competencies',
  label: 'Kamus kompetensi',
  description: 'Kompetensi per job role/jenjang dengan skor minimal (0-4), bobot kepentingan, kode modul, rumpun, dan level program.',
  submodules: ['dna'],
  fields: [
    { key: 'jobRole', header: 'Job Role', aliases: ['jabatan', 'posisi'], example: 'Service Delivery L1', help: 'Kosongkan untuk kompetensi inti yang berlaku semua job role.' },
    { key: 'careerLevel', header: 'Jenjang', aliases: ['grade', 'jenjang karier'], flagOffAliases: { flag: B4_FLAG, aliases: ['level'] }, example: 'Junior', help: 'Jenjang karier (mis. Junior/Senior), bukan Basic/Intermediate/Advanced. Kosong = berlaku semua jenjang job role ini.' },
    { key: 'kind', header: 'Jenis', aliases: ['jenis kompetensi', 'kind', 'tipe'], example: 'jabatan', help: 'jabatan atau inti. Kosong = jabatan bila Job Role diisi.' },
    { key: 'name', header: 'Kompetensi', required: true, aliases: ['nama kompetensi', 'competency', 'kompetensi'], example: 'Memahami kontrak proyek' },
    { key: 'definition', header: 'Definisi', aliases: ['deskripsi', 'definition'], example: 'Mampu membaca SLA dan ruang lingkup kontrak' },
    { key: 'indicators', header: 'Indikator', aliases: ['indikator perilaku', 'indicators'], example: 'Menjelaskan SLA; Menemukan klausul penalti', help: 'Pisahkan dengan titik koma.' },
    { key: 'requiredScore', header: 'Skor Minimal', aliases: ['skor minimum', 'target skor', 'required score', 'standar'], example: 3, help: '0-4, default 3.' },
    { key: 'importance', header: 'Kepentingan', aliases: ['bobot', 'importance', 'prioritas'], example: 4, help: '1-5, default 3.' },
    { key: 'source', header: 'Sumber', aliases: ['source', 'asal'], example: 'dacum', help: 'aturan hr (default), dacum, cca, atau keduanya.' },
    { key: 'code', flag: B4_FLAG, header: 'Kode', aliases: ['kode modul', 'kode kompetensi', 'code'], example: 'ST-B4', help: 'Kode modul, unik per job role. Butuh Job Role.' },
    { key: 'stream', flag: B4_FLAG, header: 'Rumpun', aliases: ['stream', 'kelompok', 'rumpun kompetensi'], example: 'Specific Technical' },
    { key: 'programTier', flag: B4_FLAG, header: 'Level Program', aliases: ['level', 'tingkat', 'tingkat program', 'bia'], example: 'basic', help: 'basic (B), intermediate (I), atau advanced (A). Menentukan kurikulum dan tahap pengembangan.' },
    { key: 'jobFunctions', flag: B4_FLAG, header: 'Job Function', aliases: ['jf', 'no jf', 'nomor job function'], example: '1; 3', help: 'Nomor job function jabatan ini, pisahkan dengan titik koma. Impor Job function dulu.' },
  ],
  async context({ stores, tenantId }) {
    const [roles, comps] = await Promise.all([stores.dna.listJobRoles(tenantId), stores.dna.listCompetencies(tenantId)]);
    const keyOf = (c) => `${c.jobRoleId || ''}|${c.careerLevelId || ''}|${c.name.trim().toLowerCase()}`;
    const jobFunctions = new Map(); // jobRoleId -> Map(nomor -> id)
    for (const r of roles) jobFunctions.set(r.id, new Map((await stores.dna.listJobFunctions(tenantId, r.id)).map((f) => [f.order, f.id])));
    const codeKey = (jobRoleId, code) => `${jobRoleId}|${code.trim().toLowerCase()}`;
    const codes = new Map(comps.filter((c) => c.code).map((c) => [codeKey(c.jobRoleId, c.code), c.id]));
    return { roles, existing: new Map(comps.map((c) => [keyOf(c), { id: c.id, kind: c.kind, code: c.code, stream: c.stream, programTier: c.programTier }])), keyOf, seen: new Set(), jobFunctions, codeKey, codes };
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
    // R1 review egm: file lama memakai judul "Level" untuk jenjang karier. Nilai yang bukan B/I/A tetapi cocok
    // dengan nama jenjang job role (dan kolom Jenjang kosong) dibaca sebagai Jenjang.
    if (v.blank(row.careerLevel) && !v.blank(row.programTier) && !v.choice(row.programTier, TIER_CHOICES) && jr
      && jr.levels.some((l) => l.name.trim().toLowerCase() === v.text(row.programTier).toLowerCase())) {
      row = { ...row, careerLevel: row.programTier, programTier: null };
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
    // --- kolom B4 ---
    const code = v.text(row.code) || null;
    if (code && !jobRoleId) return { error: 'Kode butuh Job Role' };
    if (code && code.length > 32) return { error: 'Kode maksimal 32 karakter' };
    const stream = v.text(row.stream) || null;
    if (stream && stream.length > 64) return { error: 'Rumpun maksimal 64 karakter' };
    const programTier = v.blank(row.programTier) ? null : v.choice(row.programTier, TIER_CHOICES);
    if (!v.blank(row.programTier) && !programTier) return { error: 'Level Program harus basic, intermediate, atau advanced' };
    let jobFunctionIds = null; // null = kolom kosong, pemetaan tidak disentuh
    if (!v.blank(row.jobFunctions)) {
      if (!jobRoleId || kind !== 'job') return { error: 'Job Function hanya untuk kompetensi jabatan' };
      const known = ctx.jobFunctions.get(jobRoleId);
      const numbers = v.text(row.jobFunctions).split(/[;,]/).map((s) => s.trim().replace(/^jf\s*/i, '')).filter(Boolean).map((s) => v.integer(s));
      if (!numbers.length) return { error: 'Job Function berisi nomor, pisahkan dengan titik koma' };
      const bad = numbers.find((n) => !known.has(n));
      if (bad !== undefined) return { error: Number.isNaN(bad) ? 'Job Function berisi nomor, pisahkan dengan titik koma' : `Job function nomor ${bad} belum ada di job role ${jr.name}` };
      jobFunctionIds = [...new Set(numbers.map((n) => known.get(n)))];
    }
    const key = ctx.keyOf({ jobRoleId, careerLevelId, name });
    const found = ctx.existing.get(key);
    const existingId = found ? found.id : undefined;
    // A12: kind kompetensi yang sudah ada menang atas kolom Jenis di file
    if (found && jobFunctionIds && found.kind !== 'job') return { error: 'Job Function hanya untuk kompetensi jabatan' };
    const hasB4 = Boolean(code || stream || programTier || jobFunctionIds);
    if (existingId && !hasB4) return { error: 'Kompetensi ini sudah ada di kamus' };
    if (ctx.seen.has(key)) return { error: 'Kompetensi muncul lebih dari sekali di file' };
    if (code) {
      const ck = ctx.codeKey(jobRoleId, code);
      const owner = ctx.codes.get(ck);
      const self = existingId || `baris:${key}`; // baris baru dikenali lewat kunci kamusnya
      if (owner !== undefined && owner !== self) return { error: `Kode ${code} sudah dipakai kompetensi lain di job role ini` };
      ctx.codes.set(ck, self);
    }
    ctx.seen.add(key);
    if (existingId) {
      // §7: hanya kolom yang benar-benar berubah masuk patch, supaya impor ulang file yang sama tidak mereset pengesahan
      const patch = {};
      if (code && code !== found.code) patch.code = code;
      if (stream && stream !== found.stream) patch.stream = stream;
      if (programTier && programTier !== found.programTier) patch.programTier = programTier;
      if (!Object.keys(patch).length && !jobFunctionIds) return { error: 'Kompetensi ini sudah ada di kamus (tidak ada perubahan)' };
      return { value: { id: existingId, patch, jobFunctionIds } };
    }
    const indicators = v.text(row.indicators).split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
    return { value: { jobRoleId, careerLevelId, kind, name, definition: v.text(row.definition) || null, indicators, requiredScore, importance, source, code, stream, programTier, jobFunctionIds } };
  },
  async commit({ stores, tenantId, values }) {
    let created = 0; let updated = 0;
    for (const { jobFunctionIds, ...c } of values) {
      let id = c.id;
      if (id) { if (Object.keys(c.patch).length) await stores.dna.updateCompetency(tenantId, id, c.patch); updated += 1; } else { id = (await stores.dna.createCompetency(tenantId, c)).id; created += 1; }
      if (jobFunctionIds) await stores.dna.setCompetencyJobFunctions(tenantId, id, jobFunctionIds);
    }
    return { competencies: created, updated };
  },
};
