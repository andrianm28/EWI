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

/** Semua peran user: `role` tunggal hari ini, ditambah `roles` bila B2 memakai daftar. */
function rolesOf(user) {
  if (!user) return [];
  return [user.role, ...(Array.isArray(user.roles) ? user.roles : [])].filter(Boolean);
}

function isTenantAdmin(user) {
  const roles = rolesOf(user);
  return roles.includes(ROLES.ETA_ADMIN) || roles.includes(TENANT_ADMIN) || roles.some((r) => INTERIM_ADMIN_ROLES.includes(r));
}

const denied = () => forbidden('ROLE_FORBIDDEN', 'Layar ini hanya untuk Admin Tenant');

/**
 * Gerbang Admin Tenant. Peran di token bisa sudah basi (token berlaku sampai 8 jam), padahal layar ini memberi
 * peran. Karena itu peran dan status pelaku dibaca ulang dari DB di setiap request: admin yang diturunkan atau
 * dinonaktifkan langsung kehilangan akses ke sini. store: { actor(tenantId, userId) -> { role, status } | null }
 */
function requireTenantAdmin(store) {
  return async (req, _res, next) => {
    try {
      if (!req.user) return next(unauthorized());
      if (!isTenantAdmin(req.user)) return next(denied());
      const actor = await store.actor(req.tenantId, req.user.id);
      if (!actor || actor.status !== 'active' || !isTenantAdmin(actor)) return next(denied());
      return next();
    } catch (e) { return next(e); }
  };
}

/** Peran yang boleh diberikan admin tenant: semua kecuali Super Admin (eta_admin). */
const assignableRoles = () => ALL_ROLES.filter((r) => r !== ROLES.ETA_ADMIN);
const roleLabel = (role) => ROLE_LABELS[role] || role;

module.exports = { TENANT_ADMIN, isTenantAdmin, requireTenantAdmin, assignableRoles, roleLabel };
