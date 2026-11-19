'use strict';
// B13: library modul Knowledge/Skill/Attitude (KSA) dari DACUM Tool 2. Satu baris = satu butir KSA.
// Nama, level, rumpun, tujuan, jabatan, dan kompetensi diambil dari baris pertama tiap Kode Modul; baris berikutnya
// boleh kosong, tetapi bila diisi harus sama. Atomik per modul: satu baris modul itu ditolak -> semua barisnya ditolak,
// supaya impor ulang tidak diam-diam menghapus butir. Modul yang tidak ada di berkas tidak dihapus.
const v = require('../values');
const { TIER_CHOICES } = require('./common');

const KIND_CHOICES = { K: ['k', 'knowledge', 'pengetahuan'], S: ['s', 'skill', 'keterampilan', 'ketrampilan'], A: ['a', 'attitude', 'sikap', 'sikap kerja'] };
const LEVEL_CHOICES = { basic: ['basic', 'b', ...TIER_CHOICES.basic], intermediate: ['intermediate', 'i', ...TIER_CHOICES.intermediate], advanced: ['advanced', 'a', ...TIER_CHOICES.advanced] };
const key = (s) => v.text(s).replace(/\s+/g, ' ').toLowerCase();
const list = (s) => v.text(s).split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
const same = (a, b) => key(a) === key(b);

/** Validasi semua baris satu modul. Return { error } atau { module }. */
function checkGroup(rows, ctx) {
  const first = rows[0];
  const code = v.text(first.code).toUpperCase(); // kode disimpan huruf besar agar impor ulang tidak menggandakan modul
  if (code.length > 32) return { error: 'Kode Modul paling panjang 32 karakter' };
  const name = v.text(first.name);
  if (!name) return { error: `Nama Modul wajib diisi di baris pertama modul ${code}` };
  if (name.length > 255) return { error: 'Nama Modul paling panjang 255 karakter' };
  const level = v.choice(first.level, LEVEL_CHOICES);
  if (!level) return { error: `Level modul ${code} harus basic, intermediate, atau advanced (baris pertama modul)` };
  const stream = v.text(first.stream).replace(/\s+/g, ' ');
  if (stream.length > 128) return { error: 'Rumpun paling panjang 128 karakter' };
  const jobRoleIds = [];
  for (const n of list(first.jobRoles)) {
    const id = ctx.jobRoles.get(key(n));
    if (!id) return { error: `Jabatan "${n}" belum ada (impor Jabatan dan jenjang dulu)` };
    jobRoleIds.push(id);
  }
  const competencyIds = [];
  for (const n of list(first.competencies)) {
    const ids = ctx.competencies.get(key(n));
    if (!ids) return { error: `Kompetensi "${n}" belum ada di kamus (impor Kamus kompetensi dulu)` };
    competencyIds.push(...ids);
  }
  const items = []; const seen = new Set();
  for (const r of rows) {
    for (const [f, label] of [['name', 'Nama Modul'], ['stream', 'Rumpun'], ['objective', 'Tujuan'], ['jobRoles', 'Jabatan'], ['competencies', 'Kompetensi']]) {
      if (!v.blank(r[f]) && !same(r[f], first[f])) return { error: `${label} modul ${code} berbeda antar baris (isi sama dengan baris pertama, atau kosongkan)` };
    }
    if (!v.blank(r.level) && v.choice(r.level, LEVEL_CHOICES) !== level) return { error: `Level modul ${code} berbeda antar baris` };
    const kind = v.choice(r.itemKind, KIND_CHOICES);
    if (!kind) return { error: 'Tipe Butir harus K, S, atau A (Knowledge, Skill, Attitude)' };
    const text = v.text(r.itemText);
    if (!text) return { error: 'Butir wajib diisi' };
    if (text.length > 1000) return { error: 'Butir paling panjang 1000 karakter' };
    const k = `${kind}:${key(text)}`;
    if (seen.has(k)) return { error: `Butir "${text.slice(0, 60)}" muncul lebih dari sekali di modul ${code}` };
    seen.add(k);
    items.push({ kind, text });
  }
  return { module: { code, name, level, stream: stream || null, objective: v.text(first.objective) || null, jobRoleIds: [...new Set(jobRoleIds)], competencyIds: [...new Set(competencyIds)], items } };
}

