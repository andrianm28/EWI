'use strict';
// B11: satu-satunya tempat aturan "siapa admin tenant" dan "peran apa yang boleh ia berikan".
const { ROLES, ALL_ROLES } = require('../../core/rbac/roles');
const { forbidden, unauthorized } = require('../../core/errors');

// Peran Admin Tenant (K2, B2). Masa interim hr_admin dicabut 24 Nov (keputusan user, review PR #8):
// hanya tenant_admin dan Super Admin yang mengelola tenant (docs/designs/b11-admin-tenant.md bagian 4.2).
const TENANT_ADMIN = ROLES.TENANT_ADMIN;

const ROLE_LABELS = Object.freeze({
  [ROLES.ETA_ADMIN]: 'Super Admin',
  [TENANT_ADMIN]: 'Admin Tenant',
  [ROLES.HR_ADMIN]: 'HR / L&D',
  [ROLES.SUPERVISOR]: 'Atasan',
  [ROLES.LEARNER]: 'Karyawan',
  [ROLES.PIMPINAN]: 'Pimpinan',
  [ROLES.ROLE_LEADER]: 'Role Leader',
  [ROLES.SME]: 'Narasumber (SME)',
});

/**
 * Kontrak B2 (docs/designs/b2-peran.md): otorisasi hanya dari peran AKTIF (`user.role`). Daftar `user.roles`
 * (peran yang boleh dipilih lewat ganti peran) tidak pernah meloloskan akses.
 */
function isTenantAdmin(user) {
  const role = user && user.role;
  return role === ROLES.ETA_ADMIN || role === TENANT_ADMIN;
}

const denied = () => forbidden('ROLE_FORBIDDEN', 'Layar ini hanya untuk Admin Tenant');

/**
 * Gerbang Admin Tenant. Peran di token bisa sudah basi (token berlaku sampai 8 jam), padahal layar ini memberi
 * peran. Karena itu peran dan status pelaku dibaca ulang dari DB di setiap request: admin yang diturunkan atau
 * dinonaktifkan langsung kehilangan akses ke sini. store: { actor(tenantId, userId) -> { role, roles?, status } | null }
 */
function requireTenantAdmin(store) {
  return async (req, _res, next) => {
    try {
      if (!req.user) return next(unauthorized());
      if (!isTenantAdmin(req.user)) return next(denied());
      const actor = await store.actor(req.tenantId, req.user.id);
      // peran aktif di token harus masih diberikan di DB: users.role, atau daftar peran akun setelah B2
      const assigned = actor && (Array.isArray(actor.roles) ? actor.roles : [actor.role]);
      if (!actor || actor.status !== 'active' || !assigned.includes(req.user.role)) return next(denied());
      return next();
    } catch (e) { return next(e); }
  };
}

/**
 * Peran yang boleh diberikan pelaku. Admin Tenant: semua kecuali Super Admin (eta_admin).
 * Super Admin: hanya Admin Tenant (pemulihan tenant tanpa pengelola). Ia tidak boleh membuat atau menaikkan akun
 * ke peran yang membaca isi data karyawan, karena itu jalan pintas melewati aturan inti 24 Nov (review malam, R8-1).
 */
const assignableRoles = (actor) => (actor && actor.role === ROLES.ETA_ADMIN
  ? [ROLES.TENANT_ADMIN]
  : ALL_ROLES.filter((r) => r !== ROLES.ETA_ADMIN));
const roleLabel = (role) => ROLE_LABELS[role] || role;

module.exports = { isTenantAdmin, requireTenantAdmin, assignableRoles, roleLabel };
