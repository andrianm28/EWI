'use strict';
// B9: satu-satunya tempat aturan "siapa melihat apa" di Improvement Needs.
// K1 (= PM-6): HR melihat secara bawaan; atasan langsung hanya bila HR memberinya akses (bisa dicabut, diaudit).
// K-2: pimpinan hanya melihat angka ringkasan, tanpa baris tindakan.
const { ROLES } = require('../../core/rbac');
const { scopeFor } = require('../../core/rbac/scope');
const { forbidden } = require('../../core/errors');

const LEVELS = Object.freeze({ MANAGE: 'manage', READ: 'read', SUMMARY: 'summary' });

/**
 * -> { level: 'manage'|'read'|'summary'|null, scope?, reason? }
 * stores: { tna.hasNonTrainingGrant, people.directReportIds }
 */
async function inaAccess(req, stores) {
  const { role, id } = req.user;
  if (role === ROLES.HR_ADMIN || role === ROLES.ETA_ADMIN) return { level: LEVELS.MANAGE, scope: { all: true } };
  if (role === ROLES.PIMPINAN) return { level: LEVELS.SUMMARY, scope: { all: true } };
  if (role === ROLES.SUPERVISOR) {
    if (!(await stores.tna.hasNonTrainingGrant(req.tenantId, id))) return { level: null, reason: 'NO_INA_ACCESS' };
    // aturan arsitektur 4: dirinya dan bawahan langsung
    return { level: LEVELS.READ, scope: await scopeFor(req, stores.people) };
  }
  return { level: null, reason: 'ROLE_FORBIDDEN' };
}

function denied(access) {
  return access.reason === 'NO_INA_ACCESS'
    ? forbidden('NO_INA_ACCESS', 'HR belum memberi Anda akses ke tindakan perbaikan')
    : forbidden('ROLE_FORBIDDEN', 'Tindakan perbaikan hanya untuk HR dan atasan yang diberi akses');
}

/** Ambil akses dan tolak bila levelnya tidak termasuk `levels`. */
async function requireLevel(req, stores, levels) {
  const access = await inaAccess(req, stores);
  if (!access.level) throw denied(access);
  if (!levels.includes(access.level)) throw forbidden('ROLE_FORBIDDEN', 'Anda tidak punya akses untuk tindakan ini');
  return access;
}

module.exports = { LEVELS, inaAccess, requireLevel };
