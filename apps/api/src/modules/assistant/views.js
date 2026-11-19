'use strict';
// B17 Asisten ELGOS: tampilan peran, penolakan pasti, dan kode samaran. Spek: docs/designs/b17-asisten-elgos.md
const { HttpError, badRequest } = require('../../core/errors');
const { ROLES } = require('../../core/rbac/roles');

const VIEW_LABEL = { karyawan: 'Karyawan', atasan: 'Atasan', hr: 'HR' };

// Peran akun -> label, tampilan bawaan, tampilan yang boleh (bawaan lebih dulu)
const ROLE_VIEWS = {
  [ROLES.LEARNER]: { label: 'Karyawan', views: ['karyawan'] },
  [ROLES.SUPERVISOR]: { label: 'Atasan', views: ['atasan', 'karyawan'] },
  [ROLES.HR_ADMIN]: { label: 'HR', views: ['hr', 'karyawan'] },
  // requireRole(HR_ADMIN) meloloskan Admin ETA di seluruh kode, jadi asisten mengikutinya (tercatat di audit)
  [ROLES.ETA_ADMIN]: { label: 'Admin ETA', views: ['hr', 'karyawan'] },
  [ROLES.PIMPINAN]: { label: 'Pimpinan', views: ['karyawan'] },
  [ROLES.ROLE_LEADER]: { label: 'Role leader', views: ['karyawan'] },
  [ROLES.SME]: { label: 'SME', views: ['karyawan'] },
};

/**
 * Paket lain menambah tampilan (mis. B11 Admin Tenant, B12 Super Admin). roles: { <peran>: { label?, isDefault? } }.
 * Fakta tampilan itu didaftarkan lewat registerFactBuilder di facts.js.
 */
function registerView(key, label, roles) {
  if (VIEW_LABEL[key]) throw new Error(`Tampilan sudah ada: ${key}`);
  VIEW_LABEL[key] = label;
  for (const [role, opt = {}] of Object.entries(roles || {})) {
    const conf = ROLE_VIEWS[role] || (ROLE_VIEWS[role] = { label: opt.label || label, views: [] });
    if (opt.isDefault) { conf.views.unshift(key); if (opt.label) conf.label = opt.label; } else conf.views.push(key);
  }
}

function resolveView(role, asked) {
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

/** Kode samaran per pertanyaan: model hanya melihat K1, K2, ...; server mengembalikan nama sesudahnya. */
function createAliases() {
  const byId = new Map(); const byCode = new Map();
  return {
    alias(person) {
      if (byId.has(person.id)) return byId.get(person.id);
      const code = `K${byId.size + 1}`;
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
  const out = String(text).replace(/\bK(\d+)\b/g, (m) => {
    const p = aliases.lookup(m);
    if (!p) return m;
    userIds.add(p.id);
    return p.name || '(tanpa nama)';
  });
  return { text: out, userIds: [...userIds] };
}

module.exports = { resolveView, mentionsOthers, createAliases, restoreNames, registerView, ROLE_VIEWS, VIEW_LABEL };