module.exports = {
  key: 'li_modules',
  label: 'Library modul (KSA)',
  description: 'Modul belajar dari DACUM Tool 2: satu baris per butir Knowledge, Skill, atau Attitude. Dipakai Learning Intervention.',
  submodules: ['li'],
  fields: [
    { key: 'code', header: 'Kode Modul', required: true, aliases: ['kode', 'module code', 'kode course', 'code'], example: 'ST-A2', help: 'Kode unik modul. Baris dengan kode yang sama menjadi satu modul.' },
    { key: 'name', header: 'Nama Modul', aliases: ['nama', 'judul modul', 'module', 'module name', 'modul'], example: 'Root Cause Analysis & Post-Incident Report', help: 'Wajib di baris pertama tiap modul.' },
    { key: 'level', header: 'Level', aliases: ['program', 'level program', 'tier'], example: 'advanced', help: 'basic, intermediate, atau advanced. Wajib di baris pertama tiap modul.' },
    { key: 'stream', header: 'Rumpun', aliases: ['stream', 'kelompok', 'kategori'], example: 'Specific Technical' },
    { key: 'objective', header: 'Tujuan', aliases: ['tujuan pembelajaran', 'objective', 'learning objective'], example: 'Mampu menemukan akar masalah insiden dan menulis laporan pasca-insiden.' },
    { key: 'jobRoles', header: 'Jabatan', aliases: ['job role', 'jabatan terkait', 'job roles'], example: 'Engineer Service Delivery', help: 'Nama jabatan persis seperti di data Jabatan; pisahkan dengan titik koma.' },
    { key: 'competencies', header: 'Kompetensi', aliases: ['kompetensi terkait', 'competency', 'competencies'], example: 'Root Cause Analysis', help: 'Opsional: nama kompetensi di Kamus kompetensi (pisahkan dengan titik koma). Dipakai untuk prioritas Pareto.' },
    { key: 'itemKind', header: 'Tipe Butir', required: true, aliases: ['tipe', 'ksa', 'jenis butir', 'type'], example: 'S', help: 'K (Knowledge), S (Skill), atau A (Attitude).' },
    { key: 'itemText', header: 'Butir', required: true, aliases: ['butir ksa', 'item', 'uraian', 'deskripsi butir'], example: 'Menyusun kronologi insiden dari log dan tiket' },
  ],
  async context({ stores, tenantId, rows }) {
    const [roles, comps] = await Promise.all([stores.dna.listJobRoles(tenantId), stores.dna.listCompetencies(tenantId)]);
    const ctx = { jobRoles: new Map(roles.map((r) => [key(r.name), r.id])), competencies: new Map(), results: new Map() };
    for (const c of comps) ctx.competencies.set(key(c.name), [...(ctx.competencies.get(key(c.name)) || []), c.id]);
    const groups = new Map();
    for (const row of rows) {
      if (!row) continue;
      const code = key(row.code);
      if (!code) { ctx.results.set(row, { error: 'Kode Modul wajib diisi' }); continue; }
      groups.set(code, [...(groups.get(code) || []), row]);
    }
    for (const group of groups.values()) {
      const res = checkGroup(group, ctx);
      // nilai modul hanya dibawa baris pertama; baris lain cukup lolos
      group.forEach((row, i) => ctx.results.set(row, res.error ? { error: res.error } : { value: i === 0 ? res.module : { partOf: res.module.code } }));
    }
    return ctx;
  },
  validate(row, ctx) {
    return ctx.results.get(row) || { error: 'Kode Modul wajib diisi' };
  },
  async commit({ stores, tenantId, values, batchId }) {
    const modules = values.filter((x) => x.items);
    const { created, updated, items } = await stores.li.upsertModules(tenantId, modules, { batchId });
    return { modules: modules.length, created, updated, items };
  },
};
