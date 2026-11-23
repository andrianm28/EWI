'use strict';
// B11: satu-satunya tempat aturan "siapa admin tenant" dan "peran apa yang boleh ia berikan".
const { ROLES, ALL_ROLES } = require('../../core/rbac/roles');
const { forbidden, unauthorized } = require('../../core/errors');

// Peran Admin Tenant (K2). Baru bisa disimpan di users.role setelah paket B2 menambahkannya.
const TENANT_ADMIN = 'tenant_admin';
// SEMENTARA sampai B2 masuk: pengelola tenant dari onboarding (PK-13) berperan hr_admin.
// Setelah B2, kosongkan daftar ini (lihat docs/designs/b11-admin-tenant.md bagian 4.2).
const INTERIM_ADMIN_ROLES = Object.freeze([ROLES.HR_ADMIN]);

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
  return role === ROLES.ETA_ADMIN || role === TENANT_ADMIN || INTERIM_ADMIN_ROLES.includes(role);
}

const isInterimAdmin = (user) => !!user && INTERIM_ADMIN_ROLES.includes(user.role);

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

/** Peran yang boleh diberikan admin tenant: semua kecuali Super Admin (eta_admin). */
const assignableRoles = (actor = null) => ALL_ROLES.filter((r) => r !== ROLES.ETA_ADMIN && !(r === TENANT_ADMIN && isInterimAdmin(actor)));
/**
 * Audit 23 Nov: pengelola interim (peran aktif di INTERIM_ADMIN_ROLES, mis. hr_admin) tidak boleh memberi peran
 * Admin Tenant atau mengubah akun Admin Tenant. Tanpa batas ini HR bisa menaikkan siapa pun (termasuk email yang ia
 * kuasai) menjadi admin tenant, melewati aturan B2 "hanya Admin Tenant yang memberi peran". Menghapus masa interim
 * sendiri menunggu keputusan user/Andrian (docs/designs/b11-admin-tenant.md bagian 4.2).
 */
function assertCanGrant(actor, role) {
  if (role === TENANT_ADMIN && isInterimAdmin(actor)) {
    throw forbidden('ROLE_FORBIDDEN', 'Peran Admin Tenant hanya bisa diberikan oleh Admin Tenant');
  }
}
/** target: { role, roles? } dari tenantAdmin.actor (roles = peran utama + user_roles). */
function assertCanManage(actor, target) {
  const roles = target ? (Array.isArray(target.roles) ? target.roles : [target.role]) : [];
  if (roles.includes(TENANT_ADMIN) && isInterimAdmin(actor)) {
    throw forbidden('ROLE_FORBIDDEN', 'Akun Admin Tenant hanya bisa diubah oleh Admin Tenant');
  }
}
const roleLabel = (role) => ROLE_LABELS[role] || role;

module.exports = { TENANT_ADMIN, isTenantAdmin, requireTenantAdmin, assignableRoles, roleLabel, assertCanGrant, assertCanManage };
