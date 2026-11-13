'use strict';
// Jenjang & program (RG-1): job role, urutan jenjang, dan Learning Program yang wajib dilulusi per jenjang.
// Hanya membuat job role baru; job role yang sudah ada diubah lewat layar DNA.
const v = require('../values');
const { TIER_CHOICES } = require('./common');

module.exports = {
  key: 'dna_job_levels',
  label: 'Jenjang & program',
  description: 'Job role, jenjang karier dari terendah, dan program (Basic/Intermediate/Advanced) per jenjang.',
  submodules: ['dna'],
  fields: [
    { key: 'jobRole', header: 'Job Role', required: true, aliases: ['jabatan', 'posisi', 'job role'], example: 'Service Delivery L1' },
    { key: 'division', header: 'Divisi', aliases: ['departemen', 'unit', 'division'], example: 'Service Delivery' },
    { key: 'level', header: 'Jenjang', required: true, aliases: ['level', 'grade', 'jenjang karier'], example: 'Junior' },
    { key: 'order', header: 'Urutan', aliases: ['no', 'urutan jenjang', 'order'], example: 2, help: '1 = jenjang terendah. Kosong = mengikuti urutan baris.' },
    { key: 'programTier', header: 'Program Wajib', aliases: ['program', 'learning program', 'tier program'], example: 'basic', help: 'basic/dasar, intermediate/menengah, advanced/lanjutan, atau kosong.' },
  ],
  async context({ stores, tenantId }) {
    return { existing: await stores.dna.listJobRoles(tenantId), seen: new Set() };
  },
  validate(row, ctx) {
    const jobRole = v.text(row.jobRole); const level = v.text(row.level);
    if (!jobRole || !level) return { error: 'Job Role dan Jenjang wajib diisi' };
    if (ctx.existing.some((r) => r.name.trim().toLowerCase() === jobRole.toLowerCase())) return { error: `Job role "${jobRole}" sudah ada; ubah lewat layar DNA` };
    const key = `${jobRole.toLowerCase()}|${level.toLowerCase()}`;
    if (ctx.seen.has(key)) return { error: 'Jenjang muncul lebih dari sekali untuk job role ini' };
    const order = v.blank(row.order) ? null : v.integer(row.order);
    if (order !== null && (Number.isNaN(order) || order < 1)) return { error: 'Urutan harus bilangan bulat mulai 1' };
    const programTier = v.blank(row.programTier) ? null : v.choice(row.programTier, TIER_CHOICES);
    if (!v.blank(row.programTier) && !programTier) return { error: 'Program Wajib harus basic, intermediate, atau advanced' };
    ctx.seen.add(key);
    return { value: { jobRole, division: v.text(row.division) || null, level, order, programTier } };
  },
  async commit({ stores, tenantId, values }) {
    const groups = new Map();
    values.forEach((x, i) => {
      const k = x.jobRole.toLowerCase();
      if (!groups.has(k)) groups.set(k, { name: x.jobRole, division: x.division, levels: [] });
      groups.get(k).levels.push({ ...x, i });
    });
    const created = [];
    for (const g of groups.values()) {
      const levels = g.levels.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.i - b.i)
        .map((l) => ({ name: l.level, programTier: l.programTier }));
      created.push(await stores.dna.createJobRole(tenantId, { name: g.name, division: g.division, levels }));
    }
    return { jobRoles: created.length, levels: values.length };
  },
};
