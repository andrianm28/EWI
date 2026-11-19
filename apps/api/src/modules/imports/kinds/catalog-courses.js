'use strict';
// PK-18: daftar course Moodle sebagai katalog statis + pemetaan course -> kompetensi (P1-8 bagian statis).
// Impor ulang dengan Kode Course yang sama memperbarui course dan mengganti pemetaannya.
// Setelah disimpan, rencana training 'perlu modul' yang kompetensinya kini punya course langsung terisi.
const v = require('../values');
const { TIER_CHOICES } = require('./common');
const { merge, DEFAULTS } = require('../../../core/settings');

const ACTIVE_CHOICES = { active: ['aktif', 'ya', 'tampil', 'visible', '1', 'true'], inactive: ['nonaktif', 'tidak aktif', 'tidak', 'disembunyikan', 'hidden', '0', 'false'] };
const STATIC_SOURCES = ['moodle'];

module.exports = {
  key: 'catalog_courses',
  label: 'Katalog course',
  description: 'Daftar course LMS (Moodle) dan kompetensi yang dilatihnya. Dipakai rencana training untuk menunjuk course.',
  submodules: ['tna', 'dna'],
  fields: [
    { key: 'courseRef', header: 'Kode Course', required: true, aliases: ['id course', 'course id', 'shortname', 'short name', 'kode', 'kode kursus', 'idnumber', 'id number'], example: 'SDL1-101', help: 'Kode unik course di Moodle (shortname atau ID).' },
    { key: 'title', header: 'Judul Course', required: true, aliases: ['nama course', 'fullname', 'full name', 'judul', 'nama kursus', 'course name', 'course'], example: 'Membaca SLA dan Kontrak Layanan' },
    { key: 'competencies', header: 'Kompetensi', aliases: ['kompetensi terkait', 'competency', 'competencies', 'nama kompetensi'], example: 'Memahami kontrak proyek', help: 'Nama kompetensi persis seperti di Kamus kompetensi; pisahkan dengan titik koma. Kosong = course masuk katalog tanpa pemetaan.' },
    { key: 'programTier', header: 'Program', aliases: ['learning program', 'tier', 'level program'], example: 'basic', help: 'Opsional: basic/dasar, intermediate/menengah, advanced/lanjutan.' },
    { key: 'url', header: 'Tautan', aliases: ['url', 'link', 'course url', 'tautan course'], example: 'https://lms.perusahaan.co.id/course/view.php?id=101', help: 'Opsional: alamat course di Moodle.' },
    { key: 'category', header: 'Kategori', aliases: ['category', 'kategori course'], example: 'Service Delivery' },
    { key: 'active', header: 'Status', aliases: ['aktif', 'visible', 'status course'], example: 'aktif', help: 'aktif (default) atau nonaktif. Course nonaktif tidak diusulkan ke rencana training.' },
  ],
  async context({ stores, tenantId }) {
    const comps = await stores.dna.listCompetencies(tenantId);
    const byName = new Map();
    for (const c of comps) {
      const k = c.name.trim().toLowerCase();
      byName.set(k, [...(byName.get(k) || []), c.id]);
    }
    return { byName, seen: new Set() };
  },
  validate(row, ctx) {
    const courseRef = v.text(row.courseRef); const title = v.text(row.title);
    if (!courseRef) return { error: 'Kode Course wajib diisi' };
    if (!title) return { error: 'Judul Course wajib diisi' };
    if (courseRef.length > 128) return { error: 'Kode Course paling panjang 128 karakter' };
    if (title.length > 255) return { error: 'Judul Course paling panjang 255 karakter' };
    if (ctx.seen.has(courseRef.toLowerCase())) return { error: 'Kode Course muncul lebih dari sekali di file' };
    const programTier = v.blank(row.programTier) ? null : v.choice(row.programTier, TIER_CHOICES);
    if (!v.blank(row.programTier) && !programTier) return { error: 'Program harus basic, intermediate, atau advanced' };
    const active = v.blank(row.active) ? 'active' : v.choice(row.active, ACTIVE_CHOICES);
    if (!active) return { error: 'Status harus aktif atau nonaktif' };
    const url = v.text(row.url) || null;
    if (url && !/^https?:\/\/\S+$/i.test(url)) return { error: 'Tautan harus diawali http:// atau https://' };
    const names = v.text(row.competencies).split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
    const competencyIds = [];
    for (const n of names) {
      const ids = ctx.byName.get(n.toLowerCase());
      if (!ids) return { error: `Kompetensi "${n}" belum ada di kamus (impor Kamus kompetensi dulu)` };
      competencyIds.push(...ids);
    }
    ctx.seen.add(courseRef.toLowerCase());
    return { value: { ref: courseRef, title, url, category: v.text(row.category) || null, programTier, active: active === 'active', competencyIds: [...new Set(competencyIds)] } };
  },
  async commit({ stores, tenantId, values, batchId }) {
    const { created, updated } = await stores.catalog.upsertItems(tenantId, values, { source: 'moodle', batchId });
    const conf = merge(DEFAULTS, (await stores.settings.getTenantSettings(tenantId)) || {});
    const sources = (conf.lms.targets || []).filter((s) => STATIC_SOURCES.includes(s));
    const plansMatched = await stores.catalog.rematchNeedsModule(tenantId, sources);
    return { courses: values.length, created, updated, mapped: values.filter((x) => x.competencyIds.length).length, plansMatched };
  },
};
