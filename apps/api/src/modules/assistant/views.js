'use strict';
// B17 Asisten ELGOS: tampilan peran, penolakan pasti, kode samaran, dan penyamaran nama di pertanyaan.
// Spek: docs/designs/b17-asisten-elgos.md
const { HttpError, badRequest } = require('../../core/errors');
const { ROLES } = require('../../core/rbac/roles');

// Kunci dan label tampilan mengikuti B0 §5.1 (docs/designs/b0-fondasi-ui.md)
const VIEW_LABEL = Object.freeze({ karyawan: 'Karyawan', atasan: 'Atasan', hr: 'HR / L&D', super: 'Super Admin' });

// Peran akun -> label dan tampilan yang boleh (bawaan lebih dulu), sama dengan pemetaan B0 §5.1 dan aturan K2.
// Super Admin memakai fakta tampilan hr sampai layar Tenant (B12) ada, seperti butir peralihan B0.
const ROLE_VIEWS = Object.freeze({
  [ROLES.LEARNER]: { label: 'Karyawan', views: ['karyawan'] },
  [ROLES.SME]: { label: 'SME', views: ['karyawan'] },
  [ROLES.SUPERVISOR]: { label: 'Atasan', views: ['atasan', 'karyawan'] },
  [ROLES.PIMPINAN]: { label: 'Pimpinan', views: ['atasan', 'karyawan'] },
  [ROLES.ROLE_LEADER]: { label: 'Role leader', views: ['atasan', 'karyawan'] },
  [ROLES.HR_ADMIN]: { label: 'HR / L&D', views: ['hr', 'karyawan'] },
  [ROLES.ETA_ADMIN]: { label: 'Super Admin', views: ['super'] },
});

/** Tampilan yang menentukan penyusun fakta: super memakai fakta hr (peralihan B0). */
const factView = (view) => (view === 'super' ? 'hr' : view);

function resolveView(role, asked) {
  // Peran tak dikenal -> karyawan (hak paling sempit, B0 §5.1)
  const conf = ROLE_VIEWS[role] || ROLE_VIEWS[ROLES.LEARNER];
  if (asked !== undefined && asked !== null && asked !== '' && !VIEW_LABEL[asked]) {
    throw badRequest(`view harus ${Object.keys(VIEW_LABEL).join(', ')}`);
  }
  const view = asked || conf.views[0];
  if (!conf.views.includes(view)) throw new HttpError(403, 'VIEW_FORBIDDEN', 'Tampilan ini tidak tersedia untuk peran Anda');
  return {
    view,
    // label peran untuk tampilan bawaan, label tampilan bila pengguna memilih tampilan lain
    roleLabel: view === conf.views[0] ? conf.label : VIEW_LABEL[view],
    views: conf.views.map((key) => ({ key, label: VIEW_LABEL[key] })),
  };
}

// Penghemat panggilan, bukan pengaman utama (pengaman utama = susunan fakta). Lihat spek untuk contoh.
const OTHERS = /\b(karyawan|pegawai)\s+[a-z]\b|\b(teman|rekan)(\s+(kerja|tim|saya))?\b|\borang\s+lain\b|\bgaji\s+(dia|mereka|teman|rekan|orang|karyawan)\b/i;
const mentionsOthers = (question) => OTHERS.test(String(question || ''));

/**
 * Kode samaran per pertanyaan: model hanya melihat [[ORANG_1]], [[ORANG_2]], ...; server mengembalikan nama sesudahnya.
 * Bentuknya sengaja tidak mungkin muncul alami: istilah seperti "K3" (Keselamatan dan Kesehatan Kerja) tidak tersentuh.
 */
const OTHER_PERSON = '[[ORANG_LAIN]]';
function createAliases() {
  const byId = new Map(); const byCode = new Map();
  return {
    alias(person) {
      if (byId.has(person.id)) return byId.get(person.id);
      const code = `[[ORANG_${byId.size + 1}]]`;
      byId.set(person.id, code);
      byCode.set(code, { id: person.id, name: person.name });
      return code;
    },
    lookup: (code) => byCode.get(code) || null,
    userIds: () => [...byId.keys()],
  };
}

function restoreNames(text, aliases) {
  const userIds = new Set();
  const out = String(text).replace(/\[\[ORANG_\d+\]\]/g, (m) => {
    const p = aliases.lookup(m);
    if (!p) return m;
    userIds.add(p.id);
    return p.name || '(tanpa nama)';
  }).split(OTHER_PERSON).join('orang lain');
  return { text: out, userIds: [...userIds] };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termRe = (term, flags) => new RegExp(`(^|[^\\p{L}])(${escapeRe(term)})(?![\\p{L}])`, flags);

/**
 * Samarkan nama orang di teks pertanyaan sebelum dikirim ke model. people = pengguna tenant ({ id, name }).
 * Nama lengkap (huruf besar/kecil bebas) dan nama depan berhuruf kapital (minimal 4 huruf) diganti dengan
 * aliasFor(person) bila ada (anggota tim pada tampilan atasan), selain itu [[ORANG_LAIN]].
 * Sisa risiko: ejaan lain dan nama panggilan tidak tersamarkan (spek bagian Risiko).
 */
function maskNames(text, people, aliasFor = () => null) {
  const terms = [];
  for (const p of people || []) {
    const name = String(p.name || '').trim();
    if (name.length < 3) continue;
    terms.push({ re: termRe(name, 'giu'), p, len: name.length });
    const first = name.split(/\s+/)[0];
    if (first !== name && first.length >= 4 && /^\p{Lu}/u.test(first)) terms.push({ re: termRe(first, 'gu'), p, len: first.length });
  }
  terms.sort((a, b) => b.len - a.len);
  let out = String(text);
  for (const t of terms) out = out.replace(t.re, (m, pre) => `${pre}${aliasFor(t.p) || OTHER_PERSON}`);
  return out;
}

module.exports = { resolveView, factView, mentionsOthers, createAliases, restoreNames, maskNames, ROLE_VIEWS, VIEW_LABEL, OTHER_PERSON };
